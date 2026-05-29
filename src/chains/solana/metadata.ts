import { Umi, createGenericFileFromBrowserFile, createGenericFile } from '@metaplex-foundation/umi';
import { generateThumbnails, type ProcessedImage } from '@/lib/thumbnailGenerator';

/**
 * Solana Metadata - Arweave/Irys uploads with Umi's UploaderInterface
 * Uses umi.uploader.upload() and umi.uploader.uploadJson() for all storage operations.
 * The irysUploader plugin handles Irys node communication and automatic funding.
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            const isLast = attempt === MAX_RETRIES - 1;
            if (isLast) throw err;
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            console.warn(`[Irys] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms...`, err.message);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error('Unreachable');
}

/**
 * Upload a single file to Arweave via Irys (using createGenericFileFromBrowserFile)
 */
export async function uploadFile(umi: Umi, file: File): Promise<string> {
    const genericFile = await createGenericFileFromBrowserFile(file);
    const [uri] = await withRetry(() => umi.uploader.upload([genericFile]), `upload(${file.name})`);
    return uri;
}

/**
 * Upload multiple files to Arweave in batches with retry
 */
export async function uploadFiles(umi: Umi, files: File[]): Promise<string[]> {
    const genericFiles = await Promise.all(
        files.map(file => createGenericFileFromBrowserFile(file))
    );

    const batchSize = 10;
    const uris: string[] = [];

    for (let i = 0; i < genericFiles.length; i += batchSize) {
        const batch = genericFiles.slice(i, i + batchSize);
        const batchUris = await withRetry(
            () => umi.uploader.upload(batch),
            `uploadBatch(${i}..${i + batch.length})`
        );
        uris.push(...batchUris);
    }

    return uris;
}

/**
 * Upload JSON metadata to Arweave
 */
export async function uploadMetadata(umi: Umi, metadata: any): Promise<string> {
    return withRetry(() => umi.uploader.uploadJson(metadata), 'uploadJson');
}

/**
 * Upload multiple JSON metadata objects in batches
 */
export async function uploadJsonBatch(umi: Umi, metadataArray: any[]): Promise<string[]> {
    const genericFiles = metadataArray.map((metadata, index) => ({
        buffer: new Uint8Array(Buffer.from(JSON.stringify(metadata), 'utf-8')),
        fileName: `${index}.json`,
        displayName: `Metadata ${index}`,
        uniqueName: `${Date.now()}-${index}.json`,
        contentType: 'application/json',
        extension: 'json',
        tags: [],
    }));

    const batchSize = 10;
    const uris: string[] = [];

    for (let i = 0; i < genericFiles.length; i += batchSize) {
        const batch = genericFiles.slice(i, i + batchSize);
        const batchUris = await withRetry(
            () => umi.uploader.upload(batch),
            `uploadJsonBatch(${i}..${i + batch.length})`
        );
        uris.push(...batchUris);
    }

    return uris;
}

// ── Arweave Directory Manifest ───────────────────────────────────────────

export interface ArweaveManifestResult {
    /** TX id of the manifest itself (the "root") */
    manifestRoot: string;
    /** Full URI to the manifest tx (https://arweave.net/<ROOT>) */
    manifestUri: string;
    /** Per-item gateway URIs resolvable via the manifest, e.g. arweave.net/<ROOT>/0.json */
    itemUris: string[];
    /** Raw per-file TX ids from the bundled upload (order-aligned) */
    fileTxIds: string[];
}

/**
 * Bundle a list of files into a single Irys bundle, then publish a single
 * Arweave path-manifest pointing at each file. Result: every item is
 * addressable as `https://arweave.net/<ROOT>/<filename>` while only TWO
 * Turbo-funded upload operations are performed regardless of collection size.
 *
 * The returned `manifestRoot` is what you want to pass as `prefixUri` to a
 * Core Candy Machine (configLineSettings) or as the hidden-settings
 * placeholder URI prefix, so per-item URIs collapse to e.g. "0.json".
 *
 * @param umi      Umi instance with irysUploader plugin
 * @param files    Files to bundle — `fileName` is used as the manifest path
 *                 (e.g. "0.json", "0.png"). Order is preserved in `itemUris`.
 * @param indexPath Optional file to point the manifest's `index` at (default: first file)
 */
export async function uploadArweaveManifest(
    umi: Umi,
    files: Array<{ buffer: Uint8Array; fileName: string; contentType: string }>,
    indexPath?: string,
): Promise<ArweaveManifestResult> {
    if (files.length === 0) {
        throw new Error('uploadArweaveManifest: no files to bundle');
    }

    // 1. Upload all files in a single bundled call (Turbo will batch internally).
    const genericFiles = files.map(f => ({
        buffer: f.buffer,
        fileName: f.fileName,
        displayName: f.fileName,
        uniqueName: f.fileName,
        contentType: f.contentType,
        extension: f.fileName.split('.').pop() || '',
        tags: [],
    }));

    const fileUris = await withRetry(
        () => umi.uploader.upload(genericFiles),
        `manifestBundle(${files.length})`,
    );

    // Extract bare TX ids from the full URIs (arweave.net/<id> or https://...)
    const fileTxIds = fileUris.map(u => {
        const m = u.match(/([A-Za-z0-9_-]{43})/);
        return m ? m[1] : u;
    });

    // 2. Build the Arweave path-manifest JSON.
    const paths: Record<string, { id: string }> = {};
    files.forEach((f, i) => { paths[f.fileName] = { id: fileTxIds[i] }; });

    const manifest = {
        manifest: 'arweave/paths',
        version: '0.1.0',
        index: { path: indexPath || files[0].fileName },
        paths,
    };

    // 3. Upload the manifest itself, tagged so Arweave gateways serve subpaths.
    const manifestFile = {
        buffer: new Uint8Array(Buffer.from(JSON.stringify(manifest), 'utf-8')),
        fileName: 'manifest.json',
        displayName: 'Directory Manifest',
        uniqueName: `manifest-${Date.now()}.json`,
        contentType: 'application/x.arweave-manifest+json',
        extension: 'json',
        tags: [
            { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
            { name: 'Type', value: 'manifest' },
        ],
    };

    const [manifestUri] = await withRetry(
        () => umi.uploader.upload([manifestFile]),
        'manifestRoot',
    );

    const manifestRoot = (manifestUri.match(/([A-Za-z0-9_-]{43})/) || [, manifestUri])[1];
    const gateway = `https://arweave.net/${manifestRoot}`;

    return {
        manifestRoot,
        manifestUri: gateway,
        itemUris: files.map(f => `${gateway}/${f.fileName}`),
        fileTxIds,
    };
}

/**
 * Convenience: bundle an array of metadata JSONs as 0.json, 1.json, … and
 * return the manifest root. Use the root as `prefixUri` so per-item config
 * lines collapse from a full URL to just "0.json".
 */
export async function uploadJsonManifest(
    umi: Umi,
    metadataArray: any[],
): Promise<ArweaveManifestResult> {
    const files = metadataArray.map((m, i) => ({
        buffer: new Uint8Array(Buffer.from(JSON.stringify(m), 'utf-8')),
        fileName: `${i}.json`,
        contentType: 'application/json',
    }));
    return uploadArweaveManifest(umi, files);
}

/**
 * Resolve metadata URI — requires an Arweave CID
 */
export function resolveMetadataUri(collectionId: string, tokenId: number | string, arweaveCid?: string): string {
    if (!arweaveCid) return '';
    return `https://arweave.net/${arweaveCid}/${tokenId}.json`;
}

/**
 * Resolve image URI — requires an Arweave CID
 */
export function resolveImageUri(collectionId: string, tokenId: number | string, extension = 'png', arweaveCid?: string): string {
    if (!arweaveCid) return '';
    return `https://arweave.net/${arweaveCid}/${tokenId}.${extension}`;
}

// ── Batch Upload Types ───────────────────────────────────────────────────

export interface BatchUploadItem {
    /** The image file to upload */
    file: File | Blob;
    /** Build metadata object given the uploaded image URIs */
    buildMetadata: (imageUri: string, thumbUri?: string, previewUri?: string) => any;
}

export interface BatchUploadResult {
    tokenId: number;
    arweaveUri: string;           // metadata URI
    arweaveImageUri: string;      // full-res image URI
    arweaveThumbUri: string;      // 512px thumbnail URI
    arweavePreviewUri: string;    // 1200px preview URI
}

export interface BatchUploadResponse {
    items: BatchUploadResult[];
    manifestUri?: string;
}

// ── Umi-Based Batch Upload ───────────────────────────────────────────────

/**
 * Upload a batch of NFT assets using Umi's uploader interface.
 *
 * Features:
 * - Uses umi.uploader.upload() for files (via irysUploader plugin)
 * - Uses umi.uploader.uploadJson() for metadata
 * - Automatic Irys funding handled by the plugin
 * - Thumbnail generation with configurable presets
 * - Progress callbacks for UI feedback
 * - Retry logic with exponential backoff
 * - Concurrent uploads for performance
 *
 * @param umi               Umi instance with irysUploader plugin
 * @param items             Array of files + metadata builders
 * @param onProgress        Progress callback (completed, total, status)
 * @param concurrency       Max concurrent uploads (default: 5)
 * @param enableThumbnails  Generate 512px thumb and 1200px preview (default: true)
 * @param signal            AbortSignal for cancellation
 */
export async function uploadBatchWithUmi(
    umi: Umi,
    items: BatchUploadItem[],
    onProgress?: (completed: number, total: number, status: string) => void,
    concurrency = 5,
    enableThumbnails = true,
    signal?: AbortSignal,
): Promise<BatchUploadResponse> {
    if (items.length === 0) return { items: [] };

    const results: BatchUploadResult[] = new Array(items.length);
    let uploadedCount = 0;
    const uploadConcurrency = Math.min(concurrency, 10);

    // Helper to create GenericFile from Blob/File
    const createFile = async (blob: Blob, name: string, type: string) => {
        if (blob instanceof File) {
            return createGenericFileFromBrowserFile(blob);
        }
        // Convert Blob to File for GenericFile creation
        const arrayBuffer = await blob.arrayBuffer();
        return createGenericFile(new Uint8Array(arrayBuffer), name, {
            contentType: type,
        });
    };

    for (let i = 0; i < items.length; i += uploadConcurrency) {
        if (signal?.aborted) break;

        const window = items.slice(i, i + uploadConcurrency);
        const windowIndices = Array.from({ length: window.length }, (_, k) => i + k);

        const windowResults = await Promise.all(
            window.map(async (item, idx) => {
                const globalIdx = windowIndices[idx];

                try {
                    onProgress?.(uploadedCount, items.length, `Processing item ${globalIdx + 1}/${items.length}…`);

                    // 1. Generate thumbnails
                    let processed: ProcessedImage | undefined;
                    if (enableThumbnails) {
                        const file = item.file instanceof File
                            ? item.file
                            : new File([item.file], `item_${globalIdx}.png`, { type: item.file.type });
                        processed = await generateThumbnails(file);
                    }

                    // 2. Upload full-res image
                    const imgFile = await createFile(
                        item.file,
                        `image_${globalIdx}.png`,
                        item.file.type || 'image/png'
                    );
                    const [imgUri] = await withRetry(
                        () => umi.uploader.upload([imgFile]),
                        `image #${globalIdx + 1}`
                    );

                    // 3. Upload thumbnail (if generated and different from original)
                    let thumbUri = imgUri;
                    if (processed?.thumb && processed.thumb !== processed.original) {
                        const thumbFile = await createGenericFileFromBrowserFile(processed.thumb);
                        const [uri] = await withRetry(
                            () => umi.uploader.upload([thumbFile]),
                            `thumb #${globalIdx + 1}`
                        );
                        thumbUri = uri;
                    }

                    // 4. Upload preview (if generated and different from original)
                    let previewUri = imgUri;
                    if (processed?.preview && processed.preview !== processed.original) {
                        const previewFile = await createGenericFileFromBrowserFile(processed.preview);
                        const [uri] = await withRetry(
                            () => umi.uploader.upload([previewFile]),
                            `preview #${globalIdx + 1}`
                        );
                        previewUri = uri;
                    }

                    // 5. Build and upload metadata
                    const metadata = item.buildMetadata(imgUri, thumbUri, previewUri);
                    const metaUri = await withRetry(
                        () => umi.uploader.uploadJson(metadata),
                        `metadata #${globalIdx + 1}`
                    );

                    return {
                        tokenId: globalIdx,
                        arweaveUri: metaUri,
                        arweaveImageUri: imgUri,
                        arweaveThumbUri: thumbUri,
                        arweavePreviewUri: previewUri,
                    } satisfies BatchUploadResult;
                } catch (err) {
                    console.error(`[UmiUpload] Item ${globalIdx + 1} failed:`, err);
                    return null;
                }
            })
        );

        for (const r of windowResults) {
            if (r) {
                results[r.tokenId] = r;
                uploadedCount++;
            }
        }

        onProgress?.(uploadedCount, items.length, `Uploaded ${uploadedCount}/${items.length}`);

        // Yield to event loop between windows
        if (i + uploadConcurrency < items.length) {
            await new Promise(r => setTimeout(r, 10));
        }
    }

    // Filter out null entries (failed uploads)
    const validResults = results.filter(Boolean);

    return { items: validResults };
}

/**
 * Upload a single NFT asset with Umi (1-of-1 convenience wrapper)
 */
export async function uploadSingleWithUmi(
    umi: Umi,
    file: File,
    buildMetadata: (imageUri: string) => any,
    enableThumbnails = true,
): Promise<BatchUploadResult> {
    const response = await uploadBatchWithUmi(
        umi,
        [{ file, buildMetadata: (img, thumb, preview) => buildMetadata(img) }],
        undefined,
        1,
        enableThumbnails
    );

    if (response.items.length === 0) {
        throw new Error('Failed to upload NFT asset');
    }

    return response.items[0];
}
