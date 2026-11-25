import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATOR_PATHS, isSitePathLocked } from '../src/lib/siteAccess';

test('referral program and its leaderboard remain open during lockdown', () => {
  for (const path of ['/waitroom', '/referrals', '/leaderboard']) assert.equal(isSitePathLocked(path, true, false), false);
});
test('all five generators and their directory remain open during lockdown', () => {
  assert.equal(GENERATOR_PATHS.length, 5);
  for (const path of ['/generators', ...GENERATOR_PATHS]) assert.equal(isSitePathLocked(path, true, false), false);
});
test('other visitor features are locked including public deep links and collection creation', () => {
  for (const path of ['/', '/marketplace', '/streams', '/wallet/gallery', '/transactions', '/collection/123', '/u/creator', '/launchpad/create/solana/music', '/launchpad/art-generator/extra']) assert.equal(isSitePathLocked(path, true, false), true);
});
test('verified admins keep access to all pages', () => {
  for (const path of ['/admin', '/marketplace', '/launchpad/create/solana']) assert.equal(isSitePathLocked(path, true, true), false);
});
test('sign-in and profile setup stay available for referral onboarding', () => {
  for (const path of ['/auth', '/auth/callback', '/profile-setup', '/admin/login']) assert.equal(isSitePathLocked(path, true, false), false);
});
test('disabling lockdown restores normal navigation', () => {
  assert.equal(isSitePathLocked('/marketplace', false, false), false);
});
test('profile settings are reachable without opening other profile pages', () => {
  assert.equal(isSitePathLocked('/profile/settings', true, false), false);
  assert.equal(isSitePathLocked('/edit-profile', true, false), true);
});