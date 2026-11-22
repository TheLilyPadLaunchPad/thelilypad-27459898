import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReownLikeSolanaProvider {
  publicKey?: { toBase58?: () => string; toString: () => string };
  signMessage?: (message: Uint8Array) => Promise<Uint8Array | { signature: Uint8Array }>;
}

export type WalletSignInResult = { ok: true; address: string } | { ok: false; error: string };

/** Keep Reown's byte-based signing API and provide Auth's required publicKey API. */
export function adaptSolanaWallet(provider: ReownLikeSolanaProvider) {
  const address = provider.publicKey?.toBase58?.() ?? provider.publicKey?.toString();
  if (!address) throw new Error('Wallet has no public key');
  const signMessage = provider.signMessage;
  if (!signMessage) throw new Error('Wallet does not support message signing');
  return {
    address,
    publicKey: { toBase58: () => address },
    signMessage: async (message: Uint8Array) => {
      const response = await signMessage.call(provider, message);
      const signature = response instanceof Uint8Array ? response : response?.signature;
      if (!(signature instanceof Uint8Array) || signature.length !== 64) {
        throw new Error('Wallet returned an invalid Solana signature');
      }
      return signature;
    },
  };
}

/** One signing operation at a time, including sync effects and explicit retries. */
export function createSolanaSignIn(auth: SupabaseClient['auth']) {
  let pending: { address: string; promise: Promise<WalletSignInResult> } | null = null;

  async function authenticate(provider: ReownLikeSolanaProvider): Promise<WalletSignInResult> {
    try {
      const wallet = adaptSolanaWallet(provider);
      // Revalidate with Auth rather than trusting cached session metadata.
      const { data: { session } } = await auth.getSession();
      if (session) {
        const { data: { user } } = await auth.getUser();
        const address = user?.user_metadata?.address ?? user?.user_metadata?.wallet_address;
        if (user && address === wallet.address) return { ok: true, address: wallet.address };
        // Never carry a previous wallet's identity into the new wallet's profile.
        const { error } = await auth.signOut({ scope: 'local' });
        if (error) return { ok: false, error: error.message };
      }
      const { data, error } = await auth.signInWithWeb3({
        chain: 'solana',
        statement: 'Sign in to The Lily Pad to authenticate with your Solana wallet.',
        wallet,
      });
      if (error) return { ok: false, error: error.message };
      if (!data.session || !data.user) return { ok: false, error: 'Wallet sign-in did not establish a session.' };
      return { ok: true, address: wallet.address };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return async function signIn(provider: ReownLikeSolanaProvider): Promise<WalletSignInResult> {
    const address = provider.publicKey?.toBase58?.() ?? provider.publicKey?.toString();
    if (!address) return { ok: false, error: 'Wallet has no public key' };
    if (pending) {
      if (pending.address === address) return pending.promise;
      await pending.promise;
      return signIn(provider);
    }
    const promise = authenticate(provider);
    const operation = { address, promise };
    pending = operation;
    try {
      return await promise;
    } finally {
      if (pending === operation) pending = null;
    }
  };
}