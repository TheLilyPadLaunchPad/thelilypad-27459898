/**
 * Solana Type Definitions
 */

import { Signer } from '@metaplex-foundation/umi';

export interface SolanaCollectionParams {
    name: string;
    symbol: string;
    uri: string;
    sellerFeeBasisPoints?: number;
    creators?: Array<{ address: string; share: number }>;
    /**
     * When true, attach the Core `BubblegumV2` collection plugin at creation
     * time. Required for any collection that will receive compressed NFTs via
     * Bubblegum's `mintV2` (e.g. 1-of-1, cNFT launches). Without it, `mintV2`
     * fails with error 6049 `CollectionMustHaveBubblegumPlugin`.
     */
    withBubblegumV2?: boolean;
    /**
     * Optional pre-generated keypair (base58 secret key) to use as the
     * Collection account. Used by the vanity grinder to produce branded
     * addresses (e.g. ending in "L3AP"). When omitted a random signer is
     * generated.
     */
    collectionKeypairSecret?: string;
}

export interface SolanaCollectionResult {
    address: string;
    signer: Signer;
}

export interface CandyMachineConfig {
    collectionMint: string;
    itemsAvailable: number;
    prefixUri?: string;
    treasuryWallet?: string;
}

export interface CandyMachineItem {
    name: string;
    uri: string;
}

export type SolanaStandard = 'core' | 'token-metadata';
