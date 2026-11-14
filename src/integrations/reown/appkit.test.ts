import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReownNetworks } from './appkit';

const names = (nets: { name?: string }[]) => nets.map((n) => String(n.name ?? '').toLowerCase());

test('excludes devnet/testnet networks for regular users', () => {
  const nets = buildReownNetworks(false);
  const n = names(nets);
  assert.equal(n.some((x) => x.includes('devnet')), false);
  assert.equal(n.some((x) => x.includes('testnet')), false);
  assert.equal(nets.length, 5);
});

test('includes Solana devnet, Solana testnet and Monad testnet for admins', () => {
  const nets = buildReownNetworks(true);
  const n = names(nets);
  assert.equal(n.some((x) => x.includes('devnet')), true);
  assert.equal(n.some((x) => x.includes('testnet')), true);
  assert.equal(nets.length, 8);
});

test('always keeps the mainnet networks', () => {
  for (const admin of [false, true]) {
    const n = names(buildReownNetworks(admin));
    assert.equal(n.some((x) => x === 'solana'), true);
    assert.equal(n.some((x) => x === 'mainnet'), true); // Monad mainnet
    assert.equal(n.some((x) => x.includes('robinhood')), true);
    assert.equal(n.some((x) => x.includes('ape')), true);
    assert.equal(n.some((x) => x.includes('ethereum')), true);
  }
});
