import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidSolanaAddress,
  detectSolanaAssetStandard,
} from './solanaNftTransfer';

test('valid Solana addresses pass', () => {
  assert.equal(isValidSolanaAddress('11111111111111111111111111111111'), true);
  assert.equal(isValidSolanaAddress('So11111111111111111111111111111111111111112'), true);
});

test('rejects empty, EVM, and malformed addresses', () => {
  assert.equal(isValidSolanaAddress(''), false);
  assert.equal(isValidSolanaAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'), false);
  assert.equal(isValidSolanaAddress('not-an-address'), false);
  assert.equal(isValidSolanaAddress('0OIl+invalidchars00000000000000000000000'), false);
});

test('compressed flag wins over interface', () => {
  assert.equal(
    detectSolanaAssetStandard({ interface: 'V1_NFT', compression: { compressed: true } }),
    'compressed',
  );
});

test('Core assets detected by interface', () => {
  assert.equal(
    detectSolanaAssetStandard({ interface: 'MplCoreAsset', compression: { compressed: false } }),
    'core',
  );
});

test('legacy Token Metadata NFTs are unsupported by this flow', () => {
  assert.equal(
    detectSolanaAssetStandard({ interface: 'V1_NFT', compression: { compressed: false } }),
    'unsupported',
  );
  assert.equal(detectSolanaAssetStandard({ interface: 'ProgrammableNFT' }), 'unsupported');
});
