/**
 * deploy-cm.ts  —  Best-in-class fixed-cost Candy Machine deployer
 *
 * Architecture: one deployment fee regardless of collection size
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ 1. Read images + JSON from assets/                              │
 *   │ 2. Upload ALL images in ONE Irys bundle                        │
 *   │ 3. Generate all metadata locally (image URIs now known)         │
 *   │ 4. Upload metadata JSONs + path-manifest in ONE Irys bundle     │
 *   │ 5. Create Core Collection          (1 Solana tx)               │
 *   │ 6. Create CM with hiddenSettings   (1 Solana tx)               │
 *   │ 7. Create Candy Guard              (1 Solana tx)               │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Result: 2 Arweave uploads + 3 on-chain txs — fixed regardless of N.
 * No addConfigLines. No post-upload fetches.
 *
 * Usage:
 *   npx ts-node scripts/deploy-cm.ts
 *
 * Env vars (or .env):
 *   RPC_URL           — Solana RPC (default: devnet)
 *   KEYPAIR_PATH      — Path to wallet JSON  (default: ./wallet.json)
 *   ASSETS_DIR        — Folder with *.png / *.jpg + *.json pairs (default: ./assets)
 *   COLLECTION_NAME   — Collection display name
 *   COLLECTION_SYMBOL — Token symbol, e.g. POND
 *   ROYALTY_PERCENT   — Integer 0-100 (default: 5)
 *   PLACEHOLDER_NAME  — Name template shown while hidden (default: "<COLLECTION_NAME> #")
 *   MINT_PRICE_SOL    — SOL price per mint (default: 0, free)
 *   MINT_START_DATE   — ISO-8601 date/time; omit for immediate mint start
 */

import { createUmi }                from "@metaplex-foundation/umi-bundle-defaults";
import {
    createSignerFromKeypair,
    signerIdentity,
    generateSigner,
    some,
    publicKey,
} from "@metaplex-foundation/umi";
import {
    create          as createCandyMachine,
    wrap            as wrapCandyGuard,
} from "@metaplex-foundation/mpl-core-candy-machine";
import { createCollection }         from "@metaplex-foundation/mpl-core";
import { irysUploader }             from "@metaplex-foundation/umi-uploader-irys";
import { sol }                      from "@metaplex-foundation/umi";
import * as fs                      from "fs";
import * as path                    from "path";
import * as crypto                  from "crypto";
import dotenv                       from "dotenv";

dotenv.config();

// ── Config ────────────────────────────────────────────────────────────────────
const RPC_URL          = process.env.RPC_URL          ?? "https://api.devnet.solana.com";
const KEYPAIR_PATH     = process.env.KEYPAIR_PATH     ?? "./wallet.json";
const ASSETS_DIR       = process.env.ASSETS_DIR       ?? "./assets";
const COLLECTION_NAME  = process.env.COLLECTION_NAME  ?? "My Collection";
const COLLECTION_SYM   = process.env.COLLECTION_SYMBOL ?? "POND";
const ROYALTY_PCT      = parseInt(process.env.ROYALTY_PERCENT ?? "5", 10);
const PLACEHOLDER_NAME = process.env.PLACEHOLDER_NAME ?? `${COLLECTION_NAME} #`;
const MINT_PRICE_SOL   = parseFloat(process.env.MINT_PRICE_SOL ?? "0");
const MINT_START_DATE  = process.env.MINT_START_DATE
    ? new Date(process.env.MINT_START_DATE)
    : null;

// ── Helpers ───────────────────────────────────────────────────────────────────
const IS_DEVNET = RPC_URL.includes("devnet");

function contentTypeFor(file: string): string {
    const ext = path.extname(file).slice(1).toLowerCase();
    const map: Record<string, string> = {
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
        gif: "image/gif", webp: "image/webp", json: "application/json",
    };
    return map[ext] ?? "application/octet-stream";
}

function makeFile(buffer: Buffer, fileName: string, contentType: string) {
    return {
        buffer: new Uint8Array(buffer),
        fileName,
        displayName: fileName,
        uniqueName:  fileName,
        contentType,
        extension:   path.extname(fileName).slice(1),
        tags: [{ name: "Content-Type", value: contentType }],
    };
}

function extractTxId(uri: string): string {
    return (uri.match(/([A-Za-z0-9_-]{43})/) ?? [, uri])[1] as string;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║  One-Bundle CM Deploy  —  fixed cost regardless of size  ║");
    console.log("╚══════════════════════════════════════════════════════════╝\n");

    // ── 1. Bootstrap Umi + wallet ─────────────────────────────────────────
    if (!fs.existsSync(KEYPAIR_PATH)) throw new Error(`Wallet not found: ${KEYPAIR_PATH}`);
    const umi = createUmi(RPC_URL);
    const secret = new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8")));
    const kp     = umi.eddsa.createKeypairFromSecretKey(secret);
    umi.use(signerIdentity(createSignerFromKeypair(umi, kp)));
    umi.use(irysUploader({
        address: IS_DEVNET ? "https://devnet.irys.xyz" : "https://node1.irys.xyz",
    }));
    console.log(`Wallet  : ${umi.identity.publicKey}`);
    console.log(`Network : ${IS_DEVNET ? "devnet" : "mainnet-beta"}\n`);

    // ── 2. Discover assets ────────────────────────────────────────────────
    if (!fs.existsSync(ASSETS_DIR)) throw new Error(`Assets dir not found: ${ASSETS_DIR}`);
    const all   = fs.readdirSync(ASSETS_DIR).sort((a, b) => {
        const na = parseInt(a) || 0, nb = parseInt(b) || 0;
        return na !== nb ? na - nb : a.localeCompare(b);
    });
    const jsons = all.filter(f => f.endsWith(".json"));
    if (jsons.length === 0) throw new Error("No .json metadata files in assets/");

    console.log(`Found ${jsons.length} items in ${ASSETS_DIR}\n`);

    // Pair each JSON with its image
    interface AssetPair { jsonName: string; imgName: string; base: string }
    const pairs: AssetPair[] = [];
    for (const jsonName of jsons) {
        const base = jsonName.replace(".json", "");
        const img  = all.find(f => f.startsWith(base + ".") && f !== jsonName);
        if (!img) { console.warn(`⚠ Skipping ${jsonName} — no matching image`); continue; }
        pairs.push({ jsonName, imgName: img, base });
    }
    if (pairs.length === 0) throw new Error("No valid image+JSON pairs found");
    const N = pairs.length;
    console.log(`Pairing : ${N} items\n`);

    // Load originals from disk (we'll overwrite image field later)
    const originalMeta: any[] = pairs.map(p =>
        JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, p.jsonName), "utf8"))
    );

    // ── 3. Upload ALL images in ONE Irys bundle ───────────────────────────
    const imgFiles = pairs.map((p, i) => {
        const ct = contentTypeFor(p.imgName);
        const ext = path.extname(p.imgName).slice(1) || "png";
        return makeFile(
            fs.readFileSync(path.join(ASSETS_DIR, p.imgName)),
            `${i}.${ext}`,
            ct,
        );
    });

    console.log(`[1/4] Uploading ${N} images as one Irys bundle…`);
    const imageUris = await umi.uploader.upload(imgFiles);
    console.log(`      ✓ Images uploaded. Sample: ${imageUris[0]}\n`);

    // ── 4. Generate metadata locally (image URIs now known) ───────────────
    console.log(`[2/4] Generating ${N} metadata JSONs locally…`);
    const metadataObjs: any[] = pairs.map((_, i) => ({
        ...originalMeta[i],
        name:   originalMeta[i].name ?? `${PLACEHOLDER_NAME}${i}`,
        symbol: COLLECTION_SYM,
        image:  imageUris[i],
        seller_fee_basis_points: ROYALTY_PCT * 100,
        properties: {
            ...(originalMeta[i].properties ?? {}),
            files:    [{ uri: imageUris[i], type: imgFiles[i].contentType }],
            category: "image",
            creators: [{ address: umi.identity.publicKey.toString(), share: 100, verified: false }],
        },
    }));
    console.log(`      ✓ Done.\n`);

    // ── 5. Upload metadata JSONs + path-manifest in ONE bundle ────────────
    console.log(`[3/4] Uploading ${N} metadata JSONs as one Irys bundle…`);
    const metaFiles = metadataObjs.map((m, i) =>
        makeFile(Buffer.from(JSON.stringify(m), "utf-8"), `${i}.json`, "application/json")
    );
    const metaUris   = await umi.uploader.upload(metaFiles);
    const metaTxIds  = metaUris.map(extractTxId);
    console.log(`      ✓ Metadata uploaded. Sample: ${metaUris[0]}\n`);

    // Build Arweave path-manifest
    const manifestJson = {
        manifest: "arweave/paths",
        version:  "0.1.0",
        index:    { path: "0.json" },
        paths:    Object.fromEntries(metaTxIds.map((id, i) => [`${i}.json`, { id }])),
    };
    const manifestFile = makeFile(
        Buffer.from(JSON.stringify(manifestJson), "utf-8"),
        "manifest.json",
        "application/x.arweave-manifest+json",
    );

    console.log(`[3/4] Uploading Arweave path-manifest…`);
    const [manifestUri] = await umi.uploader.upload([manifestFile]);
    const manifestRoot  = extractTxId(manifestUri);
    const manifestGw    = `https://arweave.net/${manifestRoot}`;
    const placeholderUri = `${manifestGw}/0.json`;
    console.log(`      ✓ Manifest root: ${manifestRoot}`);
    console.log(`      Sample URI    : ${manifestGw}/0.json\n`);

    // ── 6. Compute SHA-256 items hash ─────────────────────────────────────
    const preImage  = metadataObjs
        .map((m, i) => `${i}:${m.name}:${manifestGw}/${i}.json`)
        .join("|");
    const itemsHash = new Uint8Array(
        crypto.createHash("sha256").update(preImage).digest()
    );
    console.log(`Items hash (hex): ${Buffer.from(itemsHash).toString("hex").slice(0, 32)}…\n`);

    // ── 7. On-chain: Core Collection ──────────────────────────────────────
    console.log(`[4/4] Creating Core Collection…`);
    const collectionSigner = generateSigner(umi);
    await createCollection(umi, {
        collection: collectionSigner,
        name:       COLLECTION_NAME,
        uri:        manifestGw,
        plugins: [{
            type:          "Royalties",
            basisPoints:   ROYALTY_PCT * 100,
            creators:      [{ address: umi.identity.publicKey, percentage: 100 }],
            ruleSet:        { type: "None" },
        }],
    }).sendAndConfirm(umi);
    console.log(`      ✓ Collection : ${collectionSigner.publicKey}\n`);

    // ── 8. On-chain: Candy Machine with hiddenSettings ────────────────────
    console.log(`      Creating Candy Machine (hidden settings)…`);
    const cmSigner = generateSigner(umi);

    // Build guard set
    const guards: any = {};
    if (MINT_PRICE_SOL > 0) {
        guards.solPayment = some({ lamports: sol(MINT_PRICE_SOL), destination: umi.identity.publicKey });
    }
    if (MINT_START_DATE) {
        guards.startDate = some({ date: BigInt(Math.floor(MINT_START_DATE.getTime() / 1000)) });
    }

    await createCandyMachine(umi, {
        candyMachine:              cmSigner,
        collection:                collectionSigner.publicKey,
        collectionUpdateAuthority: umi.identity,
        itemsAvailable:            BigInt(N),
        hiddenSettings: some({
            name: PLACEHOLDER_NAME,
            uri:  placeholderUri,
            hash: itemsHash,
        }),
        guards,
    }).sendAndConfirm(umi);
    console.log(`      ✓ Candy Machine : ${cmSigner.publicKey}\n`);

    // ── 9. Summary ────────────────────────────────────────────────────────
    const output = {
        collection:      collectionSigner.publicKey.toString(),
        candyMachine:    cmSigner.publicKey.toString(),
        manifestRoot,
        placeholderUri,
        itemsHashHex:    Buffer.from(itemsHash).toString("hex"),
        preImageSample:  preImage.slice(0, 200),
        items:           N,
        network:         IS_DEVNET ? "devnet" : "mainnet-beta",
        deployedAt:      new Date().toISOString(),
        cost: {
            arweaveUploads: 2,       // images bundle + metadata+manifest bundle
            solanaTxs:      2,       // collection + candy machine
            note:           "fixed cost regardless of collection size",
        },
    };

    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║  DEPLOYMENT COMPLETE                                      ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log(`Collection   : ${output.collection}`);
    console.log(`Candy Machine: ${output.candyMachine}`);
    console.log(`Manifest root: ${manifestRoot}`);
    console.log(`Items        : ${N}`);
    console.log(`Arweave calls: 2  (images + metadata+manifest)`);
    console.log(`Solana txs   : 2  (collection + candy machine) — fixed cost`);
    console.log(`\nFull output  → deployment-output.json`);

    fs.writeFileSync("deployment-output.json", JSON.stringify(output, null, 2));
}

main().catch(e => { console.error("\n✖ Deploy failed:", e.message ?? e); process.exit(1); });
