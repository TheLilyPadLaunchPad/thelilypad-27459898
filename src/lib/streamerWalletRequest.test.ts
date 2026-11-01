import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestStreamerWallet } from './streamerWalletRequest';

const session = { access_token: 'test-only-session', user: { id: 'test-user' }, expires_at: Date.now() / 1000 + 3600 };
const wallet = { wallet_address: 'test-wallet', display_name: 'Streamer' };

test('signed-out tipping never invokes the protected function with a guest key', async () => {
  let calls = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session: null }, error: null }), refreshSession: async () => ({ data: { session: null }, error: null }) },
    functions: { invoke: async () => { calls++; return { data: wallet, error: null }; } },
  };
  await assert.rejects(requestStreamerWallet(client, 'streamer'), /sign in again/);
  assert.equal(calls, 0);
});

test('signed-in tipping explicitly supplies the session authorization', async () => {
  let authorized = false;
  const client = {
    auth: { getSession: async () => ({ data: { session }, error: null }), refreshSession: async () => ({ data: { session }, error: null }) },
    functions: { invoke: async (_name: string, options: { headers: { Authorization: string } }) => {
      authorized = options.headers.Authorization === `Bearer ${session.access_token}`;
      return { data: wallet, error: null };
    } },
  };
  assert.deepEqual(await requestStreamerWallet(client, 'streamer'), wallet);
  assert.equal(authorized, true);
});

test('an expired session refreshes before any wallet lookup', async () => {
  const order: string[] = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { ...session, expires_at: 1 } }, error: null }),
      refreshSession: async () => { order.push('refresh'); return { data: { session }, error: null }; },
    },
    functions: { invoke: async () => { order.push('invoke'); return { data: wallet, error: null }; } },
  };
  await requestStreamerWallet(client, 'streamer');
  assert.deepEqual(order, ['refresh', 'invoke']);
});

test('a rejected session retries once and then returns a recoverable sign-in error', async () => {
  let calls = 0;
  let refreshes = 0;
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      refreshSession: async () => { refreshes++; return { data: { session }, error: null }; },
    },
    functions: { invoke: async () => { calls++; return { data: null, error: { message: 'Unauthorized', context: new Response('{}', { status: 401 }) } }; } },
  };
  await assert.rejects(requestStreamerWallet(client, 'streamer'), /sign in again/);
  assert.equal(calls, 2);
  assert.equal(refreshes, 1);
});

test('a refreshed session successfully recovers a rejected lookup', async () => {
  let calls = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session }, error: null }), refreshSession: async () => ({ data: { session }, error: null }) },
    functions: { invoke: async () => ++calls === 1
      ? { data: null, error: { message: 'Unauthorized', context: new Response('{}', { status: 401 }) } }
      : { data: wallet, error: null } },
  };
  assert.deepEqual(await requestStreamerWallet(client, 'streamer'), wallet);
  assert.equal(calls, 2);
});