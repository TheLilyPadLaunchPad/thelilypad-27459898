import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWalletLinkMessage } from '../src/lib/walletLink';
import { decideWalletLink, validateWalletLinkMessage, LINK_MAX_AGE_MS } from '../supabase/functions/_shared/walletLinkPolicy';

const me = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const wallet = 'So1anaWa11etAddre55';
const now = Date.parse('2026-11-26T09:00:00Z');

test('the app builds the exact message the backend accepts', () => {
  assert.equal(validateWalletLinkMessage(buildWalletLinkMessage(me, wallet, new Date(now)), { userId: me, wallet, now }), null);
});

test('a signature made for another account or wallet is rejected', () => {
  const message = buildWalletLinkMessage(me, wallet, new Date(now));
  assert.notEqual(validateWalletLinkMessage(message, { userId: other, wallet, now }), null);
  assert.notEqual(validateWalletLinkMessage(message, { userId: me, wallet: 'AnotherWallet', now }), null);
});

test('a signature older than ten minutes is rejected', () => {
  const message = buildWalletLinkMessage(me, wallet, new Date(now));
  assert.equal(LINK_MAX_AGE_MS, 600_000);
  assert.equal(validateWalletLinkMessage(message, { userId: me, wallet, now: now + 600_000 }), null);
  assert.notEqual(validateWalletLinkMessage(message, { userId: me, wallet, now: now + 600_001 }), null);
});

test('existing profiles with no owner or a guest owner move to the email account', () => {
  assert.equal(decideWalletLink({ callerId: me, walletProfile: { user_id: null, ownerIsGuest: false }, callerProfileWallet: null, wallet }), 'claim');
  assert.equal(decideWalletLink({ callerId: me, walletProfile: { user_id: other, ownerIsGuest: true }, callerProfileWallet: null, wallet }), 'claim');
});

test('a profile held by another email account can never be taken', () => {
  assert.equal(decideWalletLink({ callerId: me, walletProfile: { user_id: other, ownerIsGuest: false }, callerProfileWallet: null, wallet }), 'wallet_taken');
});

test('an account keeps one wallet: a second wallet is refused, the same one is a no-op', () => {
  assert.equal(decideWalletLink({ callerId: me, walletProfile: { user_id: null, ownerIsGuest: false }, callerProfileWallet: 'FirstWallet', wallet }), 'account_has_other_wallet');
  assert.equal(decideWalletLink({ callerId: me, walletProfile: { user_id: me, ownerIsGuest: false }, callerProfileWallet: wallet, wallet }), 'already_linked');
  assert.equal(decideWalletLink({ callerId: me, walletProfile: null, callerProfileWallet: null, wallet }), 'no_profile');
});
