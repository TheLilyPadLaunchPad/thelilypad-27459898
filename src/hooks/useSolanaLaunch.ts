import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useWallet } from '@/providers/WalletProvider';
import {
    createUmi,
    createCoreCollection,
    createCoreCandyMachine,
    createCoreCandyMachineHidden,
    revealHiddenCandyMachine,
    insertItemsToCandyMachine as insertItemsToChain,
    uploadFile as uploadFileToChain,
    uploadFiles as uploadFilesToChain,
    uploadMetadata as uploadMetadataToChain,
    uploadJsonBatch,
    uploadJsonManifest as uploadJsonManifestToChain,
    uploadBatchWithUmi,
    uploadSingleWithUmi,
    bundleCollectionDeployFromFiles,
    createBubblegumTree,
    mintCompressedCoreNft,
    batchMintCompressedCoreNft,
    batchMintCoreNft,
    bulkMintCompressedCollection,
    bulkMintCoreCollection,
    calculateBatchMintCost,
    estimateCartCost,
    executeCartCheckout,
    type BatchNftItem,
    type BulkMintResult,
    type BatchUploadItem,
    type BatchUploadResult,
    type BatchUploadResponse,
    type ArweaveManifestResult,
    type CartItem,
    type CartCostEstimate,
    type CartCheckoutParams,
    type CartCheckoutResult,
    type FileBundleAsset,
    type CollectionMetadataTemplate,
    type BundleDeployResult,
    type BundleDeployProgress,
} from '@/chains';
import type { LaunchpadPhase, SolanaCollectionParams } from '@/chains';
import { Umi, transactionBuilder, publicKey, some, none } from '@metaplex-foundation/umi';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { updateV1 as updateCoreAsset } from '@metaplex-foundation/mpl-core';
import { setComputeUnitPrice } from '@metaplex-foundation/mpl-toolbox';
import { deleteCandyMachine as deleteCoreCandyMachine, deleteCandyGuard as deleteCoreCandyGuard } from '@metaplex-foundation/mpl-core-candy-machine';
import { SendTransactionError } from '@solana/web3.js';
import { invalidateRpc } from '@/config/solana';
import { supabase } from '@/integrations/supabase/client';
import { debugStep, debugTx, debugUri, debugError, debugUpload } from '@/lib/deployDebug';

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
        debugUpload('solana.irys', 'uploadMetadata: start', { name: metadata?.name });
        try {
            const uri = await uploadMetadataToChain(umi, metadata);
            debugUri('solana.irys', uri, { name: metadata?.name });
            return uri;
        } catch (e: any) {
            debugError('solana.irys', `uploadMetadata failed: ${e?.message || e}`);
            throw e;
        }
    }, [getUmi]);

    /**
     * Upload multiple JSON metadata objects in batches
     */
    const uploadJsonMetadataBatch = useCallback(async (metadataArray: any[]) => {
        const umi = await getUmi();
        debugUpload('solana.irys', `uploadJsonBatch: start (${metadataArray.length} items)`);
        try {
            const uris = await uploadJsonBatch(umi, metadataArray);
            uris.slice(0, 5).forEach(u => debugUri('solana.irys', u));
            if (uris.length > 5) debugUpload('solana.irys', `…and ${uris.length - 5} more URIs`);
            return uris;
        } catch (e: any) {
            debugError('solana.irys', `uploadJsonBatch failed: ${e?.message || e}`);
            throw e;
        }
    }, [getUmi]);

    /**
     * Bundle metadata JSONs into a single Arweave directory manifest.
     * Returns a manifest root usable as prefixUri so per-item URIs become e.g.
     *   https://arweave.net/<ROOT>/0.json
     * This is the path that makes a hidden-settings Candy Machine deploy at
     * fixed cost (no addConfigLines).
     */
    const uploadJsonManifest = useCallback(async (
        metadataArray: any[]
    ): Promise<ArweaveManifestResult> => {
        const umi = await getUmi();
        debugUpload('solana.irys', `uploadJsonManifest: bundling ${metadataArray.length} items`);
        try {
            const result = await uploadJsonManifestToChain(umi, metadataArray);
            debugUri('solana.irys', result.manifestUri, {
                manifestRoot: result.manifestRoot,
                items: result.itemUris.length,
            });
            return result;
        } catch (e: any) {
            debugError('solana.irys', `uploadJsonManifest failed: ${e?.message || e}`);
            throw e;
        }
    }, [getUmi]);

    /**
     * Upload a batch of NFT assets using Umi's uploader interface (Irys-backed)
     * Includes thumbnail generation, progress tracking, and automatic funding
     */
    const uploadBatch = useCallback(async (
        items: BatchUploadItem[],
        onProgress?: (completed: number, total: number, status: string) => void,
        concurrency = 5,
        enableThumbnails = true,
        signal?: AbortSignal
    ): Promise<BatchUploadResponse> => {
        const umi = await getUmi();
        return uploadBatchWithUmi(umi, items, onProgress, concurrency, enableThumbnails, signal);
    }, [getUmi]);

    /**
     * Upload a single NFT asset using Umi's uploader interface (convenience wrapper)
     */
    const uploadSingle = useCallback(async (
        file: File,
        buildMetadata: (imageUri: string) => any,
        enableThumbnails = true
    ): Promise<BatchUploadResult> => {
        const umi = await getUmi();
        return uploadSingleWithUmi(umi, file, buildMetadata, enableThumbnails);
    }, [getUmi]);

    /**
     * 2025 Cart Checkout — deploy collection + mint all items in the minimum
     * number of signed transactions. Storage is paid transparently by Turbo
     * during upload (no extra signing step), so the creator only confirms
     * the on-chain work here.
     *
     * Usage pattern:
     *   1. Upload assets (uploadBatch / uploadSingle) — Turbo auto-debits.
     *   2. Show the user a CartCostEstimate (estimateCheckoutCost below).
     *   3. Call cartCheckout() once the user confirms.
     */
    const cartCheckout = useCallback(async (
        params: CartCheckoutParams,
    ): Promise<CartCheckoutResult> => {
        const umi = await getUmi();
        const creatorAddress = umi.identity.publicKey.toString();
        const sessionId = crypto.randomUUID();

        // Persist session so the creator can see it even if the tab closes mid-mint.
        await supabase.from('mint_sessions').insert({
            id: sessionId,
            creator_address: creatorAddress,
            status: 'pending',
            items_requested: params.items.length,
        } as any).then(undefined, (e: any) => console.warn('[session] insert failed:', e));

        const paramsWithSession: CartCheckoutParams = {
            ...params,
            sessionId,
            onTransaction: async (txType, signature, batchStart, batchEnd) => {
                const sigHex = Buffer.from(signature).toString('hex');
                debugTx('solana.cartCheckout', sigHex, { txType, batchStart, batchEnd });
                await supabase.from('mint_transactions').insert({
                    session_id: sessionId,
                    tx_signature: sigHex,
                    tx_type: txType,
                    batch_start: batchStart ?? null,
                    batch_end: batchEnd ?? null,
                    status: 'confirmed',
                } as any).then(undefined, (e: any) => console.warn('[session] tx log failed:', e));
                params.onTransaction?.(txType, signature, batchStart, batchEnd);
            },
        };

        try {
            const result = await executeCartCheckout(umi, paramsWithSession);
            const failed = result.failedItems.length;
            const total = params.items.length;
            const status = failed === 0 ? 'success' : failed === total ? 'failed' : 'partial';
            await supabase.from('mint_sessions').update({
                status,
                items_minted: result.mintedCount,
                collection_address: result.collectionAddress || null,
                tree_address: result.treeAddress ?? null,
                asset_ids: result.assetIds,
            } as any).eq('id', sessionId).then(undefined, (e: any) => console.warn('[session] update failed:', e));
            return result;
        } catch (err) {
            await supabase.from('mint_sessions').update({
                status: 'failed',
                error_message: err instanceof Error ? err.message : String(err),
            } as any).eq('id', sessionId).then(undefined, (e: any) => console.warn('[session] fail update:', e));
            throw err;
        }
    }, [getUmi]);

    /**
     * Pure cost preview (no signing, no network). Safe to call from the UI
     * whenever the cart contents or file sizes change.
     */
    const estimateCheckoutCost = useCallback((
        itemCount: number,
        totalStorageBytes: number,
        isCompressed: boolean,
    ): CartCostEstimate => {
        return estimateCartCost(itemCount, totalStorageBytes, isCompressed);
    }, []);

    /**
     * Deploy a Solana Core Collection
     */
    const deploySolanaCollection = useCallback(async (
        metadata: SolanaCollectionParams
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            debugStep('solana.deployCollection', `start: ${metadata.name}`, { uri: (metadata as any).uri, symbol: (metadata as any).symbol });
            return await withRetry(async (umi) => {
                toast.loading(`Deploying ${metadata.name} (Core)...`, { id: 'sol-deploy' });
                const result = await createCoreCollection(umi, metadata);
                debugStep('solana.deployCollection', `deployed: ${result.address}`, { address: result.address });
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
            debugError('solana.deployCollection', err?.message || String(err));

            if (err instanceof SendTransactionError && err.logs) {
                console.error("--- TRANSACTION LOGS ---");
                console.error(err.logs);
                debugError('solana.deployCollection', 'transaction logs', { logs: err.logs });
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
     * Batch mint multiple Compressed Core NFTs
     */
    const batchMintCompressedCore = useCallback(async (
        treeAddress: string,
        collectionAddress: string,
        items: BatchNftItem[]
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const umi = await getUmi();
            toast.loading(`Batch minting ${items.length} compressed NFTs...`, { id: 'batch-cnft-mint' });
            
            // Calculate and log estimated cost
            const cost = calculateBatchMintCost(items.length, 0, true);
            console.log(`Estimated batch mint cost: ${cost.total} SOL (${cost.networkFees} network + ${cost.platformFees} platform)`);
            
            const result = await batchMintCompressedCoreNft(umi, {
                treeAddress,
                collectionAddress,
                items,
                onProgress: (completed, total) => {
                    toast.loading(`Minted ${completed}/${total} NFTs...`, { id: 'batch-cnft-mint' });
                }
            });
            
            toast.success(`Successfully minted ${result.assetIds.length - result.failedIndices.length} NFTs!`, { id: 'batch-cnft-mint' });
            return result;
        } catch (err: any) {
            console.error("Batch Compressed Mint Error:", err);
            const msg = err.message || "Failed to batch mint Compressed NFTs";
            setError(msg);
            toast.error(msg, { id: 'batch-cnft-mint' });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi]);

    /**
     * Batch mint multiple standard Core NFTs
     */
    const batchMintCore = useCallback(async (
        collectionAddress: string | undefined,
        items: BatchNftItem[]
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const umi = await getUmi();
            toast.loading(`Batch minting ${items.length} Core NFTs...`, { id: 'batch-core-mint' });
            
            // Calculate and log estimated cost
            const cost = calculateBatchMintCost(items.length, 0, false);
            console.log(`Estimated batch mint cost: ${cost.total} SOL (${cost.networkFees} network + ${cost.platformFees} platform)`);
            
            const result = await batchMintCoreNft(umi, {
                collectionAddress,
                items,
                onProgress: (completed, total) => {
                    toast.loading(`Minted ${completed}/${total} NFTs...`, { id: 'batch-core-mint' });
                }
            });
            
            toast.success(`Successfully minted ${result.assetIds.length - result.failedIndices.length} Core NFTs!`, { id: 'batch-core-mint' });
            return result;
        } catch (err: any) {
            console.error("Batch Core Mint Error:", err);
            const msg = err.message || "Failed to batch mint Core NFTs";
            setError(msg);
            toast.error(msg, { id: 'batch-core-mint' });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi]);

    /**
     * Bulk mint a large collection of compressed NFTs (100-1000+)
     * Automatically splits into multiple transactions
     */
    const bulkMintCompressedLarge = useCallback(async (
        treeAddress: string,
        collectionAddress: string,
        items: BatchNftItem[]
    ): Promise<BulkMintResult> => {
        setIsLoading(true);
        setError(null);
        try {
            const umi = await getUmi();
            
            // Calculate transactions needed
            const cost = calculateBatchMintCost(items.length, 0, true);
            console.log(`Bulk minting ${items.length} cNFTs across ${cost.transactionCount} transactions`);
            console.log(`Estimated cost: ${cost.total} SOL (${cost.networkFees} network + ${cost.platformFees} platform)`);
            
            const result = await bulkMintCompressedCollection(umi, {
                treeAddress,
                collectionAddress,
                items,
                onProgress: ({ currentTransaction, totalTransactions, totalMinted, totalItems }) => {
                    toast.loading(
                        `Transaction ${currentTransaction}/${totalTransactions}: ${totalMinted}/${totalItems} minted`,
                        { id: 'bulk-cnft-mint' }
                    );
                },
            });
            
            toast.success(
                `Successfully minted ${result.totalMinted} NFTs across ${result.transactions.length} transactions!`,
                { id: 'bulk-cnft-mint' }
            );
            return result;
        } catch (err: any) {
            console.error("Bulk Compressed Mint Error:", err);
            const msg = err.message || "Failed to bulk mint Compressed NFTs";
            setError(msg);
            toast.error(msg, { id: 'bulk-cnft-mint' });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi]);

    /**
     * Bulk mint a large collection of standard Core NFTs (100-500+)
     * Automatically splits into multiple transactions
     */
    const bulkMintCoreLarge = useCallback(async (
        collectionAddress: string | undefined,
        items: BatchNftItem[]
    ): Promise<BulkMintResult> => {
        setIsLoading(true);
        setError(null);
        try {
            const umi = await getUmi();
            
            // Calculate transactions needed
            const cost = calculateBatchMintCost(items.length, 0, false);
            console.log(`Bulk minting ${items.length} Core NFTs across ${cost.transactionCount} transactions`);
            console.log(`Estimated cost: ${cost.total} SOL (${cost.networkFees} network + ${cost.platformFees} platform)`);
            
            const result = await bulkMintCoreCollection(umi, {
                collectionAddress,
                items,
                onProgress: ({ currentTransaction, totalTransactions, totalMinted, totalItems }) => {
                    toast.loading(
                        `Transaction ${currentTransaction}/${totalTransactions}: ${totalMinted}/${totalItems} minted`,
                        { id: 'bulk-core-mint' }
                    );
                },
            });
            
            toast.success(
                `Successfully minted ${result.totalMinted} Core NFTs across ${result.transactions.length} transactions!`,
                { id: 'bulk-core-mint' }
            );
            return result;
        } catch (err: any) {
            console.error("Bulk Core Mint Error:", err);
            const msg = err.message || "Failed to bulk mint Core NFTs";
            setError(msg);
            toast.error(msg, { id: 'bulk-core-mint' });
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
            debugStep('solana.candyMachine', `step 1/3 createCoreCandyMachine`, {
                collectionAddress, itemsAvailable, uri: metadata.uri, phases: phases.length,
            });
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
                debugStep('solana.candyMachine', `step 2/3 candyMachine ready: ${result.address}`, result);
                if (result.candyGuardAddress) {
                    debugStep('solana.candyMachine', `step 3/3 candyGuard: ${result.candyGuardAddress}`);
                }
                toast.success(`Candy Machine Ready with Guards!`, { id: 'cm-create' });
                return result;
            });
        } catch (err: any) {
            console.error("Candy Machine creation error:", err);
            debugError('solana.candyMachine', err?.message || String(err));

            if (err instanceof SendTransactionError && err.logs) {
                console.error("--- TRANSACTION LOGS ---");
                console.error(err.logs);
                debugError('solana.candyMachine', 'transaction logs', { logs: err.logs });
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
     * Create a Hidden Settings Candy Machine for large collections (3 sigs total)
     */
    const createHiddenSettingsCandyMachine = useCallback(async (
        collectionAddress: string,
        items: { name: string; uri: string }[],
        phases: LaunchpadPhase[],
        placeholderName: string,
        placeholderUri: string,
        treasuryWallet?: string
    ): Promise<{ address: string; candyGuardAddress: string; itemsHash: Uint8Array }> => {
        setIsLoading(true);
        setError(null);
        try {
            return await withRetry(async (umi) => {
                toast.loading(`Creating Hidden Settings Candy Machine...`, { id: 'cm-hidden' });
                const result = await createCoreCandyMachineHidden(
                    umi,
                    collectionAddress,
                    items,
                    phases,
                    placeholderName,
                    placeholderUri,
                    treasuryWallet
                );
                toast.success(`Hidden Settings Candy Machine Ready!`, { id: 'cm-hidden' });
                return result;
            });
        } catch (err: any) {
            console.error("Hidden Settings CM creation error:", err);
            const msg = extractSolanaError(err);
            setError(msg);
            toast.error(msg, { id: 'cm-hidden', description: "Check logs for details." });
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
            debugStep('solana.candyMachine', `insertItems start (${items.length}, batch ${batchSize})`, { candyMachineAddress });
            await withRetry(async (umi) => {
                toast.loading(`Inserting items...`, { id: 'cm-insert' });
                await insertItemsToChain(umi, candyMachineAddress, items, batchSize);
            });
            debugStep('solana.candyMachine', `insertItems done (${items.length})`);
            toast.success(`Items inserted successfully!`, { id: 'cm-insert' });
        } catch (err: any) {
            console.error("Insert items error:", err);
            debugError('solana.candyMachine', `insertItems failed: ${err?.message || err}`);
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

    /**
     * Reveal a hidden-settings Candy Machine (Step 1 of 2).
     *
     * Calls updateCandyMachine on-chain to:
     *   - Clear hiddenSettings
     *   - Set configLineSettings.prefixUri = https://arweave.net/<manifestRoot>/
     *
     * Step 2 (asset-level URI updates) is handled by batchRevealAssets.
     *
     * @param candyMachineAddress  On-chain CM public key
     * @param manifestRoot         43-char Arweave TX id from the deploy step
     * @param itemCount            Total items in the collection
     * @returns                    Transaction signature string
     */
    const revealCandyMachine = useCallback(async (
        candyMachineAddress: string,
        manifestRoot: string,
        itemCount: number,
    ): Promise<string> => {
        setIsLoading(true);
        setError(null);
        try {
            debugStep('solana.reveal', `revealCandyMachine start`, {
                candyMachineAddress,
                manifestRoot,
                itemCount,
            });
            const sig = await withRetry(async (umi) => {
                toast.loading('Revealing Candy Machine (updating on-chain settings)…', { id: 'cm-reveal-hidden' });
                return revealHiddenCandyMachine(umi, candyMachineAddress, manifestRoot, itemCount);
            });
            debugTx('solana.reveal', sig, { step: 'updateCandyMachine' });
            toast.success('Candy Machine revealed! Future mints will get real metadata.', { id: 'cm-reveal-hidden' });
            return sig;
        } catch (err: any) {
            console.error('[reveal] updateCandyMachine error:', err);
            debugError('solana.reveal', err?.message || String(err));
            const msg = extractSolanaError(err);
            setError(msg);
            toast.error(msg, { id: 'cm-reveal-hidden' });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi, withRetry]);

    /**
     * deployHiddenCollection — One-bundle, fixed-cost deploy pipeline
     *
     * Implements the best-in-class architecture:
     *   1. Generate all metadata locally (no network calls)
     *   2. Upload all images as one Irys bundle
     *   3. Generate all metadata JSONs locally referencing real image URIs
     *   4. Upload metadata JSONs + Arweave path-manifest as one Irys bundle
     *   5. Create Candy Machine with hiddenSettings
     *   6. Create Candy Guard (wraps in phases/guards)
     *
     * Result: 2 Irys uploads + 3 Solana signatures regardless of collection size.
     *
     * @param files              Browser File objects (images)
     * @param template           Shared metadata fields (name prefix, description, …)
     * @param collectionAddress  Already-deployed Core Collection address
     * @param phases             Launchpad phases (start time, price, guards)
     * @param placeholderName    Name shown while hidden (e.g. "My Collection #")
     * @param treasuryWallet     Optional treasury override for guard payments
     * @param onProgress         Progress callback for upload status
     */
    const deployHiddenCollection = useCallback(async (
        files:             FileBundleAsset[],
        template:          CollectionMetadataTemplate,
        collectionAddress: string,
        phases:            LaunchpadPhase[],
        placeholderName:   string,
        treasuryWallet?:   string,
        onProgress?:       (p: BundleDeployProgress) => void,
    ): Promise<{
        bundleResult:       BundleDeployResult;
        candyMachineAddress: string;
        candyGuardAddress:   string;
    }> => {
        setIsLoading(true);
        setError(null);
        try {
            const umi = await getUmi();

            // ── Step 1 + 2 + 3: bundle upload ──────────────────────────────
            debugStep('solana.deployHidden', `starting bundle deploy (${files.length} items)`);
            toast.loading('Uploading collection assets to Arweave…', { id: 'bundle-deploy' });

            const bundleResult = await bundleCollectionDeployFromFiles(
                umi,
                files,
                template,
                (p: BundleDeployProgress) => {
                    onProgress?.(p);
                    debugUpload('solana.deployHidden', p.message, { pct: p.pct });
                },
            );

            debugUri('solana.deployHidden', bundleResult.manifestUri, {
                manifestRoot: bundleResult.manifestRoot,
                items:        bundleResult.itemCount,
            });

            toast.loading('Creating Candy Machine with hidden settings…', { id: 'bundle-deploy' });

            // ── Step 4: on-chain CM + guard ─────────────────────────────────
            const cmResult = await withRetry(async (umiRetry) => {
                return createCoreCandyMachineHidden(
                    umiRetry,
                    collectionAddress,
                    // items[] only used for itemCount in hidden mode — one placeholder
                    Array.from({ length: bundleResult.itemCount }, (_, i) => ({
                        name: `${placeholderName}${i}`,
                        uri:  bundleResult.placeholderUri,
                    })),
                    phases,
                    placeholderName,
                    bundleResult.placeholderUri,
                    treasuryWallet,
                    bundleResult.itemsHash,
                );
            });

            debugStep('solana.deployHidden', 'CM + guard deployed', {
                cm:    cmResult.address,
                guard: cmResult.candyGuardAddress,
            });

            toast.success(
                `Collection deployed! ${bundleResult.itemCount} items, 1 Arweave bundle, 3 Solana txs.`,
                { id: 'bundle-deploy' }
            );

            return {
                bundleResult,
                candyMachineAddress: cmResult.address,
                candyGuardAddress:   cmResult.candyGuardAddress,
            };
        } catch (err: any) {
            console.error('[deployHiddenCollection] error:', err);
            debugError('solana.deployHidden', err?.message || String(err));
            const msg = extractSolanaError(err);
            setError(msg);
            toast.error(msg, { id: 'bundle-deploy' });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi, withRetry]);

    /**
     * Deploy Collection and Candy Machine via Backend
     */
    const deployViaBackend = useCallback(async (params: {
        collectionId: string;
        name: string;
        symbol: string;
        uri: string;
        creatorAddress: string;
        itemsAvailable: number;
        phases: LaunchpadPhase[];
        baseUri?: string;
        royaltyPercent?: number;
        network?: string;
    }) => {
        setIsLoading(true);
        setError(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Must be logged in to deploy via backend");

            // Use the Supabase SDK transport (avoids the Lovable preview fetch-proxy
            // "Failed to fetch" issue that happens with raw fetch to /functions/v1).
            const { data, error: fnError } = await supabase.functions.invoke(
                'deploy-metaplex-launchpad',
                { body: params }
            );

            if (fnError) {
                // FunctionsHttpError exposes the server JSON via fnError.context
                let serverMsg = fnError.message;
                try {
                    const ctx: any = (fnError as any).context;
                    if (ctx && typeof ctx.json === 'function') {
                        const j = await ctx.json();
                        if (j?.error) serverMsg = j.error;
                    } else if (ctx?.error) {
                        serverMsg = ctx.error;
                    }
                } catch { /* ignore */ }
                throw new Error(serverMsg || 'Backend deployment failed');
            }

            if (data?.error) throw new Error(data.error);
            return data;
        } catch (err: any) {
            console.error("Backend deploy error:", err);
            setError(err.message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        isLoading,
        error,
        // ── Best-in-class fixed-cost deploy ──
        deployHiddenCollection,
        deployViaBackend,
        // ── Existing helpers ──
        deploySolanaCollection,
        createLaunchpadCandyMachine,
        createHiddenSettingsCandyMachine,
        revealCandyMachine,
        createCollection,
        insertItemsToCandyMachine,
        deleteCandyMachine,
        batchRevealAssets,
        uploadFile,
        uploadFiles,
        uploadMetadata,
        uploadJsonMetadataBatch,
        uploadJsonManifest,
        uploadBatch,
        uploadSingle,
        cartCheckout,
        estimateCheckoutCost,
        deployBubblegumTree,
        mintCompressedCore,
        batchMintCompressedCore,
        batchMintCore,
        bulkMintCompressedLarge,
        bulkMintCoreLarge,
        calculateBatchMintCost,
    };
};
