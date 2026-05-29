/**
 * Fast bulk Candy Machine deployer.
 *
 * Strategy (Metaplex Core + Core Candy Machine, hidden settings):
 *   1. Bundle every image + every metadata JSON into a SINGLE Irys bundle.
 *   2. Publish ONE Arweave directory manifest pointing at each metadata file.
 *   3. Deploy collection + candy machine + guard = 3 on-chain transactions,
 *      regardless of collection size. No addConfigLines, no per-item txs.
 *
 * Result: fixed deploy cost (~0.005 SOL rent) whether you mint 10 or 10,000.
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
    createSignerFromKeypair,
    signerIdentity,
    generateSigner,
    some,
} from "@metaplex-foundation/umi";
import {
    create as createCandyMachine,
} from "@metaplex-foundation/mpl-core-candy-machine";
import {
    createCollection,
} from "@metaplex-foundation/mpl-core";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || "./wallet.json";
const ASSETS_DIR = process.env.ASSETS_DIR || "./assets";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "My Collection";
const ROYALTY_PCT = parseInt(process.env.ROYALTY_PERCENT || "5");
const PLACEHOLDER_NAME = process.env.PLACEHOLDER_NAME || `${COLLECTION_NAME} #`;

function makeFile(buffer: Buffer, fileName: string, contentType: string) {
    return {
        buffer,
        fileName,
        displayName: fileName,
        uniqueName: fileName,
        contentType,
        extension: fileName.split(".").pop() || "",
        tags: [{ name: "Content-Type", value: contentType }],
    };
}

function contentTypeFor(file: string) {
    const ext = file.split(".").pop()?.toLowerCase();
    if (ext === "png") return "image/png";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "gif") return "image/gif";
    if (ext === "webp") return "image/webp";
    if (ext === "json") return "application/json";
    return "application/octet-stream";
}

async function main() {
    console.log("=== Fast Bulk CM Deploy (hidden settings) ===\n");

    // 1. Umi + wallet + Irys
    const umi = createUmi(RPC_URL);
    if (!fs.existsSync(KEYPAIR_PATH)) throw new Error(`Wallet not found at ${KEYPAIR_PATH}`);
    const secret = new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8")));
    const kp = umi.eddsa.createKeypairFromSecretKey(secret);
    umi.use(signerIdentity(createSignerFromKeypair(umi, kp)));
    umi.use(irysUploader({ address: RPC_URL.includes("devnet") ? "https://devnet.irys.xyz" : "https://node1.irys.xyz" }));
    console.log("Wallet:", umi.identity.publicKey.toString());

    // 2. Pair every .json with its image counterpart
    if (!fs.existsSync(ASSETS_DIR)) throw new Error(`Assets dir not found: ${ASSETS_DIR}`);
    const all = fs.readdirSync(ASSETS_DIR).sort((a, b) => {
        const na = parseInt(a) || 0; const nb = parseInt(b) || 0;
        return na - nb;
    });
    const jsons = all.filter(f => f.endsWith(".json"));
    if (jsons.length === 0) throw new Error("No .json metadata files found");
    console.log(`Found ${jsons.length} items.\n`);

    // 3. Bundle ALL images in one upload, get tx ids, rewrite metadata.image fields.
    const imageFiles: ReturnType<typeof makeFile>[] = [];
    const imageNames: string[] = [];
    const metadataObjs: any[] = [];

    for (const jsonName of jsons) {
        const base = jsonName.replace(".json", "");
        const img = all.find(f => f.startsWith(base + ".") && f !== jsonName);
        if (!img) {
            console.warn(`Skipping ${jsonName} (no matching image)`);
            continue;
        }
        imageNames.push(img);
        imageFiles.push(makeFile(fs.readFileSync(path.join(ASSETS_DIR, img)), img, contentTypeFor(img)));
        metadataObjs.push(JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, jsonName), "utf8")));
    }

    console.log(`Uploading ${imageFiles.length} images in a single bundle...`);
    const imageUris = await umi.uploader.upload(imageFiles);
    metadataObjs.forEach((m, i) => { m.image = imageUris[i]; });

    // 4. Bundle ALL metadata JSONs in one upload.
    const metaFiles = metadataObjs.map((m, i) =>
        makeFile(Buffer.from(JSON.stringify(m), "utf-8"), `${i}.json`, "application/json"),
    );
    console.log(`Uploading ${metaFiles.length} metadata JSONs in a single bundle...`);
    const metaUris = await umi.uploader.upload(metaFiles);
    const metaTxIds = metaUris.map(u => (u.match(/([A-Za-z0-9_-]{43})/) || [, u])[1]);

    // 5. Publish ONE Arweave directory manifest.
    const manifest = {
        manifest: "arweave/paths",
        version: "0.1.0",
        index: { path: "0.json" },
        paths: Object.fromEntries(metaTxIds.map((id, i) => [`${i}.json`, { id }])),
    };
    const manifestFile = makeFile(
        Buffer.from(JSON.stringify(manifest), "utf-8"),
        "manifest.json",
        "application/x.arweave-manifest+json",
    );
    const [manifestUri] = await umi.uploader.upload([manifestFile]);
    const manifestRoot = (manifestUri.match(/([A-Za-z0-9_-]{43})/) || [, manifestUri])[1];
    const placeholderUri = `https://arweave.net/${manifestRoot}/0.json`;
    console.log(`\nManifest root: ${manifestRoot}`);
    console.log(`Sample item URI: ${placeholderUri}\n`);

    // 6. Compute SHA-256 hash commitment over the resolved item URIs.
    const preImage = metadataObjs.map((m, i) => `${i}:${m.name || ""}:https://arweave.net/${manifestRoot}/${i}.json`).join("|");
    const itemsHash = new Uint8Array(crypto.createHash("sha256").update(preImage).digest());

    // 7. Deploy: collection (tx 1) + candy machine with hidden settings (tx 2).
    //    Guard wrapping is a separate tx if you need guards; this script keeps it minimal.
    console.log("Creating collection...");
    const collectionSigner = generateSigner(umi);
    await createCollection(umi, {
        collection: collectionSigner,
        name: COLLECTION_NAME,
        uri: `https://arweave.net/${manifestRoot}`,
        plugins: [
            {
                type: "Royalties",
                basisPoints: ROYALTY_PCT * 100,
                creators: [{ address: umi.identity.publicKey, percentage: 100 }],
                ruleSet: { type: "None" },
            },
        ],
    }).sendAndConfirm(umi);
    console.log("Collection:", collectionSigner.publicKey.toString());

    console.log("Creating Candy Machine (hidden settings)...");
    const cmSigner = generateSigner(umi);
    await createCandyMachine(umi, {
        candyMachine: cmSigner,
        collection: collectionSigner.publicKey,
        collectionUpdateAuthority: umi.identity,
        itemsAvailable: BigInt(metadataObjs.length),
        hiddenSettings: some({
            name: PLACEHOLDER_NAME,
            uri: placeholderUri,
            hash: itemsHash,
        }),
    }).sendAndConfirm(umi);

    console.log("\n=== DEPLOYMENT COMPLETE ===");
    console.log("Collection:    ", collectionSigner.publicKey.toString());
    console.log("Candy Machine: ", cmSigner.publicKey.toString());
    console.log("Manifest root: ", manifestRoot);
    console.log("Items:         ", metadataObjs.length);
    console.log("On-chain txs:  ", "2 (collection + candy machine — fixed cost)");

    fs.writeFileSync("deployment-output.json", JSON.stringify({
        collection: collectionSigner.publicKey.toString(),
        candyMachine: cmSigner.publicKey.toString(),
        manifestRoot,
        placeholderUri,
        itemsHashHex: Buffer.from(itemsHash).toString("hex"),
        preImageSample: preImage.slice(0, 200),
        items: metadataObjs.length,
    }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
