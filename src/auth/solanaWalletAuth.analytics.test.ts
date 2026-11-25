import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSolanaSignIn, type ReownLikeSolanaProvider } from './solanaWalletAuth';
import catalog from '../../.lovable/events.json';

type Event = { name: string; properties: Record<string, unknown> };
let events: Event[] = [];
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
beforeEach(() => {
  events = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { pathname: '/admin' },
    __lovableEvents: { track: (name: string, properties: Record<string, unknown>) => { events.push({ name, properties }); return null; } },
  } });
});
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});
const address = 'private-wallet-address-never-emit';
const provider: ReownLikeSolanaProvider = {
  publicKey: { toBase58: () => address, toString: () => address },
  signMessage: async () => new Uint8Array(64),
};
const user = { id: 'private-user-id-never-emit', created_at: new Date().toISOString() };
function fakeAuth(overrides: Record<string, unknown> = {}) {
  return {
    getSession: async () => ({ data: { session: null } }),
    signInWithWeb3: async ({ wallet }: { wallet: { signMessage: (bytes: Uint8Array) => Promise<Uint8Array> } }) => {
      await wallet.signMessage(new TextEncoder().encode('Private sign-in message'));
      return { data: { session: { access_token: 'private-token-never-emit' }, user }, error: null };
    },
    ...overrides,
  } as unknown as SupabaseClient['auth'];
}
function roleClient(admin: boolean, error = false) {
  const query = {
    select: (column: string) => { assert.equal(column, 'role'); return query; },
    eq: (column: string, value: string) => {
      assert.equal(value, column === 'user_id' ? user.id : 'admin'); return query;
    },
    abortSignal: () => query,
    maybeSingle: async () => ({ data: admin ? { role: 'admin' } : null, error: error ? { message: 'private lookup error' } : null }),
  };
  return { from: (table: string) => { assert.equal(table, 'user_roles'); return query; } } as unknown as Pick<SupabaseClient, 'from'>;
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('one actual signature and success for concurrent new-account sign-ins; verified admin role and no personal data', async () => {
  const signIn = createSolanaSignIn(fakeAuth(), roleClient(true));
  await Promise.all([signIn(provider), signIn(provider), signIn(provider)]);
  await settle();
  assert.deepEqual(events, [
    { name: 'project.wallet_signature_requested', properties: { chain: 'solana', connector: 'reown', retry: false, entry_point: 'admin' } },
    { name: 'project.wallet_sign_in_succeeded', properties: { chain: 'solana', connector: 'reown', retry: false, entry_point: 'admin', user_role: 'admin', account_status: 'new_account' } },
  ]);
  for (const secret of [address, user.id, 'private-token-never-emit', 'Private sign-in message']) assert.equal(JSON.stringify(events).includes(secret), false);
});

test('cancelled signature emits one failure, then successful retry is labeled without duplicate successes', async () => {
  let rejected = true;
  const signingProvider = { ...provider, signMessage: async () => {
    if (rejected) throw new Error(`User rejected request for ${address}`);
    return new Uint8Array(64);
  } };
  const signIn = createSolanaSignIn(fakeAuth(), roleClient(false));
  assert.equal((await signIn(signingProvider)).ok, false);
  rejected = false;
  assert.equal((await signIn(signingProvider)).ok, true);
  await settle();
  assert.deepEqual(events.map(e => e.name), [
    'project.wallet_signature_requested', 'project.wallet_authentication_failed',
    'project.wallet_signature_requested', 'project.wallet_sign_in_succeeded',
  ]);
  assert.equal(events[1].properties.reason, 'cancelled');
  assert.equal(events[1].properties.retry, false);
  assert.equal(events[2].properties.retry, true);
  assert.equal(events[3].properties.retry, true);
  assert.equal(events[3].properties.user_role, 'regular');
  assert.equal(JSON.stringify(events).includes(address), false);
});

test('verified session revalidation is not a signature request or a new sign-in success', async () => {
  const signIn = createSolanaSignIn(fakeAuth({
    getSession: async () => ({ data: { session: {} } }),
    getUser: async () => ({ data: { user: { user_metadata: { address } } } }),
  }));
  assert.equal((await signIn(provider)).ok, true);
  assert.deepEqual(events, []);
});

test('invalid signature is classified without sending signature bytes or wallet details', async () => {
  const signIn = createSolanaSignIn(fakeAuth());
  assert.equal((await signIn({ ...provider, signMessage: async () => new Uint8Array(10) })).ok, false);
  assert.equal(events.filter(e => e.name === 'project.wallet_authentication_failed').length, 1);
  assert.equal(events[1].properties.reason, 'invalid_signature');
});

test('backend network failure is classified without sending its raw error', async () => {
  const signIn = createSolanaSignIn(fakeAuth({ signInWithWeb3: async () => {
    throw new Error(`Failed to fetch private endpoint for ${address}`);
  } }));
  assert.equal((await signIn(provider)).ok, false);
  assert.deepEqual(events, [{ name: 'project.wallet_authentication_failed', properties: {
    chain: 'solana', connector: 'reown', retry: false, entry_point: 'admin', stage: 'web3_sign_in', reason: 'network_error',
  } }]);
});

test('backend signature rejection is auth failure, not a user cancellation', async () => {
  const signIn = createSolanaSignIn(fakeAuth({ signInWithWeb3: async () => ({
    data: {}, error: { message: 'Test server rejected signature', code: 'validation_failed' },
  }) }));
  assert.equal((await signIn(provider)).ok, false);
  assert.equal(events[0].properties.reason, 'auth_error');
  assert.equal(events[0].properties.stage, 'web3_sign_in');
});

test('missing session is failure, never sign-in success', async () => {
  const signIn = createSolanaSignIn(fakeAuth({ signInWithWeb3: async () => ({ data: { session: null, user: null }, error: null }) }));
  assert.equal((await signIn(provider)).ok, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'project.wallet_authentication_failed');
  assert.equal(events[0].properties.reason, 'session_missing');
});

test('failed role lookup keeps successful auth and reports unknown role, not regular or admin', async () => {
  const signIn = createSolanaSignIn(fakeAuth(), roleClient(true, true));
  assert.equal((await signIn(provider)).ok, true);
  await settle();
  assert.equal(events[1].properties.user_role, 'unknown');
  assert.equal(events.filter(e => e.name === 'project.wallet_authentication_failed').length, 0);
});

test('new-account cohort is first 24 hours; older accounts are existing and missing dates stay unknown', async () => {
  for (const [created_at, expected] of [
    [new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), 'existing_account'],
    [undefined, 'unknown'],
  ]) {
    events = [];
    const signIn = createSolanaSignIn(fakeAuth({ signInWithWeb3: async () => ({ data: { session: {}, user: { ...user, created_at } }, error: null }) }));
    assert.equal((await signIn(provider)).ok, true);
    await settle();
    assert.equal(events[0].properties.account_status, expected);
  }
});

test('unavailable or throwing analytics cannot break authentication or signing', async () => {
  Reflect.deleteProperty(globalThis, 'window');
  assert.equal((await createSolanaSignIn(fakeAuth())(provider)).ok, true);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { pathname: '/' }, __lovableEvents: { track: () => { throw new Error('Collector unavailable'); } },
  } });
  assert.equal((await createSolanaSignIn(fakeAuth())(provider)).ok, true);
});

test('all four wallet events are registered with closed schemas and emitted properties match', async () => {
  assert.deepEqual(Object.keys(catalog.events).filter(name => name.startsWith('project.wallet_')).sort(), [
    'project.wallet_authentication_failed', 'project.wallet_connected',
    'project.wallet_sign_in_succeeded', 'project.wallet_signature_requested',
  ]);
  const signIn = createSolanaSignIn(fakeAuth(), roleClient(true));
  await signIn({ ...provider, signMessage: async () => { throw new Error('Request rejected'); } });
  await signIn(provider);
  await settle();
  const samples = [...events, { name: 'project.wallet_connected', properties: {
    chain: 'solana', connector: 'reown', entry_point: 'admin',
  } }];
  for (const event of samples) {
    assert.ok(Object.prototype.hasOwnProperty.call(catalog.events, event.name));
    const definition = catalog.events[event.name as keyof typeof catalog.events];
    const schema = definition.properties_schema as {
      additionalProperties: boolean; required: string[];
      properties: Record<string, { type: string; enum?: unknown[] }>;
    };
    assert.equal(schema.additionalProperties, false);
    for (const required of schema.required) assert.ok(Object.prototype.hasOwnProperty.call(event.properties, required));
    for (const [key, value] of Object.entries(event.properties)) {
      assert.ok(Object.prototype.hasOwnProperty.call(schema.properties, key), `${event.name}: unexpected ${key}`);
      assert.equal(typeof value, schema.properties[key].type);
      if (schema.properties[key].enum) assert.ok(schema.properties[key].enum?.includes(value));
    }
  }
});