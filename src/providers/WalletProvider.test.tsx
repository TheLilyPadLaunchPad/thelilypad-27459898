import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSolanaSignIn } from '../auth/solanaWalletAuth';

// Module mocks must not leak into the app's other tests.
if (process.env['LILYPAD_WALLET_RETRY_TEST_WORKER'] !== '1') {
  test('wallet sign-in retry integration checks', () => {
    execFileSync(process.execPath, ['test', import.meta.filename], {
      env: { ...process.env, LILYPAD_WALLET_RETRY_TEST_WORKER: '1' },
      stdio: 'pipe',
    });
  });
} else {
// Load only the test mocking API, not Bun's browser-conflicting global types.
const bunTestModule: string = 'bun:test';
const { mock } = await import(bunTestModule) as {
  mock: { module: (specifier: string, factory: () => Record<string, unknown>) => void };
};
const address = '11111111111111111111111111111111';
let signingCalls = 0;
let modalCalls = 0;
let rejected = false;
let failure = 'Request rejected';
let namespace = 'solana';
let connected = true;
let providerReady = true;
let analyticsEvents: { name: string; properties: Record<string, unknown> }[] = [];
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  location: { pathname: '/admin' },
  __lovableEvents: { track: (name: string, properties: Record<string, unknown>) => {
    analyticsEvents.push({ name, properties }); return null;
  } },
} });
const provider = {
  publicKey: { toBase58: () => address, toString: () => address },
  signMessage: async () => {
    signingCalls++;
    if (rejected) throw new Error(failure);
    return new Uint8Array(64).fill(7);
  },
};
const auth = {
  getSession: async () => ({ data: { session: null } }),
  signInWithWeb3: async ({ wallet }: { wallet: ReturnType<typeof import('../auth/solanaWalletAuth').adaptSolanaWallet> }) => {
    await wallet.signMessage(new TextEncoder().encode('Test sign-in'));
    return { data: { session: {}, user: {} }, error: null };
  },
} as unknown as SupabaseClient['auth'];
const signIn = createSolanaSignIn(auth);
const open = async () => { modalCalls++; };
const disconnect = async () => {};
const switchNetwork = async () => {};
const solanaNetwork = { id: 'solana-mainnet', name: 'Solana', chainNamespace: 'solana' };
const evmNetwork = { id: 143, name: 'Monad', chainNamespace: 'eip155' };

// Render the real provider; only wallet/Cloud/RPC boundaries are simulated.
mock.module('@reown/appkit/react', () => ({
  useAppKit: () => ({ open }),
  useDisconnect: () => ({ disconnect }),
  useAppKitAccount: () => ({ address: connected ? address : undefined, isConnected: connected, status: connected ? 'connected' : 'disconnected' }),
  useAppKitProvider: (chainNamespace: string) => ({ walletProvider: chainNamespace === 'solana' && providerReady ? provider : undefined }),
  useAppKitNetwork: () => ({ caipNetwork: namespace === 'solana' ? solanaNetwork : evmNetwork, chainId: namespace === 'solana' ? 'solana-mainnet' : 143, switchNetwork }),
}));
mock.module('@reown/appkit/networks', () => ({ solana: solanaNetwork, solanaDevnet: {}, solanaTestnet: {} }));
mock.module('@/integrations/reown/appkit', () => ({ REOWN_EVM_NETWORKS: {}, evmChainKeyFromId: () => 'monad', areAdminTestNetworksEnabled: () => false }));
mock.module('@/auth/supabaseWeb3', () => ({ signInWithSolana: signIn }));
mock.module('@/integrations/supabase/client', () => ({ supabase: { auth } }));
mock.module('@/config/solana', () => ({ getSolanaRpcUrl: () => 'https://rpc.invalid' }));
mock.module('@solana/web3.js', () => ({ Connection: class { async getBalance() { return 0; } }, PublicKey: class {} }));
mock.module('./ChainProvider', () => ({ useChain: () => ({ chain: { id: 'solana' } }) }));
mock.module('@/config/chains', () => ({ setStoredChain: () => {}, CHAINS: { solana: { networks: { mainnet: {} } } } }));
mock.module('@/lib/evmWallets', () => ({ getEvmBalance: async () => '0', connectEvmChain: async () => {} }));
mock.module('@/lib/joeyWalletConnection', () => ({ connectJoeyWallet: async () => {}, disconnectJoeyWallet: () => {}, isJoeyWalletConnected: () => false }));
mock.module('@/lib/xrplWalletConnect', () => ({ connectXRPLWallet: async () => {} }));
mock.module('sonner', () => ({ toast: { error: () => {}, success: () => {}, info: () => {}, loading: () => {} } }));
mock.module('@/components/ui/button', () => ({ Button: (props: React.ComponentProps<'button'>) => React.createElement('button', props) }));
mock.module('lucide-react', () => ({ Wallet: () => null }));

const { WalletProvider, useWallet } = await import('./WalletProvider');
const { WalletConnectButton } = await import('../components/WalletConnectButton');
let wallet: ReturnType<typeof useWallet> | undefined;
function Probe() {
  wallet = useWallet();
  return null;
}
const currentWallet = () => {
  assert.ok(wallet);
  return wallet;
};
async function render(children?: React.ReactNode) {
  signingCalls = 0;
  modalCalls = 0;
  analyticsEvents = [];
  wallet = undefined;
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => { renderer = TestRenderer.create(<WalletProvider><Probe />{children}</WalletProvider>); });
  assert.ok(renderer);
  return renderer;
}

for (const error of ['Request rejected', 'Invalid signature']) {
  test(`Connect retries ${error} without reconnecting the Solana wallet`, async () => {
    rejected = true;
    failure = error;
    const renderer = await render();
    try {
      assert.equal(currentWallet().isConnected, false);
      assert.equal(currentWallet().isConnecting, false);
      assert.equal(signingCalls, 1);
      rejected = false;
      await act(async () => { await currentWallet().connect('reown', 'solana'); });
      assert.equal(currentWallet().isConnected, true);
      assert.equal(currentWallet().address, address);
      assert.equal(currentWallet().isConnecting, false);
      assert.equal(signingCalls, 2);
      assert.equal(modalCalls, 0);
    } finally {
      await act(async () => { renderer.unmount(); });
    }
  });
}

test('repeated failed retries release the Connect action and concurrent retries share signing', async () => {
  rejected = true;
  const renderer = await render();
  try {
    await act(async () => { await currentWallet().connect(); });
    assert.equal(signingCalls, 2);
    assert.equal(currentWallet().isConnected, false);
    assert.equal(currentWallet().isConnecting, false);
    rejected = false;
    await act(async () => { await Promise.all([currentWallet().connect(), currentWallet().connect()]); });
    assert.equal(signingCalls, 3);
    assert.equal(currentWallet().isConnected, true);
    assert.equal(modalCalls, 0);
  } finally {
    await act(async () => { renderer.unmount(); });
  }
});

test('legacy Connect callers also retry Solana sign-in', async () => {
  rejected = true;
  const renderer = await render();
  try {
    rejected = false;
    await act(async () => { await currentWallet().connectWithOAuth('google'); });
    assert.equal(signingCalls, 2);
    assert.equal(currentWallet().isConnected, true);
    assert.equal(modalCalls, 0);
  } finally {
    await act(async () => { renderer.unmount(); });
  }
});

test('the alternate WalletConnect button retries instead of bypassing wallet authentication', async () => {
  rejected = true;
  const renderer = await render(<WalletConnectButton />);
  try {
    rejected = false;
    await act(async () => { renderer.root.findByType('button').props.onClick(); });
    assert.equal(signingCalls, 2);
    assert.equal(currentWallet().isConnected, true);
    assert.equal(modalCalls, 0);
  } finally {
    await act(async () => { renderer.unmount(); });
  }
});

test('disconnected wallets still open Reown instead of attempting sign-in', async () => {
  connected = false;
  const renderer = await render();
  try {
    await act(async () => { await currentWallet().connect(); });
    assert.equal(signingCalls, 0);
    assert.equal(modalCalls, 1);
    assert.equal(currentWallet().isConnected, false);
  } finally {
    connected = true;
    await act(async () => { renderer.unmount(); });
  }
});

test('EVM connections do not trigger Solana signing', async () => {
  namespace = 'eip155';
  const renderer = await render();
  try {
    assert.equal(currentWallet().isConnected, true);
    assert.equal(currentWallet().chainType, 'monad');
    await act(async () => { await currentWallet().connect(); });
    assert.equal(signingCalls, 0);
    assert.equal(modalCalls, 1);
  } finally {
    namespace = 'solana';
    await act(async () => { renderer.unmount(); });
  }
});

test('a not-yet-ready Solana provider does not strand later retries', async () => {
  providerReady = false;
  rejected = false;
  const renderer = await render();
  try {
    await act(async () => { await currentWallet().connect(); });
    assert.equal(currentWallet().isConnected, false);
    assert.equal(currentWallet().isConnecting, false);
    assert.equal(signingCalls, 0);
    providerReady = true;
    await act(async () => { renderer.update(<WalletProvider><Probe /></WalletProvider>); });
    assert.equal(currentWallet().isConnected, true);
    assert.equal(signingCalls, 1);
  } finally {
    providerReady = true;
    await act(async () => { renderer.unmount(); });
  }
});

test('wallet connection counts actual transport once, separately from failure and successful retry', async () => {
  rejected = true;
  failure = 'Request rejected';
  const renderer = await render();
  try {
    assert.equal(currentWallet().isConnected, false);
    assert.equal(analyticsEvents.filter(e => e.name === 'project.wallet_connected').length, 1);
    assert.deepEqual(analyticsEvents[0], { name: 'project.wallet_connected', properties: { chain: 'solana', connector: 'reown', entry_point: 'admin' } });
    rejected = false;
    await act(async () => { await currentWallet().connect(); });
    assert.equal(currentWallet().isConnected, true);
    assert.deepEqual(analyticsEvents.map(e => e.name), [
      'project.wallet_connected', 'project.wallet_signature_requested', 'project.wallet_authentication_failed',
      'project.wallet_signature_requested', 'project.wallet_sign_in_succeeded',
    ]);
    assert.equal(analyticsEvents[3].properties.retry, true);
    assert.equal(JSON.stringify(analyticsEvents).includes(address), false);
    await act(async () => { renderer.update(<WalletProvider><Probe /></WalletProvider>); });
    assert.equal(analyticsEvents.filter(e => e.name === 'project.wallet_connected').length, 1);
  } finally {
    await act(async () => { renderer.unmount(); });
  }
});

test('opening a Connect modal alone is not a wallet connection event', async () => {
  connected = false;
  const renderer = await render();
  try {
    await act(async () => { await currentWallet().connect(); });
    assert.equal(modalCalls, 1);
    assert.deepEqual(analyticsEvents, []);
  } finally {
    connected = true;
    await act(async () => { renderer.unmount(); });
  }
});
}