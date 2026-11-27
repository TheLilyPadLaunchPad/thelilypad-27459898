/** Where a member stands between "has an account" and "wallet saved to that account". */
export type WalletLinkState =
  | 'checking' | 'signed_out' | 'wallet_not_connected' | 'profile_needed'
  | 'approval_needed' | 'unsupported_wallet' | 'linked';

export interface WalletLinkStatusInput {
  /** Still loading the account session or the wallet's saved profile. */
  checking: boolean;
  accountId: string | null;
  walletAddress: string | null;
  /** Saved profile found for the connected wallet, if any. */
  profile: { user_id: string | null; wallet_address: string | null } | null;
  /** The connected wallet can sign the free approval message. */
  canSign: boolean;
}

export function resolveWalletLinkState(input: WalletLinkStatusInput): WalletLinkState {
  const { checking, accountId, walletAddress, profile, canSign } = input;
  if (!accountId) return checking ? 'checking' : 'signed_out';
  if (!walletAddress) return 'wallet_not_connected';
  if (checking) return 'checking';
  if (!profile) return 'profile_needed';
  if (profile.user_id === accountId && profile.wallet_address === walletAddress) return 'linked';
  return canSign ? 'approval_needed' : 'unsupported_wallet';
}

export const WALLET_LINK_COPY: Record<WalletLinkState, { label: string; nextStep: string }> = {
  checking: { label: 'Checking…', nextStep: 'Checking your account and wallet.' },
  signed_out: { label: 'Not signed in', nextStep: 'Sign in with your email first. Your wallet is saved to your account, so the account comes first.' },
  wallet_not_connected: { label: 'Wallet not connected', nextStep: 'Connect the wallet you want saved to your account.' },
  profile_needed: { label: 'Profile needed', nextStep: 'This wallet has no saved profile yet. Finish your profile to save the wallet to your account.' },
  approval_needed: {
    label: 'Approval needed',
    nextStep: 'Your wallet is connected but not saved to your account yet. Press "Link wallet", then approve the message in your wallet. It is free and is not a transaction.',
  },
  unsupported_wallet: { label: 'Wallet cannot approve', nextStep: 'This wallet cannot approve the link here. Connect a Solana or EVM wallet through the Connect button instead.' },
  linked: { label: 'Wallet saved', nextStep: 'Your wallet is connected and saved to your account. Nothing else to do.' },
};
