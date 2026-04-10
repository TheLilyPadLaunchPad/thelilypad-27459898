import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useWallet } from '@/providers/WalletProvider';
import {
    createUmi,
    createCoreCollection,
    createCoreCandyMachine,
    insertItemsToCandyMachine as insertItemsToChain,
    uploadFile as uploadFileToChain,
    uploadFiles as uploadFilesToChain,
    uploadMetadata as uploadMetadataToChain,
    uploadJsonBatch,
    createBubblegumTree,
    mintCompressedCoreNft,
} from '@/chains';
import type { LaunchpadPhase, SolanaCollectionParams } from '@/chains';
import { Umi, transactionBuilder, publicKey, some, none } from '@metaplex-foundation/umi';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { updateV1 as updateCoreAsset } from '@metaplex-foundation/mpl-core';
import { setComputeUnitPrice } from '@metaplex-foundation/mpl-toolbox';
import { deleteCandyMachine as deleteCoreCandyMachine, deleteCandyGuard as deleteCoreCandyGuard } from '@metaplex-foundation/mpl-core-candy-machine';
import { SendTransactionError } from '@solana/web3.js';
import { invalidateRpc } from '@/config/solana';

/**
 * Extract human-readable error messages from Solana transaction logs
 */
const extractSolanaError = (err: any): string => {
    if (err instanceof SendTransactionError && err.logs) {
        // Look for custom program errors in logs
        const customErrorMatch = err.logs.some(log => log.includes("custom program error"));
        if (customErrorMatch) {
            if (err.logs.some(log => log.includes("Error: InsufficientFunds"))) return "Insufficient funds for transaction";
            if (err.logs.some(log => log.includes("Error: AccountNotFound"))) return "Required account not found";
            if (err.logs.some(log => log.includes("0x1771"))) return "Candy Machine is empty";
            if (err.logs.some(log => log.includes("0x1770"))) return "Mint has ended";
        }
        
        // General messages
        if (err.message.includes("Blockhash not found")) return "Network congestion: Blockhash expired. Please retry.";
        if (err.message.includes("429")) return "Network rate limit reached. Please wait a moment.";
    }
    
    return err.message || "An unknown blockchain error occurred";
};

// Re-export for consumers
export type { LaunchpadPhase } from '@/chains';

/**
 * useSolanaLaunch - Thin React adapter for Solana chain operations
 * 
 * This hook provides React state management and delegates all chain logic
 * to the centralized chains/solana/* modules.
 */

interface CreateCollectionParams {
    name: string;
    symbol: string;
    imageUri?: string;
    uri?: string;
    royaltyBasisPoints?: number;
    sellerFeeBasisPoints?: number;
    standard?: 'core';
    supplyConfig?: {
        type: string;
        limit?: number;
    };
}

export const useSolanaLaunch = () => {
    const { network, getSolanaProvider } = useWallet();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Get Umi instance with wallet attached
    const getUmi = useCallback(async (): Promise<Umi> => {
        const provider = getSolanaProvider();
        if (!provider || !provider.publicKey) {
            throw new Error("Solana wallet not connected");
        }

        const umi = await createUmi(network as 'mainnet' | 'devnet', null);

        const wallet = {
            publicKey: provider.publicKey,
            signTransaction: provider.signTransaction.bind(provider),
            signAllTransactions: provider.signAllTransactions.bind(provider),
            signMessage: provider.signMessage ? provider.signMessage.bind(provider) : undefined,
        };

        return umi.use(walletAdapterIdentity(wallet));
    }, [getSolanaProvider, network]);

    /**
     * Helper to retry blockchain operations with RPC failover
     */
    const withRetry = useCallback(async <T>(
        operation: (umi: Umi) => Promise<T>,
        maxRetries = 2
    ): Promise<T> => {
        let lastError: any;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const umi = await getUmi();
            try {
                return await operation(umi);
            } catch (err: any) {
                lastError = err;
                const msg = err.message || "";
                const isNetworkError = 
                    msg.includes("fetch") || 
                    msg.includes("429") || 
                    msg.includes("Blockhash not found") ||
                    msg.includes("Network Error");

                if (isNetworkError && attempt < maxRetries) {
                    const endpoint = umi.rpc.getEndpoint();
                    console.warn(`[Solana] Operation failed on ${endpoint}. Attempting RPC failover (retry ${attempt + 1}/${maxRetries})...`);
                    invalidateRpc(endpoint);
                    toast.info("Switching to a different Solana RPC for better stability...", { id: 'rpc-failover' });
                    // Small delay before retry
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                throw err;
            }
        }
        throw lastError;
    }, [getUmi]);


    /**
     * Upload a single file to Arweave
     */
    const uploadFile = useCallback(async (file: File) => {
        const umi = await getUmi();
        return uploadFileToChain(umi, file);
    }, [getUmi]);

    /**
     * Upload multiple files to Arweave
     */
    const uploadFiles = useCallback(async (files: File[]) => {
        const umi = await getUmi();
        return uploadFilesToChain(umi, files);
    }, [getUmi]);

    /**
     * Upload JSON metadata to Arweave
     */
    const uploadMetadata = useCallback(async (metadata: any) => {
        const umi = await getUmi();
        return uploadMetadataToChain(umi, metadata);
    }, [getUmi]);

    /**
     * Upload multiple JSON metadata objects in batches
     */
    const uploadJsonMetadataBatch = useCallback(async (metadataArray: any[]) => {
        const umi = await getUmi();
        return uploadJsonBatch(umi, metadataArray);
    }, [getUmi]);

    /**
     * Deploy a Solana Core Collection
     */
    const deploySolanaCollection = useCallback(async (
        metadata: SolanaCollectionParams
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            return await withRetry(async (umi) => {
                toast.loading(`Deploying ${metadata.name} (Core)...`, { id: 'sol-deploy' });
                const result = await createCoreCollection(umi, metadata);
                toast.success(`Core Collection Deployed!`, { id: 'sol-deploy' });

                return {
                    signature: new Uint8Array(0),
                    address: result.address,
                    collectionAddress: result.address,
                    collectionSigner: result.signer,
                };
            });
        } catch (err: any) {
            console.error("Core Deployment Error:", err);

            if (err instanceof SendTransactionError && err.logs) {
                console.error("--- TRANSACTION LOGS ---");
                console.error(err.logs);
            }

            const msg = extractSolanaError(err);
            setError(msg);
            toast.error(msg, { id: 'sol-deploy' });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi]);

    /**
     * Deploy a Bubblegum Merkle Tree
     */
    const deployBubblegumTree = useCallback(async (
        maxDepth: number = 14,
        maxBufferSize: number = 64,
        canopyDepth: number = 8
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const umi = await getUmi();
            toast.loading("Deploying Bubblegum Tree...", { id: 'tree-deploy' });
            const treeAddress = await createBubblegumTree(umi, maxDepth, maxBufferSize, canopyDepth);
            toast.success("Bubblegum Tree Deployed!", { id: 'tree-deploy' });
            return treeAddress;
        } catch (err: any) {
            console.error("Tree Deployment Error:", err);
            const msg = err.message || "Failed to deploy Bubblegum Tree";
            setError(msg);
            toast.error(msg, { id: 'tree-deploy' });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi]);

    /**
     * Mint a Compressed Core NFT
     */
    const mintCompressedCore = useCallback(async (
        treeAddress: string,
        collectionAddress: string,
        name: string,
        uri: string,
        sellerFeeBasisPoints: number = 0,
        owner?: string
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const umi = await getUmi();
            toast.loading(`Minting compressed NFT: ${name}...`, { id: 'cnft-mint' });
            const result = await mintCompressedCoreNft(umi, {
                treeAddress,
                collectionAddress,
                name,
                uri,
                sellerFeeBasisPoints,
                owner
            });
            toast.success("Compressed NFT Minted!", { id: 'cnft-mint' });
            return result;
        } catch (err: any) {
            console.error("Compressed Mint Error:", err);
            const msg = err.message || "Failed to mint Compressed NFT";
            setError(msg);
            toast.error(msg, { id: 'cnft-mint' });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi]);

    /**
     * Create a Launchpad Candy Machine with guards
     */
    const createLaunchpadCandyMachine = useCallback(async (
        collectionAddress: string,
        itemsAvailable: number,
        phases: LaunchpadPhase[],
        metadata: {
            name: string;
            symbol: string;
            uri: string;
            sellerFeeBasisPoints: number;
            creators: { address: string; share: number }[];
        },
        optionalTreasuryWallet?: string,
        baseUri?: string
    ): Promise<{ address: string; candyGuardAddress?: string }> => {
        setIsLoading(true);
        setError(null);
        try {
            return await withRetry(async (umi) => {
                toast.loading(`Creating Core Candy Machine...`, { id: 'cm-create' });
                const result = await createCoreCandyMachine(
                    umi,
                    collectionAddress,
                    itemsAvailable,
                    phases,
                    optionalTreasuryWallet,
                    baseUri
                );
                toast.success(`Candy Machine Ready with Guards!`, { id: 'cm-create' });
                return result;
            });
        } catch (err: any) {
            console.error("Candy Machine creation error:", err);

            if (err instanceof SendTransactionError && err.logs) {
                console.error("--- TRANSACTION LOGS ---");
                console.error(err.logs);
            }

            const msg = extractSolanaError(err);
            setError(msg);
            toast.error(msg, { id: 'cm-create', description: "Check logs for details." });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi]);

    /**
     * Insert items into a Candy Machine
     */
    const insertItemsToCandyMachine = useCallback(async (
        candyMachineAddress: string,
        items: { name: string; uri: string }[],
        batchSize = 10
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            await withRetry(async (umi) => {
                toast.loading(`Inserting items...`, { id: 'cm-insert' });
                await insertItemsToChain(umi, candyMachineAddress, items, batchSize);
            });
            toast.success(`Items inserted successfully!`, { id: 'cm-insert' });
        } catch (err: any) {
            console.error("Insert items error:", err);
            const msg = err.message || "Failed to insert items";
            setError(msg);
            toast.error(msg, { id: 'cm-insert' });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi]);

    /**
     * Delete a Candy Machine
     */
    const deleteCandyMachine = useCallback(async (
        candyMachineAddress: string,
        candyGuardAddress?: string
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const umi = await getUmi();
            toast.loading("Deleting Candy Machine...", { id: 'cm-delete' });

            let builder = transactionBuilder();

            // Delete Candy Guard if exists
            if (candyGuardAddress) {
                builder = builder.add(deleteCoreCandyGuard(umi, {
                    candyGuard: publicKey(candyGuardAddress),
                }));
            }

            // Delete Candy Machine
            builder = builder.add(deleteCoreCandyMachine(umi, {
                candyMachine: publicKey(candyMachineAddress),
            }));

            await builder.sendAndConfirm(umi);

            toast.success("Candy Machine deleted", { id: 'cm-delete' });
            return true;
        } catch (err: any) {
            console.error("Delete Candy Machine error:", err);
            const msg = err.message || "Failed to delete Candy Machine";
            setError(msg);
            toast.error(msg, { id: 'cm-delete' });
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi]);

    /**
     * Create a collection (simplified wrapper)
     */
    const createCollection = useCallback(async (params: CreateCollectionParams) => {
        const umi = await getUmi();
        const currentUser = umi.identity.publicKey.toString();

        return deploySolanaCollection({
            name: params.name,
            symbol: params.symbol,
            uri: params.uri || params.imageUri || '',
            sellerFeeBasisPoints: params.sellerFeeBasisPoints || 0,
            creators: [{ address: currentUser, share: 100 }]
        });
    }, [deploySolanaCollection, getUmi]);

    /**
     * Batch reveal assets (update URIs and names)
     */
    const batchRevealAssets = useCallback(async (
        assets: { address: string; uri: string; name?: string }[],
        batchSize = 5
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const umi = await getUmi();
            const chunks = [];
            for (let i = 0; i < assets.length; i += batchSize) {
                chunks.push(assets.slice(i, i + batchSize));
            }

            let successfulCount = 0;

            for (const [index, chunk] of chunks.entries()) {
                toast.loading(`Revealing batch ${index + 1}/${chunks.length}...`, { id: 'cm-reveal' });

                let builder = transactionBuilder();

                for (const asset of chunk) {
                    builder = builder.add(updateCoreAsset(umi, {
                        asset: publicKey(asset.address),
                        newUri: some(asset.uri),
                        newName: asset.name ? some(asset.name) : none(),
                    }));
                }

                builder = builder.add(setComputeUnitPrice(umi, { microLamports: 10_000 }));

                await builder.sendAndConfirm(umi);
                successfulCount += chunk.length;
            }

            toast.success(`Successfully revealed ${successfulCount} assets!`, { id: 'cm-reveal' });
            return true;
        } catch (err: any) {
            console.error("Reveal error:", err);
            const msg = err.message || "Failed to reveal assets";
            setError(msg);
            toast.error(msg, { id: 'cm-reveal' });
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi]);

    return {
        isLoading,
        error,
        deploySolanaCollection,
        createLaunchpadCandyMachine,
        createCollection,
        insertItemsToCandyMachine,
        deleteCandyMachine,
        batchRevealAssets,
        uploadFile,
        uploadFiles,
        uploadMetadata,
        uploadJsonMetadataBatch,
        deployBubblegumTree,
        mintCompressedCore,
    };
};
