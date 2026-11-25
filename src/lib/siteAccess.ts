export const GENERATOR_PATHS = [
  '/launchpad/art-generator',
  '/launchpad/xrpl-generator',
  '/launchpad/xrpl-trait-generator',
  '/launchpad/robinhood-trait-generator',
  '/launchpad/apechain-trait-generator',
] as const;

const LIMITED_PATHS = new Set<string>([
  '/generators', '/referrals', '/waitroom', '/leaderboard',
  '/auth', '/auth/callback', '/profile-setup', '/profile-suspended', '/profile/settings',
  '/admin/login', '/admin/reset-password', ...GENERATOR_PATHS,
]);

export function isLimitedAccessPath(pathname: string): boolean {
  return LIMITED_PATHS.has(pathname.replace(/\/$/, '') || '/');
}

export function isSitePathLocked(pathname: string, limited: boolean, isAdmin: boolean): boolean {
  return limited && !isAdmin && !isLimitedAccessPath(pathname);
}