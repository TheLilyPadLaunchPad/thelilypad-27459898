/**
 * XRPL Type Definitions
 */

export type XRPLNetwork = 'mainnet' | 'testnet';

export interface XRPLWallet {
    address: string;
    seed?: string; // Encrypted seed for signing
}

export interface XRPLNFTParams {
    uri: string;
    flags?: number;
    transferFee?: number;
    taxon?: number;
}

export interface XRPLMintResult {
    nftId: string;
    txHash: string;
}

export interface XRPLCollectionParams {
    name: string;
    description: string;
    uri: string;
    issuer: string;
    taxon: number;
    transferFee?: number;
}

export interface XRPLCollectionResult {
    domain: string;
    taxon: number;
    txHash: string;
}

export interface XRPLBatchMintParams {
    collectionParams: XRPLCollectionParams;
    items: Array<{
        name: string;
        uri: string;
    }>;
    onProgress?: (current: number, total: number) => void;
}

export interface XRPLBatchMintResult {
    nfts: Array<{
        nftId: string;
        name: string;
        txHash: string;
    }>;
    collectionTxHash: string;
}

export interface XRPLOfferParams {
    nftId: string;
    amount: string;
    destination?: string;
    expiration?: number;
}

export interface XRPLOfferResult {
    offerId: string;
    txHash: string;
}

export interface XRPLAcceptOfferParams {
    offerId: string;
    /** @deprecated Not used by XLS-20 NFTokenAcceptOffer; kept for backward-compat. */
    nftId?: string;
}

export interface XRPLAcceptOfferResult {
    txHash: string;
}
