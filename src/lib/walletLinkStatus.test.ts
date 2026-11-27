import { test as it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWalletLinkState } from './walletLinkStatus';

const base = { checking: false, accountId: 'acct', walletAddress: 'Wallet1', profile: null, canSign: true };

  it('asks for sign-in before anything else', () => {
    assert.equal(resolveWalletLinkState({ ...base, accountId: null }), 'signed_out');
  });
  it('asks for a wallet when none is connected', () => {
    assert.equal(resolveWalletLinkState({ ...base, walletAddress: null }), 'wallet_not_connected');
  });
  it('needs approval when the connected wallet is not saved to this account', () => {
    assert.equal(resolveWalletLinkState({ ...base, profile: { user_id: null, wallet_address: 'Wallet1' } }), 'approval_needed');
    assert.equal(resolveWalletLinkState({ ...base, profile: { user_id: 'guest', wallet_address: 'Wallet1' } }), 'approval_needed');
  });
  it('is linked only when the profile belongs to this account and this wallet', () => {
    assert.equal(resolveWalletLinkState({ ...base, profile: { user_id: 'acct', wallet_address: 'Wallet1' } }), 'linked');
    assert.equal(resolveWalletLinkState({ ...base, profile: { user_id: 'acct', wallet_address: 'Other' } }), 'approval_needed');
  });
  it('sends a wallet with no saved profile to profile setup', () => {
    assert.equal(resolveWalletLinkState(base), 'profile_needed');
  });
  it('flags wallets that cannot sign the approval', () => {
    assert.equal(resolveWalletLinkState({ ...base, canSign: false, profile: { user_id: null, wallet_address: 'Wallet1' } }), 'unsupported_wallet');
  });
  it('never reports a result while still checking', () => {
    assert.equal(resolveWalletLinkState({ ...base, checking: true, profile: { user_id: 'acct', wallet_address: 'Wallet1' } }), 'checking');
  });
