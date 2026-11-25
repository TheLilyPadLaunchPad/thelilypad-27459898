import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReownLikeSolanaProvider {
  publicKey?: { toBase58?: () => string; toString: () => string };
  signMessage?: (message: Uint8Array) => Promise<Uint8Array | { signature: Uint8Array }>;
}

export type WalletSignInResult = { ok: true; address: string } | { ok: false; error: string };

/** Keep Reown's byte-based signing API and provide Auth's required publicKey API. */
export function adaptSolanaWallet(provider: ReownLikeSolanaProvider, retry = false) {
  const address = provider.publicKey?.toBase58?.() ?? provider.publicKey?.toString();
  if (!address) throw new Error('Wallet has no public key');
  const signMessage = provider.signMessage;
  if (!signMessage) throw new Error('Wallet does not support message signing');
  return {
    address,
    publicKey: { toBase58: () => address },
    signMessage: async (message: Uint8Array) => {
      // Count actual prompts, not sign-in calls that reuse a verified session.
      try {
        if (typeof window !== 'undefined') window.__lovableEvents?.track?.('project.wallet_signature_requested', {
          chain: 'solana', connector: 'reown', retry,
          entry_point: window.location?.pathname.startsWith('/admin') ? 'admin' : 'app',
        });
      } catch { /* Analytics must never interrupt signing. */ }
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
export function createSolanaSignIn(auth: SupabaseClient['auth'], client?: Pick<SupabaseClient, 'from'>) {
  let pending: { address: string; promise: Promise<WalletSignInResult> } | null = null;
  let lastAttemptAddress: string | undefined;
  let failedAttempt = false;

  async function authenticate(provider: ReownLikeSolanaProvider, retry: boolean): Promise<WalletSignInResult> {
    const entryPoint = typeof window !== 'undefined' && window.location?.pathname.startsWith('/admin') ? 'admin' : 'app';
    let stage = 'wallet_adapter';
    try {
      const wallet = adaptSolanaWallet(provider, retry);
      const requestSignature = wallet.signMessage;
      wallet.signMessage = async message => {
        stage = 'signature_request';
        const signature = await requestSignature(message);
        stage = 'web3_sign_in';
        return signature;
      };
      // Revalidate with Auth rather than trusting cached session metadata.
      stage = 'session_check';
      const { data: { session } } = await auth.getSession();
      if (session) {
        const { data: { user } } = await auth.getUser();
        const address = user?.user_metadata?.address ?? user?.user_metadata?.wallet_address;
        if (user && address === wallet.address) return { ok: true, address: wallet.address };
        // Never carry a previous wallet's identity into the new wallet's profile.
        stage = 'sign_out';
        const { error } = await auth.signOut({ scope: 'local' });
        if (error) throw error;
      }
      stage = 'web3_sign_in';
      const { data, error } = await auth.signInWithWeb3({
        chain: 'solana',
        statement: 'Sign in to The Lily Pad to authenticate with your Solana wallet.',
        wallet,
      });
      if (error) throw error;
      if (!data.session || !data.user) {
        stage = 'session_missing';
        throw new Error('Wallet sign-in did not establish a session.');
      }
      const signedInUser = data.user;
      const createdAt = Date.parse(signedInUser.created_at);
      const ageMs = Date.now() - createdAt;
      // "new_account" means the first 24 hours, not a guess from wallet metadata.
      const accountStatus = !Number.isFinite(ageMs) || ageMs < 0 ? 'unknown' : ageMs < 86_400_000 ? 'new_account' : 'existing_account';
      // Enrich after signing without delaying it or changing authorization.
      // Abort a stalled role lookup; an unavailable role remains unknown.
      void (async () => {
        let userRole = 'unknown';
        try {
          if (client && signedInUser.id) {
            const { data: role, error: roleError } = await client.from('user_roles')
              .select('role').eq('user_id', signedInUser.id).eq('role', 'admin')
              .abortSignal(AbortSignal.timeout(3000)).maybeSingle();
            if (!roleError) userRole = role ? 'admin' : 'regular';
          }
        } catch { /* A telemetry lookup failure is not a sign-in failure. */ }
        try {
          if (typeof window !== 'undefined') window.__lovableEvents?.track?.('project.wallet_sign_in_succeeded', {
            chain: 'solana', connector: 'reown', retry, entry_point: entryPoint,
            user_role: userRole, account_status: accountStatus,
          });
        } catch { /* Analytics must never interrupt sign-in. */ }
      })();
      return { ok: true, address: wallet.address };
    } catch (error) {
      const message = error instanceof Error ? error.message :
        error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      const reason = code === 4001 || (stage === 'signature_request' && /reject|cancel|denied|declin/i.test(message)) ? 'cancelled' :
        /invalid.*signature|signature.*invalid/i.test(message) ? 'invalid_signature' :
        /fetch|network|timeout|timed out/i.test(message) ? 'network_error' :
        stage === 'wallet_adapter' ? 'wallet_unavailable' : stage === 'session_missing' ? 'session_missing' : 'auth_error';
      try {
        if (typeof window !== 'undefined') window.__lovableEvents?.track?.('project.wallet_authentication_failed', {
          chain: 'solana', connector: 'reown', retry, entry_point: entryPoint, stage, reason,
        });
      } catch { /* Never send raw errors, signatures, addresses, or tokens. */ }
      return { ok: false, error: message };
    }
  }

  return async function signIn(provider: ReownLikeSolanaProvider): Promise<WalletSignInResult> {
    const address = provider.publicKey?.toBase58?.() ?? provider.publicKey?.toString();
    if (pending) {
      if (pending.address === address) return pending.promise;
      await pending.promise;
      return signIn(provider);
    }
    const retry = lastAttemptAddress === address && failedAttempt;
    lastAttemptAddress = address;
    const promise = authenticate(provider, retry);
    if (!address) return promise;
    const operation = { address, promise };
    pending = operation;
    try {
      const result = await promise;
      failedAttempt = !result.ok;
      return result;
    } finally {
      if (pending === operation) pending = null;
    }
  };
}