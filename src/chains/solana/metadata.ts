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
