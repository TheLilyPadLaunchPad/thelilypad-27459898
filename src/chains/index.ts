/**
 * Unified Chain Abstraction - Factory for multi-chain clients
 */

import type { SupportedChain } from '@/config/chains';
import * as solana from './solana/client';
import * as xrpl from './xrpl/client';
import * as monad from './monad/client';

export type { SolanaNetwork } from './solana/client';
export type { XRPLNetwork } from './xrpl/client';

// Re-export chain-specific modules
export { solana, xrpl, monad };

// Re-export solana client functions
export { createUmi } from './solana/client';

// Re-export monad client functions
export { createMonadProvider, connectMonadWallet } from './monad/client';

// Re-export types
export type { SolanaCollectionParams, SolanaCollectionResult, CandyMachineItem } from './solana/types';
export type { XRPLCollectionParams, XRPLDeployResult, XRPLMintItem } from './xrpl/types';
export type { MonadCollectionParams, MonadDeployResult } from './monad/types';

// Re-export program wrappers
export { createCoreCollection, createCoreCandyMachine, insertItemsToCandyMachine, createBubblegumTree, mintCompressedCoreNft } from './solana/programs';
export { initHybridEscrow, captureHybridNft, releaseHybridNft, deriveEscrowPda, mplHybrid } from './solana/hybrid';
export type { HybridEscrowConfig, CaptureParams, ReleaseParams } from './solana/hybrid';
export { createSplToken, mintSplTokens } from './solana/splToken';
export type { SplTokenConfig, SplTokenResult } from './solana/splToken';
export type { LaunchpadPhase } from './solana/programs';
export { deployXRPLCollection, mintXRPLItems, resolveAccountDomain, toHexUri, fromHexUri } from './xrpl/domain';
export { mintNFToken, batchMintNFTokens, batchMintNFTokensParallel, safeExtractNFTokenId, createSellOffer, createBuyOffer, acceptOffer, brokerSale, cancelOffers, burnNFToken, setAuthorizedMinter, setAccountDomain, getAccountNFTs, getNFTSellOffers, getNFTBuyOffers } from './xrpl/nft';
export { listNFTForSale, buyNFTNow, makeOffer, acceptBuyOffer, brokerNFTSale, cancelListing, getListings, getOffers } from './xrpl/marketplace';
export { createXRPLClient, disconnectXRPLClient } from './xrpl/client';
export { NFTokenFlag } from './xrpl/types';
export type { XRPLMintParams, XRPLMintResult, XRPLCreateSellOfferParams, XRPLCreateBuyOfferParams, XRPLOfferResult, XRPLAcceptOfferParams, XRPLBrokerSaleParams, XRPLAcceptResult, XRPLBurnParams, XRPLAuthorizedMinterParams, XRPLSetDomainParams } from './xrpl/types';
export type { XRPLListingParams, XRPLListingResult, XRPLBuyNowParams, XRPLMakeOfferParams, XRPLBrokerParams } from './xrpl/marketplace';
export { deployMonadCollection, mintMonadNFT, getMonadCollectionInfo } from './monad/contracts';

// Re-export metadata utilities
export { uploadFile, uploadFiles, uploadMetadata, uploadJsonBatch, resolveMetadataUri, resolveImageUri } from './solana/metadata';

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
export { validateXRPLRoyalty, validateXRPLAddress } from './xrpl/validate';
export { validateMonadRoyalty, validateEvmAddress } from './monad/validate';

/**
 * Get chain client based on supported chain
 */
export function getChainClient(chain: SupportedChain) {
    switch (chain) {
        case 'solana':
            return solana;
        case 'xrpl':
            return xrpl;
        case 'monad':
            return monad;
        default:
            throw new Error(`Unsupported chain: ${chain}`);
    }
}
