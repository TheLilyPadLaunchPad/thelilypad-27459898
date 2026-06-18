/**
 * XRPL NFT Operations - XLS-20 primitives (mint/offer/accept/burn)
 */

import { Client, Wallet, convertStringToHex } from 'xrpl';
import type {
    XRPLNFTParams,
    XRPLMintResult,
    XRPLOfferParams,
    XRPLOfferResult,
    XRPLAcceptOfferParams,
    XRPLAcceptOfferResult,
} from './types';

/**
 * Extract a newly-minted NFTokenID by walking AffectedNodes.
 * Handles both CreatedNode (first NFT on a page) and ModifiedNode
 * (additional NFTs added to an existing page) cases.
 */
function extractNFTokenIdFromMeta(meta: any): string {
    if (!meta) return '';
    if (typeof meta.nftoken_id === 'string' && meta.nftoken_id.length > 0) {
        return meta.nftoken_id;
    }
    const affected: any[] = meta.AffectedNodes || [];
    const before = new Set<string>();
    const after = new Set<string>();
    for (const node of affected) {
        const c = node.CreatedNode;
        const m = node.ModifiedNode;
        if (c?.LedgerEntryType === 'NFTokenPage') {
            for (const t of c.NewFields?.NFTokens || []) {
                if (t.NFToken?.NFTokenID) after.add(t.NFToken.NFTokenID);
            }
        }
        if (m?.LedgerEntryType === 'NFTokenPage') {
            for (const t of m.PreviousFields?.NFTokens || []) {
                if (t.NFToken?.NFTokenID) before.add(t.NFToken.NFTokenID);
            }
            for (const t of m.FinalFields?.NFTokens || []) {
                if (t.NFToken?.NFTokenID) after.add(t.NFToken.NFTokenID);
            }
        }
    }
    for (const id of after) if (!before.has(id)) return id;
    return '';
}

/**
 * Extract a newly-created NFTokenOffer ID from AffectedNodes.
 */
function extractOfferIdFromMeta(meta: any): string {
    if (!meta) return '';
    if (typeof meta.offer_id === 'string' && meta.offer_id.length > 0) {
        return meta.offer_id;
    }
    const affected: any[] = meta.AffectedNodes || [];
    for (const node of affected) {
        const c = node.CreatedNode;
        if (c?.LedgerEntryType === 'NFTokenOffer' && c.LedgerIndex) {
            return c.LedgerIndex;
        }
    }
    return '';
}

/**
 * Mint a single NFT on XRPL (XLS-20)
 */
export async function mintNFT(
    client: Client,
    wallet: Wallet,
    params: XRPLNFTParams
): Promise<XRPLMintResult> {
    const { uri, flags = 8, transferFee = 0, taxon = 0 } = params;

    // XLS-20: URI is hex-encoded, max 256 bytes (= 512 hex chars).
    const uriHex = /^[0-9a-fA-F]+$/.test(uri) ? uri : convertStringToHex(uri);
    if (uriHex.length > 512) {
        throw new Error(`XRPL URI exceeds 256-byte max (${uriHex.length / 2} bytes)`);
    }
    // XLS-20: TransferFee is 0–50000 (= 0–50%).
    if (transferFee < 0 || transferFee > 50000) {
        throw new Error(`XRPL TransferFee must be 0–50000, got ${transferFee}`);
    }

    const transaction: any = {
        TransactionType: 'NFTokenMint',
        Account: wallet.address,
        URI: uriHex,
        Flags: flags,
        NFTokenTaxon: taxon,
    };
    // Only include TransferFee when non-zero AND tfTransferable (8) is set,
    // otherwise the ledger rejects with temBAD_TRANSFER_FEE.
    if (transferFee > 0 && (flags & 8) !== 0) {
        transaction.TransferFee = transferFee;
    }

    const tx = await client.submitAndWait(transaction, { wallet });
    const meta = tx.result.meta as any;

    if (meta && meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Mint failed: ${meta.TransactionResult}`);
    }

    return {
        nftId: extractNFTokenIdFromMeta(meta),
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

    if (destination) transaction.Destination = destination;
    if (expiration) transaction.Expiration = expiration;

    const tx = await client.submitAndWait(transaction, { wallet });
    const meta = tx.result.meta as any;

    if (meta && meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Create offer failed: ${meta.TransactionResult}`);
    }

    return {
        offerId: extractOfferIdFromMeta(meta),
        txHash: tx.result.hash,
    };
}

/**
 * Accept a sell offer to buy an NFT.
 * Note: XLS-20 NFTokenAcceptOffer takes NFTokenSellOffer and/or
 * NFTokenBuyOffer — NOT an NFTokenID field.
 */
export async function acceptOffer(
    client: Client,
    wallet: Wallet,
    params: XRPLAcceptOfferParams
): Promise<XRPLAcceptOfferResult> {
    const { offerId } = params;

    const transaction = {
        TransactionType: 'NFTokenAcceptOffer' as const,
        Account: wallet.address,
        NFTokenSellOffer: offerId,
    };

    const tx = await client.submitAndWait(transaction, { wallet });
    const meta = tx.result.meta as any;

    if (meta && meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Accept offer failed: ${meta.TransactionResult}`);
    }

    return { txHash: tx.result.hash };
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
    const meta = tx.result.meta as any;

    if (meta && meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Burn failed: ${meta.TransactionResult}`);
    }

    return tx.result.hash;
}

/**
 * Get NFTs owned by an address. Paginates internally — returns ALL NFTs.
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
    if (marker) request.marker = marker;

    const response = (await client.request(request)) as any;
    return {
        nfts: response.result.account_nfts || [],
        marker: response.result.marker,
    };
}

/**
 * Get ALL NFTs owned by an address (walks pagination markers).
 */
export async function getAllAccountNFTs(
    client: Client,
    address: string
): Promise<any[]> {
    const all: any[] = [];
    let marker: string | undefined;
    do {
        const page = await getAccountNFTs(client, address, marker);
        all.push(...page.nfts);
        marker = page.marker;
    } while (marker);
    return all;
}
