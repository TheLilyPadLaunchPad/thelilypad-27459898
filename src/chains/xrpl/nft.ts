/**
 * XRPL NFT Operations - XLS-20 primitives (mint/offer/accept/burn)
 */

import { Client, Wallet, convertStringToHex } from 'xrpl';
import type { XRPLNFTParams, XRPLMintResult, XRPLOfferParams, XRPLOfferResult, XRPLAcceptOfferParams, XRPLAcceptOfferResult } from './types';

/**
 * Mint a single NFT on XRPL (XLS-20)
 */
export async function mintNFT(
    client: Client,
    wallet: Wallet,
    params: XRPLNFTParams
): Promise<XRPLMintResult> {
    const { uri, flags = 8, transferFee = 0, taxon = 0 } = params;

    // Convert URI to hex if not already hex
    const uriHex = uri.startsWith('0x') ? uri : convertStringToHex(uri);

    const transaction = {
        TransactionType: 'NFTokenMint' as const,
        Account: wallet.address,
        URI: uriHex,
        Flags: flags,
        TransferFee: transferFee,
        NFTokenTaxon: taxon,
    };

    const tx = await client.submitAndWait(transaction, { wallet });
    const meta = tx.result.meta as any;

    if (meta && meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Mint failed: ${meta.TransactionResult}`);
    }

    // Extract NFTokenID from the transaction metadata
    const nftId = meta?.nftoken_id || '';

    return {
        nftId,
        txHash: tx.result.hash,
    };
}

/**
 * Create a sell offer for an NFT
 */
export async function createSellOffer(
    client: Client,
    wallet: Wallet,
    params: XRPLOfferParams
): Promise<XRPLOfferResult> {
    const { nftId, amount, destination, expiration } = params;

    const transaction: any = {
        TransactionType: 'NFTokenCreateOffer',
        Account: wallet.address,
        NFTokenID: nftId,
        Amount: amount,
        Flags: 1, // Sell offer
    };

    if (destination) {
        transaction.Destination = destination;
    }

    if (expiration) {
        transaction.Expiration = expiration;
    }

    const tx = await client.submitAndWait(transaction, { wallet });
    
    if (tx.result.meta && tx.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Create offer failed: ${tx.result.meta.TransactionResult}`);
    }

    const offerId = tx.result.meta?.offer_id || '';
    
    return {
        offerId,
        txHash: tx.result.hash,
    };
}

/**
 * Accept an offer to buy an NFT
 */
export async function acceptOffer(
    client: Client,
    wallet: Wallet,
    params: XRPLAcceptOfferParams
): Promise<XRPLAcceptOfferResult> {
    const { offerId, nftId } = params;

    const transaction = {
        TransactionType: 'NFTokenAcceptOffer' as const,
        Account: wallet.address,
        NFTokenSellOffer: offerId,
        NFTokenID: nftId,
    };

    const tx = await client.submitAndWait(transaction, { wallet });
    
    if (tx.result.meta && tx.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Accept offer failed: ${tx.result.meta.TransactionResult}`);
    }

    return {
        txHash: tx.result.hash,
    };
}

/**
 * Burn an NFT
 */
export async function burnNFT(
    client: Client,
    wallet: Wallet,
    nftId: string
): Promise<string> {
    const transaction = {
        TransactionType: 'NFTokenBurn' as const,
        Account: wallet.address,
        NFTokenID: nftId,
    };

    const tx = await client.submitAndWait(transaction, { wallet });
    
    if (tx.result.meta && tx.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Burn failed: ${tx.result.meta.TransactionResult}`);
    }

    return tx.result.hash;
}

/**
 * Get NFTs owned by an address
 */
export async function getAccountNFTs(
    client: Client,
    address: string,
    marker?: string
): Promise<{ nfts: any[]; marker?: string }> {
    const request: any = {
        command: 'account_nfts',
        account: address,
        limit: 200,
    };

    if (marker) {
        request.marker = marker;
    }

    const response = await client.request(request);
    
    return {
        nfts: response.result.account_nfts || [],
        marker: response.result.marker,
    };
}
