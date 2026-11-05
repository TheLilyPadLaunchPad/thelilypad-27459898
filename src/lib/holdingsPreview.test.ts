import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewHoldings } from './holdingsPreview';

const make = (cols: number, per: number) =>
  Array.from({ length: cols * per }, (_, i) => ({ c: `c${Math.floor(i / per)}` }));

test('shows at most 10 collections', () => {
  const r = previewHoldings(make(14, 2), (n) => n.c);
  assert.equal(r.groups.length, 10);
  assert.equal(r.totalCollections, 14);
});

test('shows at most 10 NFTs per collection and keeps the real total', () => {
  const r = previewHoldings(make(1, 25), (n) => n.c);
  assert.equal(r.groups[0].items.length, 10);
  assert.equal(r.groups[0].total, 25);
});
