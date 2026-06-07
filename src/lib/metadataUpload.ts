/**
 * Metadata upload helper used by Launchpad deploys.
 *
 * Tries Arweave (via Irys, paid in SOL by the connected Solana wallet)
 * first. If no Solana wallet is detected, falls back to uploading the JSON
 * to the public Supabase `ipfs` bucket so deploy is never blocked.
 *
 * Returns a public HTTPS URL that Metaplex Core / Candy Machine can fetch.
 */
import { supabase } from "@/integrations/supabase/client";
import { uploadMetadataToArweave } from "@/integrations/arweave/legacyClient";
import { isArweaveWalletAvailable } from "@/integrations/arweave/nativeClient";

const FALLBACK_BUCKET = "ipfs";

/** True when a Solana wallet (Phantom etc.) is available to fund Irys uploads. */
export function hasArweaveWallet(): boolean {
    return isArweaveWalletAvailable();
}

export interface MetadataUploadResult {
    url: string;
    provider: "arweave" | "supabase";
}

export async function uploadCollectionMetadata(
    metadata: Record<string, any>,
    opts: { collectionId?: string; filename?: string } = {},
): Promise<MetadataUploadResult> {
    // 1. Arweave path (preferred — permanent)
    if (hasArweaveWallet()) {
        try {
            const url = await uploadMetadataToArweave(metadata);
            return { url, provider: "arweave" };
        } catch (err: any) {
            console.warn(
                "[metadataUpload] Arweave upload failed, falling back to Supabase:",
                err?.message || err,
            );
            // fall through to Supabase fallback
        }
    }

    // 2. Supabase storage fallback (public bucket)
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
