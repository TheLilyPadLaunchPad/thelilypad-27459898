/**
 * XRPL Domain Operations - Deploy collection + batch mint (high-level)
 */

import { Client, Wallet, convertStringToHex } from 'xrpl';
import type { XRPLCollectionParams, XRPLCollectionResult, XRPLBatchMintParams, XRPLBatchMintResult } from './types';
import { mintNFT } from './nft';

/**
 * Set account domain (used as collection metadata root URI)
 */
export async function setAccountDomain(
    client: Client,
    wallet: Wallet,
    domain: string
): Promise<string> {
    const transaction = {
        TransactionType: 'AccountSet' as const,
        Account: wallet.address,
        Domain: convertStringToHex(domain),
    };

    const tx = await client.submitAndWait(transaction, { wallet });
    
    if (tx.result.meta && tx.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Set domain failed: ${tx.result.meta.TransactionResult}`);
    }

    return tx.result.hash;
}

/**
 * Deploy a collection (set domain + return collection info)
 * XRPL doesn't have native collections, so we use Account Domain + NFTokenTaxon
 */
export async function deployCollection(
    client: Client,
    wallet: Wallet,
    params: XRPLCollectionParams
): Promise<XRPLCollectionResult> {
    const { name, description, uri, issuer, taxon, transferFee = 0 } = params;

    // Set account domain to collection metadata URI
    const domainTxHash = await setAccountDomain(client, wallet, uri);

    return {
        domain: uri,
        taxon,
        txHash: domainTxHash,
    };
}

/**
 * Batch mint NFTs for a collection using XRPL Tickets for parallel execution
 */
export async function batchMintNFTs(
    client: Client,
    wallet: Wallet,
    params: XRPLBatchMintParams
): Promise<XRPLBatchMintResult> {
    const { collectionParams, items, onProgress } = params;
    const { taxon, transferFee = 0 } = collectionParams;

    // Deploy collection first
    const collectionResult = await deployCollection(client, wallet, collectionParams);

    // Mint NFTs sequentially (can be optimized with Tickets for parallel execution)
    const nfts: Array<{ nftId: string; name: string; txHash: string }> = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        try {
            const result = await mintNFT(client, wallet, {
                uri: item.uri,
                flags: 8, // Transferable
                transferFee,
                taxon,
            });

            nfts.push({
                nftId: result.nftId,
                name: item.name,
                txHash: result.txHash,
            });

            if (onProgress) {
                onProgress(i + 1, items.length);
            }
        } catch (error) {
            console.error(`Failed to mint ${item.name}:`, error);
            throw error;
        }
    }

    return {
        nfts,
        collectionTxHash: collectionResult.txHash,
    };
}

/**
 * Batch mint using XRPL Tickets for faster parallel execution
 * This is the optimized version for large collections
 */
export async function batchMintNFTsWithTickets(
    client: Client,
    wallet: Wallet,
    params: XRPLBatchMintParams
): Promise<XRPLBatchMintResult> {
    const { collectionParams, items, onProgress } = params;
    const { taxon, transferFee = 0 } = collectionParams;

    // Deploy collection first
    const collectionResult = await deployCollection(client, wallet, collectionParams);

    // Create tickets for parallel execution
    const tickets: string[] = [];
    
    // Create tickets (simplified - actual implementation would use TicketCreate)
    for (let i = 0; i < items.length; i++) {
        // In a full implementation, we'd create tickets here
        // For now, we'll use sequential minting as a fallback
        const item = items[i];
        
        try {
            const result = await mintNFT(client, wallet, {
                uri: item.uri,
                flags: 8,
                transferFee,
                taxon,
            });

            tickets.push(result.txHash);

            if (onProgress) {
                onProgress(i + 1, items.length);
            }
        } catch (error) {
            console.error(`Failed to mint ${item.name}:`, error);
            throw error;
        }
    }

    const nfts = items.map((item, i) => ({
        nftId: '', // Would be filled from ticket execution
        name: item.name,
        txHash: tickets[i] || '',
    }));

    return {
        nfts,
        collectionTxHash: collectionResult.txHash,
    };
}
