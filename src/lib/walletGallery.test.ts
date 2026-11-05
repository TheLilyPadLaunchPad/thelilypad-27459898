import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectibleTraits, visibleCollectibles } from './walletGallery';
import type { NFT } from '../hooks/useWalletNFTs';

const makeNft = (overrides: Partial<NFT>): NFT => ({
  tokenId: 'token-1',
  contractAddress: 'addr-1',
  name: 'Frog #1',
  description: '',
  image: '',
  collection: 'Lily Pads',
  attributes: [],
  ...overrides,
});

const nfts: NFT[] = [
  makeNft({
    tokenId: 'a',
    name: 'Frog A',
    attributes: [
      { trait_type: 'Background', value: 'Pond' },
      { trait_type: 'Eyes', value: 'Sleepy' },
    ],
  }),
  makeNft({
    tokenId: 'b',
    name: 'Frog B',
    attributes: [
      { trait_type: 'Background', value: 'Sky' },
      { trait_type: 'Eyes', value: 'Sleepy' },
    ],
  }),
  makeNft({
    tokenId: 'c',
    name: 'Frog C',
    attributes: [
      { trait_type: 'Background', value: 'Pond' },
      { trait_type: 'Eyes', value: 'Wide' },
    ],
  }),
];

test('collectibleTraits lists distinct types with sorted values', () => {
  const traits = collectibleTraits(nfts);
  assert.deepEqual(traits, [
    { trait_type: 'Background', values: ['Pond', 'Sky'] },
    { trait_type: 'Eyes', values: ['Sleepy', 'Wide'] },
  ]);
});

test('trait type filter keeps only NFTs having that trait', () => {
  const result = visibleCollectibles(nfts, '', 'all', 'all', 'name-asc', 'Background', 'all');
  assert.equal(result.length, 3);
  const none = visibleCollectibles(nfts, '', 'all', 'all', 'name-asc', 'Missing', 'all');
  assert.equal(none.length, 0);
});

test('trait value filter narrows to exact matches', () => {
  const pond = visibleCollectibles(nfts, '', 'all', 'all', 'name-asc', 'Background', 'Pond');
  assert.deepEqual(pond.map(n => n.name), ['Frog A', 'Frog C']);
  const wide = visibleCollectibles(nfts, '', 'all', 'all', 'name-asc', 'Eyes', 'Wide');
  assert.deepEqual(wide.map(n => n.name), ['Frog C']);
});

test('trait filter composes with search and collection filters', () => {
  const result = visibleCollectibles(nfts, 'frog b', 'all', 'Lily Pads', 'name-asc', 'Eyes', 'Sleepy');
  assert.deepEqual(result.map(n => n.name), ['Frog B']);
});

test('default trait arguments preserve previous behaviour', () => {
  const all = visibleCollectibles(nfts, '', 'all', 'all', 'name-asc');
  assert.equal(all.length, 3);
});
