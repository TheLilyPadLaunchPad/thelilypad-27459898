import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeCollectibleUrl, activeCollectibleListing, collectibleListingUrl, collectibleMetadata } from './collectibleDetails';
test('metadata and artwork links reject executable URLs', () => {
  assert.equal(safeCollectibleUrl('javascript:alert(1)'), null);
  assert.equal(safeCollectibleUrl('ipfs://ipfs/cid/art.png'), 'https://ipfs.io/ipfs/cid/art.png');
  assert.equal(safeCollectibleUrl('ar://abc'), 'https://arweave.net/abc');
});
test('only active unexpired listings are offered', () => {
  const now = Date.parse('2026-11-01T00:00:00Z');
  assert.equal(activeCollectibleListing({status: 'sold', expires_at: null}, now), false);
  assert.equal(activeCollectibleListing({status: 'active', expires_at: '2026-10-31T00:00:00Z'}, now), false);
  assert.equal(activeCollectibleListing({status: 'active', expires_at: null}, now), true);
  assert.equal(collectibleListingUrl('exact-id'), '/marketplace?listing=exact-id');
});
test('raw indexed metadata retains extra properties', () => {
  const nft = {rawMetadata: {name: 'Frog', extra: 'preserved'}};
  assert.deepEqual(collectibleMetadata(nft as Parameters<typeof collectibleMetadata>[0]), nft.rawMetadata);
});