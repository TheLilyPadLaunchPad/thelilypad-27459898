/**
 * Candy Machine Hidden-Settings Reveal Script
 *
 * Performs the two-step reveal flow for a collection deployed with deploy-cm.ts:
 *
 *   Step 1 — updateCandyMachine:
 *     Clears hiddenSettings and installs real configLineSettings whose prefixUri
 *     points at the Arweave manifest root. Future mints get real metadata.
 *
 *   Step 2 — per-asset updateV1 (optional, --step 2 or --step all):
 *     Updates the URI stored on every already-minted Core asset account.
 *     Requires a Helius API key so we can fetch minted asset addresses via DAS.
 *
 * Usage:
 *   KEYPAIR_PATH=./wallet.json \
 *   DEPLOYMENT_OUTPUT=./deployment-output.json \
 *   HELIUS_API_KEY=your_key \           # needed only for step 2
 *   npx ts-node scripts/reveal-cm.ts   # defaults to --step all
 *
 * Environment variables:
 *   RPC_URL            Solana RPC endpoint (default: devnet)
 *   KEYPAIR_PATH       Path to wallet keypair JSON (default: ./wallet.json)
 *   DEPLOYMENT_OUTPUT  Path to deployment-output.json (default: ./deployment-output.json)
 *   HELIUS_API_KEY     Helius API key for DAS getAssetsByGroup (step 2 only)
 *   STEP               "1", "2", or "all" (default: "all")
 *   ASSET_LIST         Path to a JSON file: [{address, tokenId}] (skips DAS fetch)
 *   BATCH_SIZE         Assets per update transaction (default: 5)
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
    createSignerFromKeypair,
    signerIdentity,
    generateSigner,
    publicKey,
    some,
    none,
} from "@metaplex-foundation/umi";
import {
    fetchCandyMachine,
    updateCandyMachine as updateCandyMachineIx,
} from "@metaplex-foundation/mpl-core-candy-machine";
import { updateV1 as updateCoreAsset } from "@metaplex-foundation/mpl-core";
import {
    setComputeUnitPrice,
    setComputeUnitLimit,
} from "@metaplex-foundation/mpl-toolbox";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const RPC_URL          = process.env.RPC_URL          || "https://api.devnet.solana.com";
const KEYPAIR_PATH     = process.env.KEYPAIR_PATH     || "./wallet.json";
const DEPLOY_OUTPUT    = process.env.DEPLOYMENT_OUTPUT || "./deployment-output.json";
const HELIUS_API_KEY   = process.env.HELIUS_API_KEY   || "";
const STEP             = (process.env.STEP            || "all").toLowerCase();   // "1" | "2" | "all"
const ASSET_LIST_PATH  = process.env.ASSET_LIST       || "";
const BATCH_SIZE       = parseInt(process.env.BATCH_SIZE || "5");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface DeployOutput {
    candyMachine:  string;
    collection:    string;
    manifestRoot:  string;
    items:         number;
    placeholderUri?: string;
}

interface AssetEntry {
    address:  string;
    tokenId:  number;
}

async function fetchAssetsByCollection(
    collectionAddress: string,
    heliusKey: string,
    network: "devnet" | "mainnet-beta"
): Promise<AssetEntry[]> {
    const baseUrl = network === "devnet"
        ? `https://devnet.helius-rpc.com/?api-key=${heliusKey}`
        : `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;

    const assets: AssetEntry[] = [];
    let page = 1;

    while (true) {
        const resp = await fetch(baseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "reveal",
                method: "getAssetsByGroup",
                params: {
                    groupKey: "collection",
                    groupValue: collectionAddress,
                    page,
                    limit: 1000,
                },
            }),
        });
        const json: any = await resp.json();
        const items: any[] = json?.result?.items ?? [];
        if (items.length === 0) break;

        for (const item of items) {
            // Extract token index from the name (e.g. "MyCollection #3" → tokenId = 3)
            const nameMatch = (item.content?.metadata?.name as string || "").match(/#(\d+)/);
            const tokenId = nameMatch ? parseInt(nameMatch[1]) : assets.length;
            assets.push({ address: item.id, tokenId });
        }

        if (items.length < 1000) break;
        page++;
    }

    return assets;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: updateCandyMachine
// ─────────────────────────────────────────────────────────────────────────────

async function step1(deploy: DeployOutput, umi: ReturnType<typeof createUmi>) {
    console.log("\n=== Step 1: updateCandyMachine ===");
    const cmKey = publicKey(deploy.candyMachine);
    const cm = await fetchCandyMachine(umi, cmKey);

    const prefixUri = `https://arweave.net/${deploy.manifestRoot}/`;
    console.log("prefixUri:", prefixUri);

    const { signature } = await updateCandyMachineIx(umi, {
        candyMachine: cmKey,
        data: {
            itemsAvailable:   BigInt(deploy.items),
            maxEditionSupply: (cm as any).maxEditionSupply ?? BigInt(0),
            isMutable:        (cm as any).isMutable ?? true,
            hiddenSettings:   none(),
            configLineSettings: some({
                prefixName:   "",
                nameLength:   32,
                prefixUri,
                uriLength:    10,   // "N.json" up to 10k items
                isSequential: false,
            }),
        },
    })
        .add(setComputeUnitPrice(umi, { microLamports: 100_000 }))
        .add(setComputeUnitLimit(umi, { units: 400_000 }))
        .sendAndConfirm(umi, {
            send:    { skipPreflight: false },
            confirm: { commitment: "confirmed" },
        });

    const sigB64 = Buffer.from(signature).toString("base64");
    console.log("✅ updateCandyMachine confirmed:", sigB64);
    return sigB64;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: per-asset updateV1
// ─────────────────────────────────────────────────────────────────────────────

async function step2(
    deploy:  DeployOutput,
    umi:     ReturnType<typeof createUmi>,
    assets:  AssetEntry[]
) {
    console.log(`\n=== Step 2: reveal ${assets.length} assets ===`);
    const total     = assets.length;
    const txCount   = Math.ceil(total / BATCH_SIZE);
    console.log(`~${txCount} transactions (${BATCH_SIZE} assets/tx)\n`);

    let done = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
        const chunk = assets.slice(i, i + BATCH_SIZE);
        const txIndex = Math.floor(i / BATCH_SIZE) + 1;

        const { transactionBuilder } = await import("@metaplex-foundation/umi");
        let txBuilder = transactionBuilder();
        for (const asset of chunk) {
            const newUri = `https://arweave.net/${deploy.manifestRoot}/${asset.tokenId}.json`;
            txBuilder = txBuilder.add(updateCoreAsset(umi, {
                asset:   publicKey(asset.address),
                newUri:  some(newUri),
                newName: none(),
            }));
        }
        txBuilder = txBuilder.add(setComputeUnitPrice(umi, { microLamports: 10_000 }));

        try {
            await txBuilder.sendAndConfirm(umi, {
                send:    { skipPreflight: false },
                confirm: { commitment: "confirmed" },
            });
            done += chunk.length;
            process.stdout.write(`  [${txIndex}/${txCount}] ${done}/${total} done\r`);
        } catch (err: any) {
            console.error(`\n  ⚠ Batch ${txIndex} failed:`, err.message);
        }

        // Throttle: avoid rate-limiting on devnet
        if (i + BATCH_SIZE < total) {
            await new Promise(r => setTimeout(r, 400));
        }
    }

    console.log(`\n✅ Asset reveal complete: ${done}/${total} updated`);
    return done;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log("=== CM Hidden-Settings Reveal ===\n");

    // Load deployment output
    if (!fs.existsSync(DEPLOY_OUTPUT)) {
        throw new Error(`Deployment output not found: ${DEPLOY_OUTPUT}`);
    }
    const deploy: DeployOutput = JSON.parse(fs.readFileSync(DEPLOY_OUTPUT, "utf8"));
    console.log("Candy Machine :", deploy.candyMachine);
    console.log("Collection    :", deploy.collection);
    console.log("Manifest root :", deploy.manifestRoot);
    console.log("Total items   :", deploy.items);
    console.log("Step          :", STEP, "\n");

    // Load wallet
    if (!fs.existsSync(KEYPAIR_PATH)) throw new Error(`Wallet not found: ${KEYPAIR_PATH}`);
    const secret = new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8")));

    // Build umi
    const umi = createUmi(RPC_URL);
    const kp  = umi.eddsa.createKeypairFromSecretKey(secret);
    umi.use(signerIdentity(createSignerFromKeypair(umi, kp)));
    umi.use(irysUploader({
        address: RPC_URL.includes("devnet") ? "https://devnet.irys.xyz" : "https://node1.irys.xyz",
    }));
    console.log("Wallet:", umi.identity.publicKey.toString());

    const doStep1 = STEP === "1"   || STEP === "all";
    const doStep2 = STEP === "2"   || STEP === "all";

    // ── Step 1 ──────────────────────────────────────────────────────────────
    if (doStep1) {
        const sig1 = await step1(deploy, umi);
        // Append to deployment output
        const updated = { ...deploy, revealStep1Sig: sig1, revealStep1At: new Date().toISOString() };
        fs.writeFileSync(DEPLOY_OUTPUT, JSON.stringify(updated, null, 2));
        console.log(`\nDeployment output updated: ${DEPLOY_OUTPUT}`);
    }

    // ── Step 2 ──────────────────────────────────────────────────────────────
    if (doStep2) {
        let assets: AssetEntry[] = [];

        if (ASSET_LIST_PATH && fs.existsSync(ASSET_LIST_PATH)) {
            assets = JSON.parse(fs.readFileSync(ASSET_LIST_PATH, "utf8"));
            console.log(`Loaded ${assets.length} asset addresses from ${ASSET_LIST_PATH}`);
        } else if (HELIUS_API_KEY) {
            console.log("Fetching minted assets from Helius DAS…");
            const network = RPC_URL.includes("devnet") ? "devnet" : "mainnet-beta";
            assets = await fetchAssetsByCollection(deploy.collection, HELIUS_API_KEY, network);
            console.log(`Fetched ${assets.length} assets`);

            // Cache locally for re-runs
            const listPath = path.join(path.dirname(DEPLOY_OUTPUT), "asset-list.json");
            fs.writeFileSync(listPath, JSON.stringify(assets, null, 2));
            console.log(`Asset list cached: ${listPath}`);
        } else {
            console.warn("⚠ Step 2 skipped: no ASSET_LIST path and no HELIUS_API_KEY provided.");
            console.warn("  Set ASSET_LIST=./asset-list.json or HELIUS_API_KEY=xxx and re-run.");
            return;
        }

        if (assets.length === 0) {
            console.warn("No minted assets found — skipping step 2.");
            return;
        }

        const done = await step2(deploy, umi, assets);

        // Append to deployment output
        const current: any = JSON.parse(fs.readFileSync(DEPLOY_OUTPUT, "utf8"));
        fs.writeFileSync(DEPLOY_OUTPUT, JSON.stringify({
            ...current,
            revealStep2AssetsUpdated: done,
            revealStep2At: new Date().toISOString(),
        }, null, 2));
    }

    console.log("\n=== REVEAL COMPLETE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
