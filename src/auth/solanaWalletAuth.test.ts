import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { adaptSolanaWallet, createSolanaSignIn } from './solanaWalletAuth';

const address = '11111111111111111111111111111111';
const signature = new Uint8Array(64).fill(7);
const provider = () => ({ publicKey: { toBase58: () => address, toString: () => address }, signMessage: async () => signature });

test('Reown byte signing adapter exposes the publicKey API required by Web3 Auth', async () => {
  const message = new TextEncoder().encode('Solana sign-in');
  const walletProvider = provider();
  walletProvider.signMessage = async function (...args: Uint8Array[]) {
    assert.equal(this, walletProvider);
    assert.equal(args.length, 1);
    assert.equal(args[0], message);
    return signature;
  };
  const wallet = adaptSolanaWallet(walletProvider);
  assert.equal(wallet.publicKey.toBase58(), address);
  assert.equal(await wallet.signMessage(message), signature);
});

test('wrapped Phantom signatures are normalized and invalid signatures fail', async () => {
  assert.equal(await adaptSolanaWallet({ ...provider(), signMessage: async () => ({ signature }) }).signMessage(new Uint8Array()), signature);
  await assert.rejects(adaptSolanaWallet({ ...provider(), signMessage: async () => new Uint8Array(10) }).signMessage(new Uint8Array()), /invalid Solana signature/);
});

const fakeAuth = (overrides: Record<string, unknown> = {}) => ({
  getSession: async () => ({ data: { session: null } }),
  getUser: async () => ({ data: { user: null } }),
  signOut: async () => ({ error: null }),
  signInWithWeb3: async () => ({ data: { session: {}, user: {} }, error: null }),
  ...overrides,
}) as unknown as SupabaseClient['auth'];

test('new-user concurrent sign-in requests share one operation', async () => {
  let calls = 0;
  const signIn = createSolanaSignIn(fakeAuth({ signInWithWeb3: async () => { calls++; return { data: { session: {}, user: {} }, error: null }; } }));
  const results = await Promise.all([signIn(provider()), signIn(provider()), signIn(provider())]);
  assert.equal(calls, 1);
  assert.deepEqual(results, Array(3).fill({ ok: true, address }));
});

test('existing verified wallet keeps its account without signing again', async () => {
  let calls = 0;
  const signIn = createSolanaSignIn(fakeAuth({
    getSession: async () => ({ data: { session: {} } }),
    getUser: async () => ({ data: { user: { user_metadata: { address } } } }),
    signInWithWeb3: async () => { calls++; throw new Error('unexpected signing'); },
  }));
  assert.deepEqual(await signIn(provider()), { ok: true, address });
  assert.equal(calls, 0);
});

test('cached metadata cannot bypass server validation for a different wallet', async () => {
  const actions: string[] = [];
  const signIn = createSolanaSignIn(fakeAuth({
    getSession: async () => ({ data: { session: { user: { user_metadata: { address } } } } }),
    getUser: async () => ({ data: { user: { user_metadata: { address: 'different-wallet' } } } }),
    signOut: async () => { actions.push('sign-out'); return { error: null }; },
    signInWithWeb3: async () => { actions.push('sign-in'); return { data: { session: {}, user: {} }, error: null }; },
  }));
  assert.deepEqual(await signIn(provider()), { ok: true, address });
  assert.deepEqual(actions, ['sign-out', 'sign-in']);
});

test('failed sign-in can be retried and a missing session is not success', async () => {
  let calls = 0;
  const signIn = createSolanaSignIn(fakeAuth({ signInWithWeb3: async () => {
    calls++;
    return calls === 1 ? { data: {}, error: { message: 'Request rejected' } } : { data: { session: {}, user: {} }, error: null };
  } }));
  assert.deepEqual(await signIn(provider()), { ok: false, error: 'Request rejected' });
  assert.deepEqual(await signIn(provider()), { ok: true, address });
  const empty = createSolanaSignIn(fakeAuth({ signInWithWeb3: async () => ({ data: { session: null, user: null }, error: null }) }));
  assert.equal((await empty(provider())).ok, false);
});

test('real Auth SDK reaches Web3 token request with Reown signature bytes', async () => {
  let requested = false;
  const client = createClient('https://wallet-auth-test.invalid', 'test-publishable-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      requested = true;
      assert.match(String(url), /token\?grant_type=web3/);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.chain, 'solana');
      assert.match(body.message, new RegExp(address));
      assert.equal(Buffer.from(body.signature, 'base64url').length, 64);
      return new Response(JSON.stringify({ message: 'Test server rejected signature', code: 'validation_failed' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const result = await client.auth.signInWithWeb3({ chain: 'solana', wallet: adaptSolanaWallet(provider()), options: { url: 'https://th3lilypad.com' } });
  assert.equal(requested, true);
  assert.match(result.error?.message ?? '', /Test server rejected signature/);
});