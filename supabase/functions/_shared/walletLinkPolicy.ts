// Pure rules for linking a wallet's saved profile to an email account.
// No runtime-specific imports so the project's tests can load this file.

export const LINK_MAX_AGE_MS = 10 * 60 * 1000;
export const LINK_PREFIX = "The Lily Pad wallet link";

export function validateWalletLinkMessage(
  message: string,
  expected: { userId: string; wallet: string; now: number },
): string | null {
  const lines = message.split("\n");
  if (lines.length !== 4 || lines[0] !== LINK_PREFIX) return "Unexpected message";
  if (lines[1] !== `Account: ${expected.userId}`) return "Message is for a different account";
  if (lines[2] !== `Wallet: ${expected.wallet}`) return "Message is for a different wallet";
  const issued = Date.parse(lines[3].replace(/^Issued: /, ""));
  if (!lines[3].startsWith("Issued: ") || Number.isNaN(issued)) return "Unexpected message";
  if (Math.abs(expected.now - issued) > LINK_MAX_AGE_MS) return "Signature expired, please sign again";
  return null;
}

export type WalletLinkDecision =
  | "already_linked" | "claim" | "no_profile" | "wallet_taken" | "account_has_other_wallet";

export function decideWalletLink(input: {
  callerId: string;
  /** Saved profile for the signed wallet, if any. */
  walletProfile: { user_id: string | null; ownerIsGuest: boolean } | null;
  /** Wallet on the profile the caller already owns, if any. */
  callerProfileWallet: string | null;
  wallet: string;
}): WalletLinkDecision {
  const { callerId, walletProfile, callerProfileWallet, wallet } = input;
  if (walletProfile?.user_id === callerId) return "already_linked";
  if (callerProfileWallet && callerProfileWallet.toLowerCase() !== wallet.toLowerCase()) return "account_has_other_wallet";
  if (!walletProfile) return "no_profile";
  // Only profiles with no owner or a guest owner may move; never one held by another email account.
  if (walletProfile.user_id === null || walletProfile.ownerIsGuest) return "claim";
  return "wallet_taken";
}
