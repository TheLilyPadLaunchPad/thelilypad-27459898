/**
 * XRPL Marketplace Operations - List/buy/offer/broker wrappers
 */

import { Client, Wallet } from 'xrpl';
import type { XRPLOfferParams, XRPLOfferResult, XRPLAcceptOfferParams, XRPLAcceptOfferResult } from './types';
import { createSellOffer, acceptOffer, getAccountNFTs } from './nft';

/**
 * List an NFT for sale (create sell offer)
 */
export async function listNFT(
    client: Client,
    wallet: Wallet,
    params: XRPLOfferParams & { price: string }
): Promise<XRPLOfferResult> {
    return createSellOffer(client, wallet, {
        nftId: params.nftId,
        amount: params.price,
        destination: params.destination,
        expiration: params.expiration,
    });
}

/**
 * Buy an NFT (accept sell offer)
 */
export async function buyNFT(
    client: Client,
    wallet: Wallet,
    params: XRPLAcceptOfferParams
): Promise<XRPLAcceptOfferResult> {
    return acceptOffer(client, wallet, params);
}

/**
 * Get sell offers for an NFT
 */
export async function getNFTSellOffers(
    client: Client,
    nftId: string
): Promise<any[]> {
    const request = {
        command: 'nft_sell_offers',
        nft_id: nftId,
    };

    const response = await client.request(request);
    return response.result.offers || [];
}

/**
 * Get buy offers for an NFT
 */
export async function getNFTBuyOffers(
    client: Client,
    nftId: string
): Promise<any[]> {
    const request = {
        command: 'nft_buy_offers',
        nft_id: nftId,
    };

    const response = await client.request(request);
    return response.result.offers || [];
}

/**
 * Cancel an offer
 */
export async function cancelOffer(
    client: Client,
    wallet: Wallet,
    offerId: string
): Promise<string> {
    const transaction = {
        TransactionType: 'NFTokenCancelOffer' as const,
        Account: wallet.address,
        NFTokenOffers: [offerId],
    };

    const tx = await client.submitAndWait(transaction, { wallet });
    
    if (tx.result.meta && tx.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Cancel offer failed: ${tx.result.meta.TransactionResult}`);
    }

    return tx.result.hash;
}

/**
 * Get marketplace listings for an account
 */
export async function getAccountListings(
    client: Client,
    address: string
): Promise<any[]> {
    const { nfts } = await getAccountNFTs(client, address);
    const listings: any[] = [];

    for (const nft of nfts) {
        const offers = await getNFTSellOffers(client, nft.NFTokenID);
        if (offers.length > 0) {
            listings.push({
                nft,
                offers,
            });
        }
    }

    return listings;
}
