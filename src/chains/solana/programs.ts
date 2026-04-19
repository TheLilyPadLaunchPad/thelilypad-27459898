import {
    publicKey,
    generateSigner,
    some,
    sol,
    Signer,
    none,
    dateTime,
    Umi,
} from '@metaplex-foundation/umi';
import {
    createCollection as createCoreCollectionIx,
    updateV1 as updateCoreAsset,
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

            let builder = createCoreCollectionIx(umi, {
                collection: collectionSigner,
                name: params.name,
                uri: params.uri,
                // BubblegumV2 plugin is required for any collection that will
                // receive compressed NFTs via Bubblegum's `mintV2`. Without it,
                // the mint fails with `CollectionMustHaveBubblegumPlugin`.
                plugins: params.withBubblegumV2
                    ? [{ type: 'BubblegumV2' }]
                    : undefined,
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
    batchSize = 15
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

    // Use `finalized` commitment so the tree-config PDA is guaranteed to be
    // visible to other RPCs (subsequent mintV2 calls may hit a different node
    // if the upstream getBestRpc() picked differently). Without this, mintV2
    // simulates against stale state and throws `tree_authority: AccountNotInitialized`.
    await builder.sendAndConfirm(umi, {
        send: { skipPreflight: false },
        confirm: { commitment: 'finalized' },
    });

    // Defence in depth: explicitly poll the tree-config PDA until the current
    // RPC sees it. `finalized` commitment alone is strong enough for the
    // sending RPC, but a *different* RPC may still be catching up in its
    // read-state cache. Wait up to ~15s for visibility.
    const treeConfig = findTreeConfigPda(umi, { merkleTree: merkleTree.publicKey });
    const MAX_POLL_MS = 15_000;
    const POLL_INTERVAL_MS = 500;
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

    // Guard against RPC propagation lag. If the umi instance for this mint
    // was created on a different RPC than the one that deployed the tree, the
    // config PDA may not be visible yet. Poll briefly before attempting the mint.
    {
        const MAX_WAIT_MS = 20_000;
        const INTERVAL_MS = 750;
        const start = Date.now();
        while (Date.now() - start < MAX_WAIT_MS) {
            const acct = await umi.rpc.getAccount(treeConfig[0]);
            if (acct.exists) break;
            await new Promise(r => setTimeout(r, INTERVAL_MS));
        }
        const finalCheck = await umi.rpc.getAccount(treeConfig[0]);
        if (!finalCheck.exists) {
            throw new Error(
                `Bubblegum tree config ${treeConfig[0].toString()} is not visible on the current RPC ` +
                `after ${MAX_WAIT_MS}ms. The tree was likely created on a different RPC node; ` +
                `wait a few seconds and retry.`,
            );
        }
    }

    let builder = mintV2(umi, {
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
    const leaf = await parseLeafFromMintV2Transaction(umi, response.signature);

    console.log(`Minted cNFT! Asset ID: ${leaf.id}`);

    return { signature: response.signature, assetId: leaf.id.toString() };
}
