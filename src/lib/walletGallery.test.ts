import { test } from 'node:test';
import assert from 'node:assert/strict';
import { galleryNetwork, collectibleExplorer, visibleCollectibles } from './walletGallery';
import type { NFT } from '../hooks/useWalletNFTs';

const nft: NFT = { tokenId: '123', contractAddress: 'assetA', name: 'Lily Sticker', description: '', image: '', collection: 'Pond', attributes: [{ trait_type: 'Pack', value: 'Frogs' }], isCompressed: true };
test('gallery uses mainnet owner indexers and never treats an unsupported wallet as Solana', () => {
  assert.equal(galleryNetwork('solana'), 'solana-mainnet');
  assert.equal(galleryNetwork('robinhood'), 'robinhood-mainnet');
  assert.equal(galleryNetwork('monad'), null);
  assert.equal(galleryNetwork('xrpl'), null);
});
test('compressed assets link to the asset explorer, ERC tokens include their token ID', () => {
  assert.equal(collectibleExplorer(nft, 'solana'), 'https://solscan.io/asset/assetA');
  assert.equal(collectibleExplorer(nft, 'robinhood'), 'https://robinhoodchain.blockscout.com/token/assetA/instance/123');
});
test('inventory deduplicates by asset identity rather than name', () => {
  assert.equal(visibleCollectibles([nft, nft, { ...nft, contractAddress: 'assetB' }], '', 'all', 'all', 'name-asc').length, 2);
});
test('pack search and compressed filter match owned collectibles only', () => {
  assert.deepEqual(visibleCollectibles([nft, { ...nft, tokenId: '2', isCompressed: false }], 'frogs', 'compressed', 'Pond', 'name-asc'), [nft]);
  assert.equal(visibleCollectibles([nft], 'missing', 'all', 'all', 'name-asc').length, 0);
});