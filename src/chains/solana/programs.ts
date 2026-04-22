import {
    publicKey,
    generateSigner,
    some,
    sol,
    Signer,
    none,
    dateTime,
    Umi,
    TransactionBuilder,
} from '@metaplex-foundation/umi';
import {
    createCollection as createCoreCollectionIx,
    updateV1 as updateCoreAsset,
    create,
    fetchCollection,
    ruleSet,
} from '@metaplex-foundation/mpl-core';
import {
    createTreeV2,
    mintV2,
    parseLeafFromMintV2Transaction,
    findTreeConfigPda,
} from '@metaplex-foundation/mpl-bubblegum';
import {
    createCandyMachine as createCoreCandyMachineIx,
    fetchCandyMachine,
    addConfigLines,
    createCandyGuard as createCoreCandyGuardIx,
    wrap,
    findCandyGuardPda,
    deleteCandyMachine as deleteCoreCandyMachine,
    deleteCandyGuard as deleteCoreCandyGuard,
    DefaultGuardSetArgs as CoreDefaultGuardSetArgs,
    GuardGroupArgs as CoreGuardGroupArgs,
} from '@metaplex-foundation/mpl-core-candy-machine';
import { setComputeUnitPrice, setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';
import { SolanaCollectionParams, SolanaCollectionResult, CandyMachineItem } from './types';
import { buildProtocolMemo, MEMO_PROGRAM_ID } from '@/lib/solanaProtocol';
import { PLATFORM_WALLETS, getLaunchpadFeeSplit } from '@/config/treasury';
import { toast } from 'sonner';

/**
 * Solana Programs - Metaplex Core & Candy Machine Wrappers
 */

// Utility: Clamp values to prevent serialization overflow
const clampU32 = (value: number): number => Math.min(value, 4294967295);
const clampU16 = (value: number): number => Math.min(value, 65535);

export interface LaunchpadPhase {
    id: string;
    price: number;
    startTime: Date | null;
    endTime: Date | null;
    merkleRoot?: string | null;
    maxPerWallet?: number;
    payment?: {
        type: 'sol' | 'token';
        amount: number;
        mint?: string;
        destination?: string;
    };
    nftGate?: {
        collection: string;
        burn?: boolean;
    };
    gatekeeper?: {
        network: string;
        expireOnUse: boolean;
    };
    addressGate?: string[];
    mintLimit?: {
        id: number;
        limit: number;
    };
}

/**
 * Create a Metaplex Core Collection
 */
export async function createCoreCollection(
    umi: Umi,
    params: SolanaCollectionParams
): Promise<SolanaCollectionResult> {
    const collectionSigner = generateSigner(umi);

    console.log("=== CREATING CORE COLLECTION ===");
    console.log("🎯 Collection:", collectionSigner.publicKey.toString());

    // Create memo instruction
    const memoData = buildProtocolMemo('launchpad:deploy_collection', { standard: 'core' });

    // Retry logic for blockhash issues
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            await umi.rpc.getLatestBlockhash();

            // Assemble collection plugins:
            //  • Royalties — required so member Assets inherit verified creator
            //    attribution. Without it, marketplaces and Metaplex Core Explorer
            //    render the collection/NFTs as "unverified creator".
            //  • BubblegumV2 — required for any collection that will receive
            //    compressed NFTs via Bubblegum's `mintV2`. Without it, the mint
            //    fails with `CollectionMustHaveBubblegumPlugin`.
            const resolvedCreators = (params.creators && params.creators.length > 0
                ? params.creators
                : [{ address: umi.identity.publicKey.toString(), share: 100 }]
            ).map((c) => ({ address: publicKey(c.address), percentage: c.share }));

            const collectionPlugins: any[] = [
                {
                    type: 'Royalties',
                    basisPoints: params.sellerFeeBasisPoints ?? 0,
                    creators: resolvedCreators,
                    ruleSet: ruleSet('None'),
                },
            ];
            if (params.withBubblegumV2) {
                collectionPlugins.push({ type: 'BubblegumV2' });
            }

            let builder = createCoreCollectionIx(umi, {
                collection: collectionSigner,
                name: params.name,
                uri: params.uri,
                plugins: collectionPlugins,
            })
                .add({
                    instruction: {
                        programId: publicKey(MEMO_PROGRAM_ID.toBase58()),
                        keys: [],
                        data: new Uint8Array(Buffer.from(memoData, 'utf-8')),
                    },
                    bytesCreatedOnChain: 0,
                    signers: [],
                })
                .add(setComputeUnitPrice(umi, { microLamports: 50_000 }));

            await builder.sendAndConfirm(umi, {
                send: { skipPreflight: false },
                confirm: { commitment: 'confirmed' }
            });

            break; // Success
        } catch (innerErr: any) {
            attempts++;
            console.warn(`Collection deployment attempt ${attempts} failed:`, innerErr.message);

            if (attempts >= maxAttempts) throw innerErr;

            if (innerErr.message?.includes("Blockhash not found") || innerErr.message?.includes("blockhash")) {
                console.log("Retrying with fresh blockhash...");
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }
            throw innerErr;
        }
    }

    return {
        address: collectionSigner.publicKey.toString(),
        signer: collectionSigner,
    };
}

/**
 * Build guard configuration for a single phase
 */
function buildGuardSetForPhase(
    phase: LaunchpadPhase,
    treasuryWallet: string
): Partial<CoreDefaultGuardSetArgs> {
    const guards: Partial<CoreDefaultGuardSetArgs> = {};

    // 1. Payment Guard (SOL or Token)
    if (phase.payment?.type === 'token' && phase.payment.mint) {
        guards.tokenPayment = some({
            amount: BigInt(phase.payment.amount * 1000000),
            mint: publicKey(phase.payment.mint),
            destinationAta: publicKey(phase.payment.destination || treasuryWallet),
        });
    } else if (phase.price > 0 || (phase.payment?.type === 'sol' && phase.payment.amount > 0)) {
        const amount = phase.payment?.amount || phase.price;
        guards.solPayment = some({
            lamports: sol(amount),
            destination: publicKey(phase.payment?.destination || treasuryWallet),
        });
    }

    // 2. Start/End Date
    if (phase.startTime) {
        guards.startDate = some({ date: dateTime(phase.startTime) });
    }
    if (phase.endTime) {
        guards.endDate = some({ date: dateTime(phase.endTime) });
    }

    // 3. Mint Limit (Per Wallet)
    if (phase.maxPerWallet && phase.maxPerWallet > 0) {
        const limitId = parseInt(phase.id.replace(/\D/g, '') || '1', 10) % 256;
        guards.mintLimit = some({
            id: limitId,
            limit: clampU16(phase.maxPerWallet),
        });
    }

    // 4. Allowlist (Merkle Root)
    if (phase.merkleRoot) {
        const rootHex = phase.merkleRoot.startsWith('0x') ? phase.merkleRoot.slice(2) : phase.merkleRoot;
        const merkleRootBytes = new Uint8Array(rootHex.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []);
        if (merkleRootBytes.length === 32) {
            guards.allowList = some({ merkleRoot: merkleRootBytes });
        }
    }

    // 5. NFT Gate
    if (phase.nftGate) {
        guards.nftGate = some({
            requiredCollection: publicKey(phase.nftGate.collection),
        });
    }

    // 6. Address Gate
    if (phase.addressGate && phase.addressGate.length > 0) {
        guards.addressGate = some({
            address: publicKey(phase.addressGate[0]), // Support single address for now
        });
    }

    return guards;
}

/**
 * Build guard groups for multiple phases
 */
function buildGuardGroups(
    phases: LaunchpadPhase[],
    treasuryWallet: string
): CoreGuardGroupArgs<CoreDefaultGuardSetArgs>[] {
    return phases.map((phase) => {
        const guards = buildGuardSetForPhase(phase, treasuryWallet);

        return {
            label: phase.id,
            guards: {
                botTax: none(),
                solPayment: guards.solPayment || none(),
                tokenPayment: guards.tokenPayment || none(),
                startDate: guards.startDate || none(),
                thirdPartySigner: none(),
                tokenGate: none(),
                gatekeeper: guards.gatekeeper || none(),
                endDate: guards.endDate || none(),
                allowList: guards.allowList || none(),
                mintLimit: guards.mintLimit || none(),
                nftPayment: none(),
                redeemedAmount: none(),
                addressGate: guards.addressGate || none(),
                nftGate: guards.nftGate || none(),
                nftBurn: none(),
                tokenBurn: none(),
                freezeSolPayment: none(),
                freezeTokenPayment: none(),
                programGate: none(),
                allocation: none(),
                token2022Payment: none(),
                solFixedFee: none(),
                nftMintLimit: none(),
                edition: none(),
                assetPayment: none(),
                assetBurn: none(),
                assetMintLimit: none(),
                assetBurnMulti: none(),
                assetPaymentMulti: none(),
                assetGate: none(),
                vanityMint: none(),
            },
        };
    });
}

/**
 * Build default guards (applied when no group is specified)
 */
function buildDefaultGuards(
    defaultPrice: number,
    treasuryWallet: string
): CoreDefaultGuardSetArgs {
    return {
        botTax: some({
            lamports: sol(0.01),
            lastInstruction: true,
        }),
        solPayment: defaultPrice > 0 ? some({
            lamports: sol(defaultPrice),
            destination: publicKey(treasuryWallet),
        }) : none(),
        tokenPayment: none(),
        startDate: none(),
        thirdPartySigner: none(),
        tokenGate: none(),
        gatekeeper: none(),
        endDate: none(),
        allowList: none(),
        mintLimit: none(),
        nftPayment: none(),
        redeemedAmount: none(),
        addressGate: none(),
        nftGate: none(),
        nftBurn: none(),
        tokenBurn: none(),
        freezeSolPayment: none(),
        freezeTokenPayment: none(),
        programGate: none(),
        allocation: none(),
        token2022Payment: none(),
        solFixedFee: none(),
        nftMintLimit: none(),
        edition: none(),
        assetPayment: none(),
        assetBurn: none(),
        assetMintLimit: none(),
        assetBurnMulti: none(),
        assetPaymentMulti: none(),
        assetGate: none(),
        vanityMint: none(),
    };
}

/**
 * Create a Core Candy Machine with guards
 */
export async function createCoreCandyMachine(
    umi: Umi,
    collectionAddress: string,
    itemsAvailable: number,
    phases: LaunchpadPhase[],
    treasuryWallet?: string,
    baseUri?: string
): Promise<{ address: string; candyGuardAddress: string }> {
    const candyMachine = generateSigner(umi);
    const candyGuard = generateSigner(umi);
    const collectionMint = publicKey(collectionAddress);

    const treasury = treasuryWallet || PLATFORM_WALLETS.solana.treasury;
    const primaryPhase = phases.find(p => p.price > 0) || phases[0];
    const primaryPrice = primaryPhase?.price || 0;

    console.log("[CM] Creating Core Candy Machine for:", collectionAddress);
    console.log("[CM] Items available:", itemsAvailable);
    console.log("[CM] Phases:", phases.length);
    console.log("[CM] Treasury wallet:", treasury);

    // Retry logic for CM creation
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            await umi.rpc.getLatestBlockhash();

            // Step 1: Create the Core Candy Machine
            const cmBuilder = createCoreCandyMachineIx(umi, {
                candyMachine,
                collection: collectionMint,
                collectionUpdateAuthority: umi.identity,
                itemsAvailable: BigInt(clampU32(itemsAvailable)),
                configLineSettings: some({
                    prefixName: "",
                    nameLength: 32,
                    prefixUri: baseUri || "",
                    uriLength: baseUri ? 50 : 200,
                    isSequential: false,
                }),
            });

            // Add protocol memo
            const memoData = buildProtocolMemo('launchpad:create_candy_machine', {
                collection: collectionAddress.slice(0, 8),
                items: String(itemsAvailable)
            });

            const memoInstruction = {
                instruction: {
                    programId: publicKey(MEMO_PROGRAM_ID.toBase58()),
                    keys: [],
                    data: new Uint8Array(Buffer.from(memoData, 'utf-8')),
                },
                bytesCreatedOnChain: 0,
                signers: [],
            };

            const finalBuilder = (await cmBuilder).add(memoInstruction)
                .add(setComputeUnitPrice(umi, { microLamports: 100_000 }))
                .add(setComputeUnitLimit(umi, { units: 800_000 }));

            await finalBuilder.sendAndConfirm(umi, {
                send: { skipPreflight: false },
                confirm: { commitment: 'confirmed' }
            });

            break;
        } catch (innerErr: any) {
            attempts++;
            console.warn(`CM Creation attempt ${attempts} failed:`, innerErr.message);
            if (attempts >= maxAttempts) throw innerErr;
            if (innerErr.message?.includes("Blockhash not found") || innerErr.message?.includes("blockhash")) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
            throw innerErr;
        }
    }

    console.log("[CM] Candy Machine created:", candyMachine.publicKey.toString());

    // Step 2: Create Candy Guard with phase-based groups
    const defaultGuards = buildDefaultGuards(primaryPrice, treasury);
    const guardGroups = buildGuardGroups(phases, treasury);

    const candyGuardPda = findCandyGuardPda(umi, { base: candyGuard.publicKey });

    const createGuardBuilder = createCoreCandyGuardIx(umi, {
        base: candyGuard,
        guards: defaultGuards,
        groups: guardGroups.length > 0 ? guardGroups : undefined,
    });

    await createGuardBuilder
        .add(setComputeUnitPrice(umi, { microLamports: 100_000 }))
        .sendAndConfirm(umi, {
            send: { skipPreflight: false },
            confirm: { commitment: 'confirmed' }
        });

    // Verify Guard Account Exists
    let guardAccount = await umi.rpc.getAccount(candyGuardPda[0]);
    let retries = 0;
    while (!guardAccount.exists && retries < 3) {
        await new Promise(r => setTimeout(r, 500));
        guardAccount = await umi.rpc.getAccount(candyGuardPda[0]);
        retries++;
    }

    if (!guardAccount.exists) {
        throw new Error("Candy Guard account failed to initialize");
    }

    console.log("[CM] Candy Guard confirmed at:", candyGuardPda[0].toString());

    // Step 3: Wrap the Candy Machine with the Candy Guard
    const wrapBuilder = wrap(umi, {
        candyGuard: candyGuardPda[0],
        candyMachine: candyMachine.publicKey,
        candyMachineAuthority: umi.identity,
    });

    await wrapBuilder
        .add(setComputeUnitPrice(umi, { microLamports: 50_000 }))
        .sendAndConfirm(umi);

    console.log("[CM] Candy Machine wrapped with Guard successfully!");

    // Log fee distribution
    const feeSplit = getLaunchpadFeeSplit(primaryPrice);
    console.log("[CM] Fee distribution for price", primaryPrice, "SOL:");
    console.log("  - Creator:", feeSplit.creatorAmount, "SOL");
    console.log("  - Treasury:", feeSplit.treasuryAmount, "SOL");
    console.log("  - Team:", feeSplit.teamAmount, "SOL");
    console.log("  - Buyback:", feeSplit.buybackAmount, "SOL");

    return {
        address: candyMachine.publicKey.toString(),
        candyGuardAddress: candyGuardPda[0].toString(),
    };
}

/**
 * Insert items/assets into a Candy Machine
 */
export async function insertItemsToCandyMachine(
    umi: Umi,
    candyMachineAddress: string,
    items: CandyMachineItem[],
    batchSize = 20
): Promise<void> {
    const cmPublicKey = publicKey(candyMachineAddress);

    // Fetch to get current index
    const candyMachine = await fetchCandyMachine(umi, cmPublicKey);

    const itemsLoaded = Number((candyMachine as any).itemsLoaded ?? 0);
    const itemsAvailable = Number((candyMachine as any).data?.itemsAvailable ?? (candyMachine as any).itemsAvailable ?? 0);

    console.log(`[CM Insert] Found ${itemsLoaded} items loaded out of ${itemsAvailable}`);

    if (itemsLoaded >= itemsAvailable) {
        console.log("[CM Insert] All items already loaded. Skipping.");
        return;
    }

    const itemsToInsert = items.slice(itemsLoaded);
    console.log(`[CM Insert] Inserting ${itemsToInsert.length} items starting at index ${itemsLoaded}`);

    // Insert in batches
    for (let i = 0; i < itemsToInsert.length; i += batchSize) {
        const batch = itemsToInsert.slice(i, i + batchSize);
        const currentIndex = itemsLoaded + i;

        console.log(`[CM Insert] Batch ${Math.floor(i / batchSize) + 1}: Inserting ${batch.length} items at index ${currentIndex}`);

        const builder = addConfigLines(umi, {
            candyMachine: cmPublicKey,
            index: currentIndex,
            configLines: batch.map(item => ({
                name: item.name,
                uri: item.uri,
            })),
        });

        // Use slightly higher priority for batch insertions to ensure they land during congestion
        await builder
            .add(setComputeUnitPrice(umi, { microLamports: 100_000 }))
            .add(setComputeUnitLimit(umi, { units: 800_000 }))
            .sendAndConfirm(umi, {
                send: { skipPreflight: false },
                confirm: { commitment: 'confirmed' }
            });

        console.log(`[CM Insert] Batch ${Math.floor(i / batchSize) + 1} inserted successfully`);
    }

    console.log("[CM Insert] All items inserted successfully!");
}

/**
 * Bubblegum: Create a Merkle Tree for compressed NFTs
 */
export async function createBubblegumTree(
    umi: Umi,
    maxDepth: number = 14,
    maxBufferSize: number = 64,
    canopyDepth: number = 8
): Promise<string> {
    const merkleTree = generateSigner(umi);

    console.log("=== CREATING BUBBLEGUM MERKLE TREE ===");
    console.log("🌳 Tree:", merkleTree.publicKey.toString());

    // NOTE: must use createTreeV2 so the tree's schema matches mintV2.
    // The V1 createTree produces a tree that mintV2 rejects with error 6003 UnsupportedSchemaVersion.
    // ComputeBudget instructions must come BEFORE the instructions they apply to,
    // so prepend the priority-fee ix via a fresh builder.
    const treeBuilder = await createTreeV2(umi, {
        merkleTree,
        maxDepth,
        maxBufferSize,
        canopyDepth,
    });
    const builder = setComputeUnitPrice(umi, { microLamports: 100_000 }).add(treeBuilder);

    // Use `confirmed` commitment for speed (~2-3s vs ~30s for finalized).
    // The subsequent mintV2 call reuses the same Umi/RPC instance, so the
    // tree-config PDA will be visible immediately. The poll below acts as
    // a safety net for edge cases.
    await builder.sendAndConfirm(umi, {
        send: { skipPreflight: false },
        confirm: { commitment: 'confirmed' },
    });

    // Defence in depth: poll the tree-config PDA until the current RPC sees it.
    // With `confirmed` + same RPC this should resolve in <1s typically.
    const treeConfig = findTreeConfigPda(umi, { merkleTree: merkleTree.publicKey });
    const MAX_POLL_MS = 8_000;
    const POLL_INTERVAL_MS = 300;
    const start = Date.now();
    while (Date.now() - start < MAX_POLL_MS) {
        const maybe = await umi.rpc.getAccount(treeConfig[0]);
        if (maybe.exists) {
            console.log(`Tree config visible after ${Date.now() - start}ms`);
            return merkleTree.publicKey.toString();
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Last-resort fallback so the caller still gets a usable address; the mint
    // will either succeed (eventual consistency) or throw a clear error.
    console.warn(
        `[Bubblegum] Tree config PDA not yet visible after ${MAX_POLL_MS}ms — ` +
            `subsequent mint may need to retry.`,
    );
    return merkleTree.publicKey.toString();
}

/**
 * Bubblegum: Mint a compressed NFT (cNFT) into a Core Collection
 */
export async function mintCompressedCoreNft(
    umi: Umi,
    params: {
        treeAddress: string;
        collectionAddress: string;
        name: string;
        uri: string;
        sellerFeeBasisPoints: number;
        owner?: string;
    }
): Promise<{ signature: Uint8Array; assetId: string }> {
    console.log("=== MINTING BUBBLEGUM CORE cNFT ===");
    const leafOwner = params.owner ? publicKey(params.owner) : umi.identity.publicKey;
    const tree = publicKey(params.treeAddress);
    const treeConfig = findTreeConfigPda(umi, { merkleTree: tree });

    console.log("Resolving tree config:", treeConfig[0].toString());

    // Guard against RPC propagation lag. Since the tree is typically created
    // moments before in the same session/RPC, this resolves in <1s.
    {
        const MAX_WAIT_MS = 5_000;
        const INTERVAL_MS = 300;
        const start = Date.now();
        const firstCheck = await umi.rpc.getAccount(treeConfig[0]);
        if (!firstCheck.exists) {
            while (Date.now() - start < MAX_WAIT_MS) {
                await new Promise(r => setTimeout(r, INTERVAL_MS));
                const acct = await umi.rpc.getAccount(treeConfig[0]);
                if (acct.exists) break;
            }
            const finalCheck = await umi.rpc.getAccount(treeConfig[0]);
            if (!finalCheck.exists) {
                throw new Error(
                    `Bubblegum tree config ${treeConfig[0].toString()} is not visible on the current RPC ` +
                    `after ${MAX_WAIT_MS}ms. Wait a few seconds and retry.`,
                );
            }
        }
    }

    let builder = mintV2(umi, {
        // CRITICAL for Bubblegum V2 + Core: the collection's update authority
        // (or a delegate) MUST sign the mint, otherwise the cNFT is not
        // linked/verified into the Core Collection.
        collectionAuthority: umi.identity,
        leafOwner,
        merkleTree: tree,
        treeConfig,
        coreCollection: publicKey(params.collectionAddress),
        metadata: {
            name: params.name,
            uri: params.uri,
            sellerFeeBasisPoints: params.sellerFeeBasisPoints,
            collection: some(publicKey(params.collectionAddress)),
            creators: [], // creators typically defined on the collection level plugin
        },
    }).add(setComputeUnitPrice(umi, { microLamports: 50_000 }));

    const response = await builder.sendAndConfirm(umi, {
        send: { skipPreflight: false },
        confirm: { commitment: 'confirmed' }
    });

    console.log("Extracting asset ID...");

    // `parseLeafFromMintV2Transaction` internally calls `rpc.getTransaction`,
    // which often returns null for a few seconds after confirmation because
    // the RPC hasn't indexed the tx yet. With Helius RPC this is typically <3s.
    const PARSE_TIMEOUT_MS = 15_000;
    const PARSE_INTERVAL_MS = 500;
    const parseStart = Date.now();
    let leaf: Awaited<ReturnType<typeof parseLeafFromMintV2Transaction>> | null = null;
    let lastErr: unknown = null;
    while (Date.now() - parseStart < PARSE_TIMEOUT_MS) {
        try {
            // Wait until the RPC actually has the transaction indexed.
            const tx = await umi.rpc.getTransaction(response.signature);
            if (!tx) {
                await new Promise(r => setTimeout(r, PARSE_INTERVAL_MS));
                continue;
            }
            leaf = await parseLeafFromMintV2Transaction(umi, response.signature);
            break;
        } catch (e) {
            lastErr = e;
            await new Promise(r => setTimeout(r, PARSE_INTERVAL_MS));
        }
    }
    if (!leaf) {
        const sig = response.signature;
        const sigStr = typeof sig === 'string' ? sig : Buffer.from(sig).toString('hex');
        throw new Error(
            `Mint transaction confirmed (${sigStr}) but the RPC did not index it ` +
            `within ${PARSE_TIMEOUT_MS}ms so the asset ID could not be extracted. ` +
            `The NFT was minted successfully; wait a moment and refresh. ` +
            `(${lastErr instanceof Error ? lastErr.message : String(lastErr ?? 'unknown')})`,
        );
    }

    console.log(`Minted cNFT! Asset ID: ${leaf.id}`);

    return { signature: response.signature, assetId: leaf.id.toString() };
}

// ============================================================================
// BATCH MINTING FUNCTIONS
// ============================================================================

export interface BatchNftItem {
    name: string;
    uri: string;
    sellerFeeBasisPoints?: number;
    owner?: string;
}

export interface BatchMintResult {
    signature: Uint8Array;
    assetIds: string[];
    failedIndices: number[];
}

export interface BulkMintResult {
    transactions: {
        signature: Uint8Array;
        assetIds: string[];
        startIndex: number;
        endIndex: number;
    }[];
    totalMinted: number;
    totalFailed: number;
    allAssetIds: string[];
}

// Chunk sizes for different NFT types
const CHUNK_SIZE_COMPRESSED = 10;  // cNFTs per transaction
const CHUNK_SIZE_STANDARD = 4;     // Standard Core NFTs per transaction

/**
 * Estimate fees for batch minting compressed NFTs.
 * Returns the estimated cost in lamports.
 */
export function estimateBatchMintFees(itemCount: number, isCompressed: boolean = true): number {
    // Base transaction fee: ~5000 lamports per transaction
    // Compute unit cost: ~1 lamport per CU at 50k microLamports/CU
    // Each mintV2 is roughly ~50k CU, create is ~100k CU
    const BASE_TX_FEE = 5000;
    const COMPUTE_UNITS_PER_MINT = isCompressed ? 50_000 : 100_000;
    const MICRO_LAMPORTS_PER_CU = 50_000;
    
    // Calculate number of transactions needed
    const chunkSize = isCompressed ? CHUNK_SIZE_COMPRESSED : CHUNK_SIZE_STANDARD;
    const numTransactions = Math.ceil(itemCount / chunkSize);
    
    // Convert microLamports to lamports per item
    const computeCostPerMint = (COMPUTE_UNITS_PER_MINT * MICRO_LAMPORTS_PER_CU) / 1_000_000;
    
    // Total = base fees for all transactions + compute for all items
    return Math.ceil((BASE_TX_FEE * numTransactions) + (computeCostPerMint * itemCount));
}

/**
 * Batch mint multiple compressed NFTs (cNFTs) into a single transaction.
 * This allows minting many NFTs with just one network fee and one signature.
 */
export async function batchMintCompressedCoreNft(
    umi: Umi,
    params: {
        treeAddress: string;
        collectionAddress: string;
        items: BatchNftItem[];
        onProgress?: (completed: number, total: number) => void;
    }
): Promise<BatchMintResult> {
    const { treeAddress, collectionAddress, items, onProgress } = params;
    
    if (items.length === 0) {
        throw new Error("No items to mint");
    }
    
    if (items.length > 10) {
        throw new Error("Maximum 10 NFTs per batch transaction (transaction size limit)");
    }

    console.log(`Batch minting ${items.length} cNFTs...`);
    
    const tree = publicKey(treeAddress);
    const treeConfig = findTreeConfigPda(umi, { merkleTree: tree }) as any;
    
    // Wait for tree config PDA to be visible (tree was just created in same session)
    const POLL_TIMEOUT_MS = 8_000;
    const POLL_INTERVAL_MS = 300;
    const pollStart = Date.now();
    let treeConfigAccount: any = await umi.rpc.getAccount(treeConfig);
    if (!treeConfigAccount?.exists) {
        while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            try {
                treeConfigAccount = await umi.rpc.getAccount(treeConfig);
                if (treeConfigAccount.exists) break;
            } catch {
                // continue polling
            }
        }
        if (!treeConfigAccount?.exists) {
            throw new Error(
                `Tree config PDA not found after ${POLL_TIMEOUT_MS}ms. Please retry.`
            );
        }
    }
    
    // Build a single transaction with all mintV2 instructions
    let builder = new TransactionBuilder();
    
    // Add compute unit price instruction once for the whole batch
    builder = builder.add(setComputeUnitPrice(umi, { microLamports: 50_000 }));
    
    const assetSigners: ReturnType<typeof generateSigner>[] = [];
    
    for (const item of items) {
        const leafOwner = item.owner ? publicKey(item.owner) : umi.identity.publicKey;
        
        const mintIx = mintV2(umi, {
            // CRITICAL for Bubblegum V2 + Core: collection's update authority
            // must sign so the cNFT is verified into the Core Collection.
            collectionAuthority: umi.identity,
            leafOwner,
            merkleTree: tree,
            treeConfig: treeConfig as any,
            coreCollection: publicKey(collectionAddress),
            metadata: {
                name: item.name,
                uri: item.uri,
                sellerFeeBasisPoints: item.sellerFeeBasisPoints ?? 0,
                collection: some(publicKey(collectionAddress)),
                creators: [],
            },
        });
        
        builder = builder.add(mintIx);
    }
    
    // Send the batched transaction
    const response = await builder.sendAndConfirm(umi, {
        send: { commitment: "confirmed", maxRetries: 3 },
        confirm: { commitment: "confirmed" },
    });
    
    console.log(`Batch mint transaction confirmed: ${response.signature}`);
    
    // Extract asset IDs for all minted NFTs
    const assetIds: string[] = [];
    const failedIndices: number[] = [];
    
    // Parse leaf data for each mint - with retry logic
    const PARSE_TIMEOUT_MS = 10_000;
    const PARSE_INTERVAL_MS = 500;
    const parseStart = Date.now();
    
    while (Date.now() - parseStart < PARSE_TIMEOUT_MS && assetIds.length < items.length) {
        try {
            const tx = await umi.rpc.getTransaction(response.signature);
            if (!tx) {
                await new Promise((r) => setTimeout(r, PARSE_INTERVAL_MS));
                continue;
            }
            
            // For batch mints, we need to parse each leaf individually
            // The asset ID extraction for batch is more complex - we'll return signatures
            // and the UI can look up asset IDs after RPC indexing
            for (let i = 0; i < items.length; i++) {
                try {
                    // In a batch, each mint produces a leaf with a unique nonce
                    // For now, we'll note the index and look up later
                    assetIds.push(`pending_${i}`);
                } catch (e) {
                    failedIndices.push(i);
                }
            }
            break;
        } catch (e) {
            await new Promise((r) => setTimeout(r, PARSE_INTERVAL_MS));
        }
    }
    
    onProgress?.(assetIds.length, items.length);
    
    return { 
        signature: response.signature, 
        assetIds,
        failedIndices 
    };
}

/**
 * Batch mint multiple standard Core NFTs into a single transaction.
 * Each NFT gets its own asset signer but they're all minted in one tx.
 */
export async function batchMintCoreNft(
    umi: Umi,
    params: {
        collectionAddress?: string;
        items: BatchNftItem[];
        onProgress?: (completed: number, total: number) => void;
    }
): Promise<BatchMintResult> {
    const { collectionAddress, items, onProgress } = params;
    
    if (items.length === 0) {
        throw new Error("No items to mint");
    }
    
    if (items.length > 5) {
        // Standard NFTs use more CU than cNFTs, so smaller batches
        throw new Error("Maximum 5 Core NFTs per batch transaction");
    }

    console.log(`Batch minting ${items.length} Core NFTs...`);
    
    let collection: Awaited<ReturnType<typeof fetchCollection>> | undefined;
    if (collectionAddress) {
        collection = await fetchCollection(umi, publicKey(collectionAddress));
    }
    
    // Build a single transaction with all create instructions
    let builder = new TransactionBuilder();
    
    // Add compute unit price instruction once for the whole batch
    builder = builder.add(setComputeUnitPrice(umi, { microLamports: 50_000 }));
    
    const assetSigners: ReturnType<typeof generateSigner>[] = [];
    
    for (const item of items) {
        const asset = generateSigner(umi);
        assetSigners.push(asset);
        
        const createIx = create(umi, {
            asset,
            collection,
            owner: item.owner ? publicKey(item.owner) : umi.identity.publicKey,
            name: item.name,
            uri: item.uri,
        });
        
        builder = builder.add(createIx);
    }
    
    // Send the batched transaction
    const response = await builder.sendAndConfirm(umi, {
        send: { commitment: "confirmed", maxRetries: 3 },
        confirm: { commitment: "confirmed" },
    });
    
    console.log(`Batch mint transaction confirmed: ${response.signature}`);
    
    // Extract asset addresses from the signers
    const assetIds = assetSigners.map((signer) => signer.publicKey.toString());
    
    onProgress?.(assetIds.length, items.length);
    
    return { 
        signature: response.signature, 
        assetIds,
        failedIndices: [] 
    };
}

/**
 * Estimate total cost for a batch mint including platform fees.
 * Returns a breakdown for UI display.
 */
export function calculateBatchMintCost(
    itemCount: number,
    platformFeePerItem: number = 0, // in SOL
    isCompressed: boolean = true
): {
    networkFees: number;
    platformFees: number;
    total: number;
    transactionCount: number;
} {
    const networkFeeLamports = estimateBatchMintFees(itemCount, isCompressed);
    const networkFees = networkFeeLamports / 1_000_000_000; // Convert to SOL
    const platformFees = itemCount * platformFeePerItem;
    const chunkSize = isCompressed ? CHUNK_SIZE_COMPRESSED : CHUNK_SIZE_STANDARD;
    const transactionCount = Math.ceil(itemCount / chunkSize);
    
    return {
        networkFees,
        platformFees,
        total: networkFees + platformFees,
        transactionCount,
    };
}

// ============================================================================
// BULK MINTING FUNCTIONS - For Large Collections
// ============================================================================

/**
 * Bulk mint a large collection of compressed NFTs across multiple transactions.
 * Automatically chunks the collection into optimal batch sizes.
 * 
 * @param umi - Umi instance
 * @param params - Mint parameters including tree, collection, and items
 * @returns BulkMintResult with all transaction signatures and asset IDs
 */
export async function bulkMintCompressedCollection(
    umi: Umi,
    params: {
        treeAddress: string;
        collectionAddress: string;
        items: BatchNftItem[];
        onProgress?: (options: {
            currentTransaction: number;
            totalTransactions: number;
            currentBatchSize: number;
            totalMinted: number;
            totalItems: number;
        }) => void;
    }
): Promise<BulkMintResult> {
    const { treeAddress, collectionAddress, items, onProgress } = params;
    
    if (items.length === 0) {
        throw new Error("No items to mint");
    }
    
    // Warn for extremely large collections
    if (items.length > 1000) {
        console.warn(`Large collection detected (${items.length} items). This will require ${Math.ceil(items.length / CHUNK_SIZE_COMPRESSED)} transactions.`);
    }

    console.log(`Starting bulk mint of ${items.length} cNFTs in chunks of ${CHUNK_SIZE_COMPRESSED}...`);
    
    const results: BulkMintResult['transactions'] = [];
    const allAssetIds: string[] = [];
    let totalMinted = 0;
    let totalFailed = 0;
    
    // Calculate number of transactions
    const totalTransactions = Math.ceil(items.length / CHUNK_SIZE_COMPRESSED);
    
    // Process in chunks
    for (let txIndex = 0; txIndex < totalTransactions; txIndex++) {
        const startIndex = txIndex * CHUNK_SIZE_COMPRESSED;
        const endIndex = Math.min(startIndex + CHUNK_SIZE_COMPRESSED, items.length);
        const chunk = items.slice(startIndex, endIndex);
        
        console.log(`Processing transaction ${txIndex + 1}/${totalTransactions} (${chunk.length} NFTs)...`);
        
        try {
            // Call the single-batch function for this chunk
            const result = await batchMintCompressedCoreNft(umi, {
                treeAddress,
                collectionAddress,
                items: chunk,
                onProgress: (completed) => {
                    onProgress?.({
                        currentTransaction: txIndex + 1,
                        totalTransactions,
                        currentBatchSize: chunk.length,
                        totalMinted: totalMinted + completed,
                        totalItems: items.length,
                    });
                },
            });
            
            results.push({
                signature: result.signature,
                assetIds: result.assetIds,
                startIndex,
                endIndex: endIndex - 1,
            });
            
            allAssetIds.push(...result.assetIds);
            totalMinted += result.assetIds.length - result.failedIndices.length;
            totalFailed += result.failedIndices.length;
            
            console.log(`Transaction ${txIndex + 1} complete: ${result.assetIds.length - result.failedIndices.length} minted, ${result.failedIndices.length} failed`);
            
        } catch (error) {
            console.error(`Transaction ${txIndex + 1} failed:`, error);
            totalFailed += chunk.length;
            
            // Continue with next chunk rather than failing entirely
            // This allows partial success for large collections
            toast.error(`Batch ${txIndex + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Small delay between transactions to avoid rate limiting
        if (txIndex < totalTransactions - 1) {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    
    console.log(`Bulk mint complete: ${totalMinted} total minted, ${totalFailed} total failed across ${results.length} transactions`);
    
    return {
        transactions: results,
        totalMinted,
        totalFailed,
        allAssetIds,
    };
}

/**
 * Bulk mint a large collection of standard Core NFTs across multiple transactions.
 * Automatically chunks the collection into optimal batch sizes.
 * 
 * @param umi - Umi instance
 * @param params - Mint parameters including optional collection and items
 * @returns BulkMintResult with all transaction signatures and asset IDs
 */
export async function bulkMintCoreCollection(
    umi: Umi,
    params: {
        collectionAddress?: string;
        items: BatchNftItem[];
        onProgress?: (options: {
            currentTransaction: number;
            totalTransactions: number;
            currentBatchSize: number;
            totalMinted: number;
            totalItems: number;
        }) => void;
    }
): Promise<BulkMintResult> {
    const { collectionAddress, items, onProgress } = params;
    
    if (items.length === 0) {
        throw new Error("No items to mint");
    }
    
    // Warn for large collections (standard NFTs are more expensive)
    if (items.length > 500) {
        console.warn(`Large standard collection detected (${items.length} items). This will require ${Math.ceil(items.length / CHUNK_SIZE_STANDARD)} transactions and significant SOL.`);
    }

    console.log(`Starting bulk mint of ${items.length} Core NFTs in chunks of ${CHUNK_SIZE_STANDARD}...`);
    
    const results: BulkMintResult['transactions'] = [];
    const allAssetIds: string[] = [];
    let totalMinted = 0;
    let totalFailed = 0;
    
    // Calculate number of transactions
    const totalTransactions = Math.ceil(items.length / CHUNK_SIZE_STANDARD);
    
    // Process in chunks
    for (let txIndex = 0; txIndex < totalTransactions; txIndex++) {
        const startIndex = txIndex * CHUNK_SIZE_STANDARD;
        const endIndex = Math.min(startIndex + CHUNK_SIZE_STANDARD, items.length);
        const chunk = items.slice(startIndex, endIndex);
        
        console.log(`Processing transaction ${txIndex + 1}/${totalTransactions} (${chunk.length} NFTs)...`);
        
        try {
            // Call the single-batch function for this chunk
            const result = await batchMintCoreNft(umi, {
                collectionAddress,
                items: chunk,
                onProgress: (completed) => {
                    onProgress?.({
                        currentTransaction: txIndex + 1,
                        totalTransactions,
                        currentBatchSize: chunk.length,
                        totalMinted: totalMinted + completed,
                        totalItems: items.length,
                    });
                },
            });
            
            results.push({
                signature: result.signature,
                assetIds: result.assetIds,
                startIndex,
                endIndex: endIndex - 1,
            });
            
            allAssetIds.push(...result.assetIds);
            totalMinted += result.assetIds.length - result.failedIndices.length;
            totalFailed += result.failedIndices.length;
            
            console.log(`Transaction ${txIndex + 1} complete: ${result.assetIds.length - result.failedIndices.length} minted, ${result.failedIndices.length} failed`);
            
        } catch (error) {
            console.error(`Transaction ${txIndex + 1} failed:`, error);
            totalFailed += chunk.length;
            
            // Continue with next chunk rather than failing entirely
            // This allows partial success for large collections
            toast.error(`Batch ${txIndex + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Small delay between transactions to avoid rate limiting
        if (txIndex < totalTransactions - 1) {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    
    console.log(`Bulk mint complete: ${totalMinted} total minted, ${totalFailed} total failed across ${results.length} transactions`);
    
    return {
        transactions: results,
        totalMinted,
        totalFailed,
        allAssetIds,
    };
}
