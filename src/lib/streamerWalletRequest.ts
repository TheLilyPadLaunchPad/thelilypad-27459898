export interface WalletResponse {
  wallet_address: string;
  display_name: string | null;
}

interface Session {
  access_token: string;
  expires_at?: number;
  user: { id: string };
}

interface WalletLookupClient {
  auth: {
    getSession(): Promise<{ data: { session: Session | null }; error: unknown }>;
    refreshSession(): Promise<{ data: { session: Session | null }; error: unknown }>;
  };
  functions: {
    invoke(name: string, options: { body: { streamer_user_id: string }; headers: { Authorization: string } }): Promise<{
      data: unknown;
      error: { message: string; context?: Response } | null;
    }>;
  };
}

const signInMessage = 'Connect your wallet and sign in again to send a tip.';

export async function requestStreamerWallet(client: WalletLookupClient, streamerUserId: string): Promise<WalletResponse> {
  const current = await client.auth.getSession();
  let session = current.data.session;
  if (current.error || !session?.access_token || !session.user?.id) throw new Error(signInMessage);

  const refresh = async () => {
    const result = await client.auth.refreshSession();
    if (result.error || !result.data.session?.access_token || !result.data.session.user?.id) {
      throw new Error(signInMessage);
    }
    return result.data.session;
  };

  let refreshed = false;
  if (session.expires_at && session.expires_at <= Date.now() / 1000 + 60) {
    session = await refresh();
    refreshed = true;
  }

  const invoke = (signedIn: Session) => client.functions.invoke('get-streamer-wallet', {
    body: { streamer_user_id: streamerUserId },
    headers: { Authorization: `Bearer ${signedIn.access_token}` },
  });
  let result = await invoke(session);
  if (result.error?.context?.status === 401 && !refreshed) {
    session = await refresh();
    result = await invoke(session);
  }

  if (result.error) {
    if (result.error.context?.status === 401) throw new Error(signInMessage);
    const body = await result.error.context?.clone().json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to load the streamer’s tip wallet. Please try again.');
  }

  const data = result.data as Partial<WalletResponse> & { error?: string } | null;
  if (data?.error) throw new Error(data.error);
  if (!data?.wallet_address) throw new Error('This streamer has no wallet configured for tips.');
  return { wallet_address: data.wallet_address, display_name: data.display_name ?? null };
}