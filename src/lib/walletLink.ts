import type { SupabaseClient } from '@supabase/supabase-js';

export type WalletLinkStatus = 'already_linked' | 'claim' | 'no_profile';

/** Must match the format checked by the `link-wallet` backend function. */
export function buildWalletLinkMessage(userId: string, wallet: string, issuedAt: Date = new Date()): string {
  return `The Lily Pad wallet link\nAccount: ${userId}\nWallet: ${wallet}\nIssued: ${issuedAt.toISOString()}`;
}

export interface WalletLinkSigner {
  chain: 'solana' | 'evm';
  address: string;
  /** Solana provider (signMessage with bytes) or EIP-1193 provider (personal_sign). */
  provider: any;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const toHex = (text: string) => '0x' + Array.from(new TextEncoder().encode(text), b => b.toString(16).padStart(2, '0')).join('');

/** Proves wallet ownership with a free signature and attaches the wallet's saved profile to the signed-in account. */
export async function linkWalletToAccount(client: SupabaseClient<any>, signer: WalletLinkSigner): Promise<WalletLinkStatus> {
  const { data: { session } } = await client.auth.getSession();
  if (!session || session.user.is_anonymous) throw new Error('Sign in with your email first.');
  if (!signer.provider) throw new Error('Your wallet is not ready yet. Please reconnect it.');
  const message = buildWalletLinkMessage(session.user.id, signer.address);
  let signature: string;
  if (signer.chain === 'solana') {
    const signed = await signer.provider.signMessage(new TextEncoder().encode(message));
    const bytes: Uint8Array = signed instanceof Uint8Array ? signed : signed?.signature;
    if (!(bytes instanceof Uint8Array)) throw new Error('Your wallet did not return a signature.');
    signature = toBase64(bytes);
  } else {
    signature = await signer.provider.request({ method: 'personal_sign', params: [toHex(message), signer.address] });
  }
  const { data, error } = await client.functions.invoke('link-wallet', {
    body: { chain: signer.chain, address: signer.address, message, signature },
  });
  if (error) {
    let detail: string | undefined;
    try { detail = (await (error as any).context?.json?.())?.error; } catch { /* keep generic message */ }
    throw new Error(detail || 'Could not link this wallet. Please try again.');
  }
  if (data?.error) throw new Error(data.error);
  return data.status as WalletLinkStatus;
}
