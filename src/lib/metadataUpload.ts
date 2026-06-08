/**
 * Metadata upload helper used by Launchpad deploys.
 *
 * Devnet: Pinata IPFS (fast, free, no SOL).
 * Mainnet: Arweave via Irys (permanent, paid in SOL by the connected wallet).
 * Final fallback: Supabase `ipfs` bucket so deploy is never blocked.
 *
 * Returns a public HTTPS URL that Metaplex Core / Candy Machine can fetch.
 */
import { supabase } from "@/integrations/supabase/client";
import { uploadMetadataToArweave } from "@/integrations/arweave/legacyClient";
import { isArweaveWalletAvailable } from "@/integrations/arweave/nativeClient";
import { pinJson, pinDirectory, isDevnet } from "@/integrations/pinata/client";

/**
 * Pin per-item metadata JSONs as a single IPFS directory.
 * Returns `{ manifestRoot, items }` ready for the deploy-metaplex-launchpad
 * edge function's hidden-settings flow:
 *   `${manifestRoot}/0.json`, `${manifestRoot}/1.json`, …
 *
 * Mirrors the Arweave path-manifest pattern from scripts/deploy-cm.ts.
 */
export interface DevnetManifestResult {
  manifestRoot: string; // e.g. https://gateway.pinata.cloud/ipfs/<CID>
  cid: string;
  items: Array<{ name: string; uri: string }>;
}

export async function prepareDevnetManifest(
  metadataArray: Array<Record<string, any>>,
  collectionName = "collection",
): Promise<DevnetManifestResult> {
  if (!metadataArray.length) {
    throw new Error("prepareDevnetManifest: metadataArray is empty");
  }
  const files = metadataArray.map((m, i) => ({
    name: `${i}.json`,
    content: m,
    contentType: "application/json",
  }));
  const { cid, url } = await pinDirectory(files, `${collectionName}-manifest`);
  const manifestRoot = url.replace(/\/+$/, "");
  const items = metadataArray.map((m, i) => ({
    name: String(m?.name || `${collectionName} #${i}`).slice(0, 32),
    uri: `${manifestRoot}/${i}.json`,
  }));
  return { manifestRoot, cid, items };
}


const FALLBACK_BUCKET = "ipfs";

/** True when a Solana wallet (Phantom etc.) is available to fund Irys uploads. */
export function hasArweaveWallet(): boolean {
    return isArweaveWalletAvailable();
}

export interface MetadataUploadResult {
    url: string;
    provider: "arweave" | "pinata" | "supabase";
}

export async function uploadCollectionMetadata(
    metadata: Record<string, any>,
    opts: { collectionId?: string; filename?: string } = {},
): Promise<MetadataUploadResult> {
    // 1. DEVNET: prefer Pinata IPFS
    if (isDevnet()) {
        try {
            const { url } = await pinJson(
                metadata,
                opts.filename || `collection-${opts.collectionId || "meta"}.json`,
            );
            return { url, provider: "pinata" };
        } catch (err: any) {
            console.warn("[metadataUpload] Pinata failed, falling back:", err?.message || err);
        }
    }

    // 2. MAINNET (or Pinata failure): Arweave path — permanent
    if (hasArweaveWallet()) {
        try {
            const url = await uploadMetadataToArweave(metadata);
            return { url, provider: "arweave" };
        } catch (err: any) {
            console.warn(
                "[metadataUpload] Arweave upload failed, falling back to Supabase:",
                err?.message || err,
            );
        }
    }

    // 3. Supabase storage fallback (public bucket)
    const filename =
        opts.filename ||
        `collection-${opts.collectionId || crypto.randomUUID()}-${Date.now()}.json`;
    const path = `metadata/${filename}`;
    const body = new Blob([JSON.stringify(metadata, null, 2)], {
        type: "application/json",
    });

    const { error: uploadError } = await supabase.storage
        .from(FALLBACK_BUCKET)
        .upload(path, body, {
            contentType: "application/json",
            upsert: true,
        });

    if (uploadError) {
        throw new Error(
            `Metadata upload failed (Supabase fallback): ${uploadError.message}`,
        );
    }

    const { data } = supabase.storage.from(FALLBACK_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
        throw new Error("Metadata upload succeeded but public URL is empty");
    }
    return { url: data.publicUrl, provider: "supabase" };
}
