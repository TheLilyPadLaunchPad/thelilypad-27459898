import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNFTListingIdentifier } from './nftListingIdentifier';

test('Solana listing approves the stored asset even without a collection contract', () => {
  assert.equal(getNFTListingIdentifier({ asset_id: 'core-asset' }, 'solana'), 'core-asset');
});

test('Solana asset address takes precedence over legacy token and collection addresses', () => {
  assert.equal(getNFTListingIdentifier({
    asset_id: 'core-asset',
    nft_token_id: 'legacy-token',
    collection: { contract_address: 'collection-address' },
  }, 'solana'), 'core-asset');
});

test('Solana can use a legacy token address but never the collection address', () => {
  assert.equal(getNFTListingIdentifier({ nft_token_id: 'legacy-token' }, 'solana'), 'legacy-token');
  assert.equal(getNFTListingIdentifier({ collection: { contract_address: 'collection-address' } }, 'solana'), null);
});

test('Other chains retain their collection contract identifier', () => {
  assert.equal(getNFTListingIdentifier({ asset_id: 'core-asset', collection: { contract_address: 'evm-contract' } }, 'monad'), 'evm-contract');
});