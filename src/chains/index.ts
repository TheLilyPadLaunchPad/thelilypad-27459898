/**
 * Unified Chain Abstraction - Factory for multi-chain clients
 */

import type { SupportedChain } from '@/config/chains';
import * as solana from './solana/client';
import * as monad from './monad/client';

export type { SolanaNetwork } from './solana/client';

// Re-export chain-specific modules
export { solana, monad };

// Re-export solana client functions
export { createUmi } from './solana/client';

// Re-export monad client functions
export { createMonadProvider, connectMonadWallet } from './monad/client';

// Re-export types
export type { SolanaCollectionParams, SolanaCollectionResult, CandyMachineItem } from './solana/types';
export type { MonadCollectionParams, MonadDeployResult } from './monad/types';

// Re-export program wrappers
export { createCoreCollection, createCoreCandyMachine, insertItemsToCandyMachine, createBubblegumTree, mintCompressedCoreNft, batchMintCompressedCoreNft, batchMintCoreNft, bulkMintCompressedCollection, bulkMintCoreCollection, estimateBatchMintFees, calculateBatchMintCost } from './solana/programs';
export type { LaunchpadPhase, BatchNftItem, BatchMintResult, BulkMintResult } from './solana/programs';
export { initHybridEscrow, captureHybridNft, releaseHybridNft, deriveEscrowPda, mplHybrid } from './solana/hybrid';
export type { HybridEscrowConfig, CaptureParams, ReleaseParams } from './solana/hybrid';
export { createSplToken, mintSplTokens } from './solana/splToken';
export type { SplTokenConfig, SplTokenResult } from './solana/splToken';
export { deployMonadCollection, mintMonadNFT, getMonadCollectionInfo } from './monad/contracts';

// Re-export metadata utilities (Umi-based)
export {
    uploadFile, uploadFiles, uploadMetadata, uploadJsonBatch,
    resolveMetadataUri, resolveImageUri,
    uploadBatchWithUmi, uploadSingleWithUmi
} from './solana/metadata';
export type { BatchUploadItem, BatchUploadResult, BatchUploadResponse } from './solana/metadata';

// Re-export Monad metadata
export { uploadMonadImage, uploadMonadMetadata, uploadMonadMetadataBatch, uploadMonadAudio, buildERC721Metadata } from './monad/metadata';
export type { ERC721Metadata, ERC721Attribute } from './monad/metadata';

// Re-export Solana shop / buyback / creator
export { buildShopPurchaseTx, buildStickerPackPurchaseTx, buildEmotePackPurchaseTx, buildEmojiPackPurchaseTx, buildLootBoxPurchaseTx } from './solana/shop';
export { executeBuyback, getBuybackPoolBalance } from './solana/buyback';
export type { BuybackResult } from './solana/buyback';
export { buildTipCreatorTx, buildCreatorRegistrationTx } from './solana/creator';

// Re-export Monad shop / buyback
export { executeMonadBuyback } from './monad/buyback';
export type { MonadBuybackResult } from './monad/buyback';
export { purchaseMonadShopItem, purchaseMonadShopDirect } from './monad/shop';
export type { MonadShopResult, MonadShopItemType } from './monad/shop';

// Re-export chain validation utilities
export { validateSolanaRoyalty, validateSolanaAddress } from './solana/validate';
export { validateMonadRoyalty, validateEvmAddress } from './monad/validate';

/**
 * Get chain client based on supported chain
 */
export function getChainClient(chain: SupportedChain) {
    switch (chain) {
        case 'solana':
            return solana;
        case 'monad':
            return monad;
        default:
            throw new Error(`Unsupported chain: ${chain}`);
    }
}
