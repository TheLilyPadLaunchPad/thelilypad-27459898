/**
 * 2025 Cart Checkout Flow
 * ────────────────────────
 * Modern Solana UX pattern that minimizes wallet signing prompts for creators.
 *
 * Old flow (4+ signatures):
 *   1. Pre-fund Irys for storage
 *   2. Deploy collection
 *   3. Deploy Bubblegum tree (for editions/cNFTs)
 *   4+ Mint NFTs (one sign per batch)
 *
 * New flow ("cart checkout"):
 *   Step 1: Upload assets — Turbo auto-debits per upload (no extra signing UI)
 *   Step 2: Show cost preview — exact breakdown before any on-chain tx
 *   Step 3: Execute — collection + mints batched into minimal transactions
 *           • 1-of-1 Core:   1 tx for collection, 1 tx for mint (often combinable)
 *           • Editions cNFT: 1 tx for collection, 1 tx for tree, then mint batches
 *
 * Progress callbacks surface each step so the UI can show a single checkout-style
 * modal instead of multiple loading spinners.
 */

import {
    Umi,
    generateSigner,
    publicKey,
    some,
    TransactionBuilder,
} from '@metaplex-foundation/umi';
import {
    createCollection as createCoreCollectionIx,
    create,
    fetchCollection,
    ruleSet,
} from '@metaplex-foundation/mpl-core';
import {
    createTreeV2,
    mintV2,
    findTreeConfigPda,
} from '@metaplex-foundation/mpl-bubblegum';
import { setComputeUnitPrice } from '@metaplex-foundation/mpl-toolbox';
import type { BatchNftItem } from './programs';

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface CartItem extends BatchNftItem {
    // name, uri, sellerFeeBasisPoints?, owner?
}

export interface CartCostEstimate {
    /** Arweave/Turbo storage cost (SOL). */
    storageCost: number;
    /** Rent for the Core Collection account (SOL). */
    collectionCost: number;
    /** Rent for the Bubblegum merkle tree (SOL). Compressed only. */
    treeCost?: number;
    /** Sum of mint transaction fees (SOL). */
    mintCost: number;
    /** Total cost in SOL. */
    total: number;
    /** Total number of on-chain transactions the user will sign. */
    transactionCount: number;
}

export interface CartCheckoutParams {
    name: string;
    /** Collection metadata URI (already uploaded). */
    uri: string;
    items: CartItem[];
    /** false → standard Core NFTs (1-of-1). true → compressed cNFTs (editions). */
    isCompressed: boolean;
    royaltyBasisPoints?: number;
    /**
     * On-chain creator attribution. Required for the asset to show a
     * "verified creator" on marketplaces / Metaplex Core Explorer. If
     * omitted we default to the connected wallet at 100%.
     */
    creators?: Array<{ address: string; share: number }>;
    onProgress?: (step: string, completed: number, total: number) => void;
    /** Skip collection/tree creation and reuse existing addresses (resume after partial failure). */
    resumeFrom?: {
        collectionAddress: string;
        treeAddress?: string;
    };
    /** Session ID for idempotency tracking (written by caller). */
    sessionId?: string;
    /** Called after each tx to record the signature (used for session logging). */
    onTransaction?: (txType: 'collection' | 'tree' | 'mint_batch', signature: Uint8Array, batchStart?: number, batchEnd?: number) => void;
}

export interface CartCheckoutResult {
    collectionAddress: string;
    treeAddress?: string;
    assetIds: string[];
    signatures: Uint8Array[];
    /** Items that failed to mint — non-empty means a partial failure occurred. */
    failedItems: CartItem[];
    /** Number of items successfully minted. */
    mintedCount: number;
}

// ────────────────────────────────────────────────────────────────────
// Cost estimation (no signing required)
// ────────────────────────────────────────────────────────────────────

/**
 * Produce a cost estimate for a cart checkout before the user commits.
 * All numbers are in SOL. These are conservative estimates — actual costs
 * are deterministic and typically a few % lower.
 */
export function estimateCartCost(
    itemCount: number,
    totalStorageBytes: number,
    isCompressed: boolean,
): CartCostEstimate {
    // Storage: Turbo charges roughly ~0.00002 SOL per MB for Arweave perma-storage.
    // Files < 100 KiB are free, but we assume the caller is uploading real art.
    const storageCost = Math.max(0, (totalStorageBytes / 1_000_000) * 0.00002);

    // Rent for a Core Collection account on Solana (~0.0015 SOL typical).
    const collectionCost = 0.0015;

    // Tree rent scales with depth/buffer. These brackets mirror the depth we pick below.
    const treeCost = isCompressed
        ? itemCount <= 8
            ? 0.002
            : itemCount <= 100
                ? 0.01
                : 0.02
        : undefined;

    // Batch sizes per transaction.
    const mintPerTx = isCompressed ? 10 : 4;
    const mintTxCount = Math.ceil(itemCount / mintPerTx);
    // Network fee per mint tx — small but nonzero with priority fees.
    const mintCost = mintTxCount * 0.0005;

    // Transaction count reflects the single-sign deploy:
    //   1 tx = pre-fund Turbo (storage)
    //   1 tx = deploy Core Collection
    //   1 tx = create CM + Guard + Wrap (all batched into ONE tx)
    // For launchpad deploys, buyers mint later — no mint txs at deploy time.
    // For direct cart checkout (no CM), mint batches still apply.
    const onchainTxCount = 1 /* pre-fund */ + 1 /* collection */ + 1 /* CM+Guard+Wrap */;

    return {
        storageCost,
        collectionCost,
        treeCost,
        mintCost,
        total: storageCost + collectionCost + (treeCost ?? 0) + mintCost,
        transactionCount: onchainTxCount,
    };
}

// ────────────────────────────────────────────────────────────────────
// Tree sizing helpers (compressed flow only)
// ────────────────────────────────────────────────────────────────────

function pickTreeParams(itemCount: number) {
    if (itemCount <= 8) return { maxDepth: 3, maxBufferSize: 8, canopyDepth: 0 };
    if (itemCount <= 100) return { maxDepth: 5, maxBufferSize: 8, canopyDepth: 0 };
    if (itemCount <= 16_384) return { maxDepth: 14, maxBufferSize: 64, canopyDepth: 8 };
    return { maxDepth: 17, maxBufferSize: 64, canopyDepth: 10 };
}

// ────────────────────────────────────────────────────────────────────
// Execution (one prompt at each step)
// ────────────────────────────────────────────────────────────────────

/**
 * Execute the cart checkout. This is the only place the creator is asked to
 * sign on-chain transactions — storage is paid for transparently by Turbo
 * during upload (handled elsewhere).
 *
 * Transaction count:
 *   • Standard Core (1-of-1 / small drops): 1 tx collection + ceil(n/4) tx mints
 *   • Compressed cNFTs (editions):          1 tx collection + 1 tx tree + ceil(n/10) tx mints
 */
export async function executeCartCheckout(
    umi: Umi,
    params: CartCheckoutParams,
): Promise<CartCheckoutResult> {
    const {
        name,
        uri,
        items,
        isCompressed,
        royaltyBasisPoints = 0,
        creators,
        onProgress,
    } = params;

    if (items.length === 0) throw new Error('Cart is empty');

    const totalSteps = 1 /* collection */ + (isCompressed ? 1 : 0) + Math.ceil(items.length / (isCompressed ? 10 : 4));
    let stepIndex = 0;
    const bumpStep = (label: string) => {
        stepIndex += 1;
        onProgress?.(label, stepIndex, totalSteps);
    };

    const result: CartCheckoutResult = {
        collectionAddress: '',
        assetIds: [],
        signatures: [],
        failedItems: [],
        mintedCount: 0,
    };

    // ── Step 1: Create Core Collection (or resume from existing) ───
    if (params.resumeFrom) {
        result.collectionAddress = params.resumeFrom.collectionAddress;
        if (params.resumeFrom.treeAddress) result.treeAddress = params.resumeFrom.treeAddress;
        bumpStep('Resuming from existing collection');
    }
    onProgress?.('Creating collection…', 0, totalSteps);
    const collectionSigner = generateSigner(umi);

    // Attach a Royalties plugin so the collection (and, by inheritance, every
    // member Asset) carries verified creator attribution. Without this,
    // marketplaces render the collection as "unverified creator".
    const resolvedCreators = (creators && creators.length > 0
        ? creators
        : [{ address: umi.identity.publicKey.toString(), share: 100 }]
    ).map((c) => ({ address: publicKey(c.address), percentage: c.share }));

    const collectionPlugins: any[] = [
        {
            type: 'Royalties',
            basisPoints: royaltyBasisPoints,
            creators: resolvedCreators,
            ruleSet: ruleSet('None'),
        },
    ];
    if (isCompressed) collectionPlugins.push({ type: 'BubblegumV2' });

    const collectionBuilder = createCoreCollectionIx(umi, {
        collection: collectionSigner,
        name,
        uri,
        plugins: collectionPlugins,
    }).add(setComputeUnitPrice(umi, { microLamports: 50_000 }));

    let skipCollection = !!params.resumeFrom;
    if (!skipCollection) {
        const collectionResp = await collectionBuilder.sendAndConfirm(umi, {
            send: { skipPreflight: false },
            confirm: { commitment: 'confirmed' },
        });
        result.collectionAddress = collectionSigner.publicKey.toString();
        result.signatures.push(collectionResp.signature);
        params.onTransaction?.('collection', collectionResp.signature);
        bumpStep('Collection created');
    }

    // ── Step 2 (compressed only): Create Bubblegum tree ─────────────
    let treeAddress: string | undefined = params.resumeFrom?.treeAddress;
    if (isCompressed && !treeAddress) {
        onProgress?.('Creating merkle tree…', stepIndex, totalSteps);
        const merkleTree = generateSigner(umi);
        const { maxDepth, maxBufferSize, canopyDepth } = pickTreeParams(items.length);

        const treeBuilder = await createTreeV2(umi, {
            merkleTree,
            maxDepth,
            maxBufferSize,
            canopyDepth,
        });
        const treeResp = await setComputeUnitPrice(umi, { microLamports: 100_000 })
            .add(treeBuilder)
            .sendAndConfirm(umi, {
                send: { skipPreflight: false },
                confirm: { commitment: 'confirmed' },
            });
        treeAddress = merkleTree.publicKey.toString();
        result.treeAddress = treeAddress;
        result.signatures.push(treeResp.signature);
        params.onTransaction?.('tree', treeResp.signature);
        bumpStep('Merkle tree created');

        // Brief propagation wait — same RPC + confirmed commitment is usually <1s.
        const treeConfig = findTreeConfigPda(umi, { merkleTree: publicKey(treeAddress) });
        const deadline = Date.now() + 8_000;
        while (Date.now() < deadline) {
            const acct = await umi.rpc.getAccount(treeConfig[0]);
            if (acct.exists) break;
            await new Promise((r) => setTimeout(r, 300));
        }
    }

    // ── Step 3: Batch-mint items ────────────────────────────────────
    const BATCH_SIZE = isCompressed ? 10 : 4;
    const { friendlyCollectionFetchError } = await import('@/lib/launchpad/verifyDeploy');
    let collection;
    try {
        collection = await fetchCollection(umi, publicKey(result.collectionAddress));
    } catch (fetchErr: any) {
        const friendly = friendlyCollectionFetchError(fetchErr);
        if (friendly) throw new Error(friendly);
        throw fetchErr;
    }

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(items.length / BATCH_SIZE);
        onProgress?.(
            `Minting batch ${batchNumber}/${totalBatches}…`,
            stepIndex,
            totalSteps,
        );

        let builder = new TransactionBuilder().add(
            setComputeUnitPrice(umi, { microLamports: 50_000 }),
        );

        const batchAssetIds: string[] = [];

        if (isCompressed && treeAddress) {
            const treeConfig = findTreeConfigPda(umi, { merkleTree: publicKey(treeAddress) });
            for (const item of batch) {
                const leafOwner = item.owner ? publicKey(item.owner) : umi.identity.publicKey;
                builder = builder.add(
                    mintV2(umi, {
                        // CRITICAL for Bubblegum V2 + Core: the collection's
                        // update authority (or a delegate) MUST sign the mint,
                        // otherwise the cNFT is not linked/verified into the
                        // Core Collection.
                        collectionAuthority: umi.identity,
                        leafOwner,
                        merkleTree: publicKey(treeAddress),
                        treeConfig,
                        coreCollection: publicKey(result.collectionAddress),
                        metadata: {
                            name: item.name,
                            uri: item.uri,
                            sellerFeeBasisPoints:
                                item.sellerFeeBasisPoints ?? royaltyBasisPoints,
                            collection: some(publicKey(result.collectionAddress)),
                            creators: [],
                        },
                    }),
                );
                // cNFT asset IDs are derived from leaf index; skip here.
            }
        } else {
            for (const item of batch) {
                const asset = generateSigner(umi);
                builder = builder.add(
                    create(umi, {
                        asset,
                        collection,
                        owner: item.owner ? publicKey(item.owner) : umi.identity.publicKey,
                        name: item.name,
                        uri: item.uri,
                    }),
                );
                batchAssetIds.push(asset.publicKey.toString());
            }
        }

        try {
            const resp = await builder.sendAndConfirm(umi, {
                send: { commitment: 'confirmed', maxRetries: 3 },
                confirm: { commitment: 'confirmed' },
            });
            result.signatures.push(resp.signature);
            result.assetIds.push(...batchAssetIds);
            params.onTransaction?.('mint_batch', resp.signature, i, i + batch.length - 1);
            bumpStep(`Batch ${batchNumber}/${totalBatches} minted`);
        } catch (batchErr) {
            console.error(`[cartCheckout] Batch ${batchNumber} failed:`, batchErr);
            result.failedItems.push(...batch);
            bumpStep(`Batch ${batchNumber}/${totalBatches} failed`);
        }
    }
    result.mintedCount = items.length - result.failedItems.length;

    onProgress?.('Complete!', totalSteps, totalSteps);
    return result;
}
