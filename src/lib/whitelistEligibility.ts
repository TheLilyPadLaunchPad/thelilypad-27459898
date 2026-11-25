export function isWhitelistEligible(input: {
  authenticated: boolean;
  walletAddress: string | null;
  sessionUserId: string | null;
  profileUserId: string | null;
  savedWalletAddress: string | null;
  profileComplete: boolean;
}): boolean {
  return input.authenticated && !!input.walletAddress && !!input.sessionUserId &&
    input.sessionUserId === input.profileUserId &&
    input.walletAddress === input.savedWalletAddress && input.profileComplete;
}