import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWhitelistEligible } from '../src/lib/whitelistEligibility';
const verified = { authenticated: true, walletAddress: 'WalletA', sessionUserId: 'account-a', profileUserId: 'account-a', savedWalletAddress: 'WalletA', profileComplete: true };
test('connected signed-in wallet with a saved account receives WL', () => {
  assert.equal(isWhitelistEligible(verified), true);
});
test('guests and cancelled sign-ins cannot receive WL', () => {
  assert.equal(isWhitelistEligible({ ...verified, authenticated: false }), false);
});
test('wallet connection alone is insufficient without an authenticated session', () => {
  assert.equal(isWhitelistEligible({ ...verified, sessionUserId: null }), false);
});
test('WL requires the wallet address to be collected in the saved account', () => {
  assert.equal(isWhitelistEligible({ ...verified, savedWalletAddress: null }), false);
  assert.equal(isWhitelistEligible({ ...verified, savedWalletAddress: 'WalletB' }), false);
});
test('another account profile and incomplete onboarding cannot grant WL', () => {
  assert.equal(isWhitelistEligible({ ...verified, profileUserId: 'account-b' }), false);
  assert.equal(isWhitelistEligible({ ...verified, profileComplete: false }), false);
});