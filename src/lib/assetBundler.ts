import { Zip, ZipPassThrough } from "fflate";
import { toast } from "sonner";
import { Layer, BlendMode } from "@/components/launchpad/LayerManager";
import { TraitRule } from "@/components/launchpad/TraitRulesManager";

export interface GeneratedNFT {
    id: number;
    name?: string;
    isOneOfOne?: boolean;
    customFile?: File;
    metadataOverride?: {
        name: string;
        description: string;
        attributes: { trait_type: string; value: string }[];
    };
    traits: {
        layerId: string;
        layerName: string;
        traitId: string;
        traitName: string;
        imageUrl?: string;
        blendMode?: BlendMode;
        opacity?: number;
    }[];
}

export interface NFTMetadata {
    name: string;
    description: string;
    image: string;
    external_url?: string;
    attributes: {
        trait_type: string;
        value: string;
    }[];
}

/**
 * Load image helper for canvas compositing
 */
export const loadImage = (src: string, timeoutMs: number = 10000): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";

        const timer = setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            img.src = ''; // abort loading
            reject(new Error(`Image load timed out after ${timeoutMs}ms: ${src.substring(0, 80)}`));
        }, timeoutMs);

        img.onload = () => {
            clearTimeout(timer);
            resolve(img);
        };
        img.onerror = (e) => {
            clearTimeout(timer);
            reject(e);
        };
        img.src = src;
    });
};

/**
 * Composite a single NFT image onto a canvas and return as data URL.
 * For small preview counts only — use compositeNFTImageToBlob for bulk exports.
 */
export const compositeNFTImage = async (
    nft: GeneratedNFT,
    canvasSize: number
): Promise<string | null> => {
    const hasImages = nft.traits.some((t) => t.imageUrl);
    if (!hasImages) return null;

    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Could not get canvas context");

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    for (const trait of nft.traits) {
        if (trait.imageUrl) {
            try {
                const img = await loadImage(trait.imageUrl);
                ctx.save();
                ctx.globalCompositeOperation = trait.blendMode || "source-over";
                ctx.globalAlpha = (trait.opacity ?? 100) / 100;
                ctx.drawImage(img, 0, 0, canvasSize, canvasSize);
                ctx.restore();
            } catch (error) {
                console.warn(`Failed to load image for trait: ${trait.traitName}`, error);
            }
        }
    }

    return canvas.toDataURL("image/png");
};

/**
 * Composite a single NFT onto an EXISTING canvas and return as Blob.
 * This avoids creating/destroying canvas elements and avoids the ~33% overhead
 * of base64 data URLs. The canvas is reused across all NFTs in a batch.
 */
export const compositeNFTImageToBlob = async (
    nft: GeneratedNFT,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
): Promise<Blob | null> => {
    const hasImages = nft.traits.some((t) => t.imageUrl);
    if (!hasImages) return null;

    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    for (const trait of nft.traits) {
        if (trait.imageUrl) {
            try {
                const img = await loadImage(trait.imageUrl);
                ctx.save();
                ctx.globalCompositeOperation = trait.blendMode || "source-over";
                ctx.globalAlpha = (trait.opacity ?? 100) / 100;
                ctx.drawImage(img, 0, 0, size, size);
                ctx.restore();
            } catch (error) {
                console.warn(`Failed to load image for trait: ${trait.traitName}`, error);
            }
        }
    }

    return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/png");
    });
};

/**
 * Create a reusable canvas + context pair for bulk compositing.
 */
export const createReusableCanvas = (size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");
    return { canvas, ctx };
};

/**
 * Estimate **peak** memory usage for a batch export in MB.
 *
 * Because we use a single reusable canvas and add each blob to the ZIP
 * immediately, peak memory ≈ canvas RGBA buffer + one PNG blob + JSZip
 * accumulated data.  The old estimator multiplied raw pixels × count,
 * which massively over-counted since we never hold all uncompressed
 * images at once.
 *
 * New formula:
 *   peakMB ≈ canvasRGBA + (count × avgPngBlobSize) + JSZipOverhead
 *
 * avgPngBlobSize is conservatively estimated at ~12% of raw RGBA for
 * typical generative-art PNGs (flat colours, limited palette).
 */
export const estimateExportMemoryMB = (count: number, resolution: number): number => {
    const canvasRGBA = resolution * resolution * 4;                    // one canvas
    const avgPngBlob = canvasRGBA * 0.12;                              // compressed blob
    const jsZipOverhead = count * avgPngBlob;                          // accumulated blobs
    return (canvasRGBA + avgPngBlob + jsZipOverhead) / (1024 * 1024);
};

/**
 * Generate metadata for Solana (ERC-721 style)
 */
export const nftToStandardMetadata = (
    nft: GeneratedNFT,
    collectionName: string,
    collectionDescription: string,
    baseImageUri: string = ""
): any => {
    if (nft.isOneOfOne && nft.metadataOverride) {
        return {
            name: nft.metadataOverride.name,
            description: nft.metadataOverride.description,
            image: baseImageUri ? `${baseImageUri}/${nft.id}.png` : `ipfs://YOUR_IMAGE_CID/${nft.id}.png`,
            attributes: nft.metadataOverride.attributes,
        };
    }

    return {
        name: nft.name || `${collectionName} #${nft.id}`,
        description: collectionDescription || `${collectionName} NFT #${nft.id}`,
        image: baseImageUri ? `${baseImageUri}/${nft.id}.png` : `ipfs://YOUR_IMAGE_CID/${nft.id}.png`,
        attributes: nft.traits.map((trait) => ({
            trait_type: trait.layerName,
            value: trait.traitName,
        })),
    };
};

/**
 * Zips a collection of files into a Blob asynchronously without allocating
 * huge contiguous ArrayBuffers, and writes directly to disk if supported.
 */
export const createZipStream = async (fileName: string) => {
    const hasFSA = 'showSaveFilePicker' in window;
    let outStream: any = null;
    let chunks: Uint8Array[] = [];

    if (hasFSA) {
        try {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } }]
            });
            outStream = await handle.createWritable();
        } catch (err: any) {
            // User cancelled file picker -> abort
            if (err.name === 'AbortError') throw err;
            console.warn('File Access API error, falling back to memory chunks', err);
            outStream = null;
        }
    }

    let finishResolve: (val: Blob | null) => void;
    let finishReject: (err: Error) => void;
    const finishPromise = new Promise<Blob | null>((res, rej) => {
        finishResolve = res;
        finishReject = rej;
    });

    const zip = new Zip(async (err, dat, final) => {
        if (err) {
            finishReject(err);
            return;
        }
        if (outStream) {
            await outStream.write(dat);
            if (final) {
                await outStream.close();
                finishResolve(null); // no blob needed, already saved!
            }
        } else {
            chunks.push(dat);
            if (final) {
                finishResolve(new Blob(chunks as BlobPart[], { type: 'application/zip' }));
            }
        }
    });

    return {
        addFile: (path: string, data: Uint8Array) => {
            const fileStream = new ZipPassThrough(path);
            zip.add(fileStream);
            fileStream.push(data, true);
        },
        finish: async () => {
            zip.end();
            return finishPromise;
        }
    };
};

/**
 * Bundle assets into a ZIP file with professional folder structure.
 *
 * Memory-safe approach:
 *   1. A single reusable canvas composites each NFT one at a time.
 *   2. Each PNG blob is added to JSZip immediately — we never hold
 *      more than one uncompressed frame in memory.
 *   3. Items are processed in small batches (BATCH_SIZE) with
 *      `setTimeout(0)` yields between batches so the UI stays
 *      responsive and the GC can reclaim temporary objects.
 *   4. The final ZIP is compressed with DEFLATE level 6 for a good
 *      size/speed tradeoff.
 *
 * The old hard cap of 2 GB (based on a flawed formula) has been
 * replaced with a much higher, realistic limit.
 */
export const bundleAssetsAsZip = async (
    nfts: GeneratedNFT[],
    collectionName: string,
    collectionDescription: string,
    chain: string,
    resolution: number,
    onProgress: (status: string, progress: number) => void,
    imageCid: string = "YOUR_IMAGE_CID",
    customFileName: string = "export.zip"
): Promise<Blob | null> => {
    // ── Sanity check ──────────────────────────────
    const estimatedMB = estimateExportMemoryMB(nfts.length, resolution);
    if (estimatedMB > 3500) {
        toast.warning(
            `Very large export (~${Math.round(estimatedMB)} MB). ` +
            `Ensure enough disk space.`,
            { duration: 8000 }
        );
    }

    let zipStream;
    try {
        zipStream = await createZipStream(customFileName);
    } catch (err: any) {
        // user aborted save dialog
        return null;
    }

    const { canvas, ctx } = createReusableCanvas(resolution);
    const BATCH_SIZE = 10;
    const encoder = new TextEncoder();

    for (let i = 0; i < nfts.length; i++) {
        onProgress(`Compositing ${i + 1} / ${nfts.length}…`, Math.round(((i + 1) / nfts.length) * 80));
        const nft = nfts[i];
        let blob: Blob;

        // Handle Custom 1/1s with their own file
        if (nft.isOneOfOne && nft.customFile) {
            blob = nft.customFile;
        } else {
            // Try compositing standard traits
            const composite = await compositeNFTImageToBlob(nft, canvas, ctx);
            if (!composite) {
                console.warn(`Failed to composite image for NFT #${nft.id}`);
                continue;
            }
            blob = composite;
        }
        const u8 = new Uint8Array(await blob.arrayBuffer());
        zipStream.addFile(`images/${nft.id}.png`, u8);

        const metadata = nftToStandardMetadata(nft, collectionName, collectionDescription);

        const metaBlob = encoder.encode(JSON.stringify(metadata, null, 2));
        zipStream.addFile(`metadata/${nfts[i].id}.json`, metaBlob);

        // Yield every iteration so progress updates paint
        await new Promise((r) => setTimeout(r, 0));
    }

    // Collection manifest
    const manifestBlob = encoder.encode(JSON.stringify({
        name: collectionName,
        description: collectionDescription,
        total_supply: nfts.length,
        resolution: `${resolution}x${resolution}`,
        chain: chain.toUpperCase(),
        generated_at: new Date().toISOString(),
        image_cid: imageCid
    }, null, 2));

    zipStream.addFile("collection.json", manifestBlob);

    onProgress("Finalizing ZIP…", 95);
    const finalBlob = await zipStream.finish();

    onProgress("Complete", 100);
    return finalBlob; // finalBlob is null if we streamed directly to disk!
};
