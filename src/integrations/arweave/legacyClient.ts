/**
 * ⚠️ COMPAT SHIM — legacy import path.
 *
 * This file used to be the full Irys SDK client (~2k lines). It is now a
 * thin wrapper over `src/integrations/arweave/nativeClient.ts` so existing
 * call sites that import from `@/integrations/arweave/legacyClient` keep working
 * during/after the native-Arweave migration.
 *
 * Behavioural differences from the old Irys client (silently applied):
 *   • All uploads are real Arweave txs signed by the user's ArConnect /
 *     Wander wallet — the `wallet` argument is ignored.
 *   • There is no node balance. `preFundIrysForBatch` is a no-op,
 *     `getIrysBalance` / `checkIrysBalanceThreshold` reflect the user's
 *     native AR balance.
 *   • `isMutable` keeps the `Root-TX` tag convention so historical chains
 *     remain queryable via GraphQL, but there is no mutable gateway —
 *     `getIrysMutableUrl(txId)` returns the public gateway URL for that tx.
 *   • L1 txs (>~95 KiB) are awaited via `waitForConfirmation` before the
 *     URL is returned, so Candy Machine deploys never see a 404 metadata
 *     URI. Set `awaitConfirmation: false` to skip the wait.
 *
 * NEW CODE should import from `@/integrations/arweave/nativeClient`
 * directly. This shim exists only to avoid a 25-file blast radius.
 */

import {
  uploadBytes,
  uploadJson as nativeUploadJson,
  waitForConfirmation,
  getArweaveUrl,
  getArBalance,
  ARWEAVE_GATEWAY,
  type ArweaveTag,
  type ArweaveUploadResult,
} from "@/integrations/arweave/nativeClient";
import { generateThumbnails, type ProcessedImage } from "@/lib/thumbnailGenerator";

// Re-export GraphQL helper so callers that import it from client.ts (not
// graphql.ts) keep working — matches the historical surface.
export { queryArweaveByTags as queryIrysByTags } from "./graphql";
export type { QueryTag, IrysQueryNode } from "./graphql";

// ──────────────────────────────── Constants ──────────────────────────────

export const ARWEAVE_GATEWAY_URL = ARWEAVE_GATEWAY;

/** @deprecated Legacy gateway constants — use {@link ARWEAVE_GATEWAY_URL}. */
export const IRYS_GATEWAY = ARWEAVE_GATEWAY;

// ────────────────────────────────── URLs ─────────────────────────────────

export function getIrysDownloadUrl(txId: string): string {
  return getArweaveUrl(txId);
}

/**
 * Native Arweave has no mutable gateway. Callers are expected to first
 * resolve the *latest* tx id via GraphQL (`queryIrysByTags` / discovery
 * helpers) and then pass that id here. The returned URL is the canonical
 * `arweave.net/{txId}` for that resolved tx.
 */
export function getIrysMutableUrl(txId: string): string {
  return getArweaveUrl(txId);
}

// ──────────────────────────────── Downloads ──────────────────────────────

export async function downloadFromIrys(txId: string): Promise<Response> {
  return fetch(getArweaveUrl(txId));
}

export async function downloadMetadataFromIrys(txId: string): Promise<any> {
  const res = await fetch(getArweaveUrl(txId));
  if (!res.ok) throw new Error(`Arweave fetch failed (${res.status}): ${txId}`);
  return res.json();
}

export async function downloadFileFromIrys(txId: string): Promise<Blob> {
  const res = await fetch(getArweaveUrl(txId));
  if (!res.ok) throw new Error(`Arweave fetch failed (${res.status}): ${txId}`);
  return res.blob();
}

// ──────────────────────────── Retry primitive ────────────────────────────

const MAX_RETRIES = 3;

async function withRetry<T>(fn: () => Promise<T>, label: string, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const last = attempt === retries - 1;
      if (last) throw err;
      const delay = 1000 * Math.pow(2, attempt);
      console.warn(`[Arweave] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms`, err?.message || err);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

// ───────────────────────────── Upload helpers ────────────────────────────

const APP_TAG: ArweaveTag = { name: "application-id", value: "The Lily Pad" };

function buildTags(contentType: string, customTags: ArweaveTag[] = [], rootTx?: string): ArweaveTag[] {
  const tags: ArweaveTag[] = [APP_TAG, ...customTags];
  if (rootTx) tags.push({ name: "Root-TX", value: rootTx });
  // contentType is set at the nativeClient layer; passing it as a tag is
  // redundant but harmless and matches old behavior for indexers.
  if (contentType) tags.push({ name: "Content-Type", value: contentType });
  return tags;
}

async function maybeAwait(result: ArweaveUploadResult, awaitConfirmation: boolean): Promise<void> {
  if (!awaitConfirmation) return;
  if (result.type !== "BASE") return; // bundled dispatch is instantly resolvable
  await waitForConfirmation(result.id).catch(err => {
    console.warn(`[Arweave] confirmation wait failed for ${result.id}:`, err?.message || err);
    // Surface — Candy Machine creators rely on the URL resolving.
    throw err;
  });
}

// ────────────────────────────── Single upload ────────────────────────────

export async function uploadToArweave(
  file: File | Blob,
  _wallet?: any,
  isMutable = false,
  rootTx?: string,
  _feeMultiplier?: number,
  customTags?: ArweaveTag[],
  _skipFunding = false,
  _solanaProvider?: any,
  opts: { awaitConfirmation?: boolean } = {},
): Promise<string> {
  const awaitConfirmation = opts.awaitConfirmation ?? true;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const result = await withRetry(
    () => uploadBytes(bytes, {
      contentType,
      tags: buildTags(contentType, customTags, isMutable ? rootTx : undefined),
    }),
    `upload(${(file as File).name ?? "blob"})`,
  );
  await maybeAwait(result, awaitConfirmation);
  return result.url;
}

export async function uploadMetadataToArweave(
  metadata: any,
  _wallet?: any,
  isMutable = false,
  rootTx?: string,
  customTags?: ArweaveTag[],
  _solanaProvider?: any,
  opts: { awaitConfirmation?: boolean } = {},
): Promise<string> {
  const awaitConfirmation = opts.awaitConfirmation ?? true;
  const bytes = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
  const result = await withRetry(
    () => uploadBytes(bytes, {
      contentType: "application/json",
      tags: buildTags("application/json", customTags, isMutable ? rootTx : undefined),
    }),
    "uploadJson",
  );
  await maybeAwait(result, awaitConfirmation);
  return result.url;
}

// ───────────────────────── Dynamic NFT (Root-TX chain) ───────────────────

export async function mutateNFTMetadata(
  rootTxId: string,
  wallet: any,
  newMetadata: any,
  newImageFile?: File | Blob,
  newAnimFile?: File | Blob,
): Promise<{ metadataUri: string; imageUri?: string; animationUri?: string }> {
  let imageUri = newMetadata.image as string | undefined;
  let animationUri: string | undefined;

  if (newImageFile) imageUri = await uploadToArweave(newImageFile, wallet);
  if (newAnimFile)  animationUri = await uploadToArweave(newAnimFile, wallet);

  const mutated = {
    ...newMetadata,
    ...(imageUri && { image: imageUri }),
    ...(animationUri && { animation_url: animationUri }),
  };

  const metadataUri = await uploadMetadataToArweave(mutated, wallet, true, rootTxId);
  return { metadataUri, imageUri, animationUri };
}

// ───────────────────────────── NFT convenience ───────────────────────────

export async function uploadNFTToArweave(
  imageFile: File | Blob,
  wallet: any,
  metadata: { name: string; description: string; symbol?: string; attributes?: any[];[k: string]: any },
  animationFile?: File | Blob,
  isMutable = false,
  rootTx?: string,
): Promise<{ metadataUri: string; imageUri: string; animationUri?: string }> {
  const imageUri = await uploadToArweave(imageFile, wallet, isMutable, rootTx);
  let animationUri: string | undefined;
  if (animationFile) animationUri = await uploadToArweave(animationFile, wallet, isMutable, rootTx);

  const { buildMetaplexMetadata } = await import('@/lib/metaplexMetadata');
  const {
    name, symbol, description, attributes,
    external_url, externalUrl,
    image: _ignoreImage,
    animation_url: _ignoreAnim,
    properties: _ignoreProps,
    ...extra
  } = metadata as any;

  const nftMetadata = buildMetaplexMetadata({
    name,
    symbol,
    description,
    image: imageUri,
    animationUrl: animationUri,
    externalUrl: externalUrl || external_url,
    attributes,
    extra,
  });

  const metadataUri = await uploadMetadataToArweave(nftMetadata, wallet, isMutable, rootTx);
  return { metadataUri, imageUri, animationUri };
}

// ─────────────────────────── Resume / progress ───────────────────────────

export interface SavedUploadProgress {
  completedItems: BatchUploadResult[];
  totalItems: number;
  updatedAt: string;
}

const PROGRESS_KEY = (k: string) => `lilypad:upload-progress:${k}`;

export function saveUploadProgress(collectionKey: string, results: BatchUploadResult[], totalItems: number) {
  try {
    const payload: SavedUploadProgress = {
      completedItems: results,
      totalItems,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(PROGRESS_KEY(collectionKey), JSON.stringify(payload));
  } catch (e) {
    console.warn("[Arweave] saveUploadProgress failed:", e);
  }
}

export function loadUploadProgress(collectionKey: string): SavedUploadProgress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY(collectionKey));
    if (!raw) return null;
    return JSON.parse(raw) as SavedUploadProgress;
  } catch {
    return null;
  }
}

export function clearUploadProgress(collectionKey: string) {
  try {
    localStorage.removeItem(PROGRESS_KEY(collectionKey));
  } catch { /* noop */ }
}

// ───────────────────────────── Batch upload ──────────────────────────────

export interface BatchUploadItem {
  file: File | Blob;
  buildMetadata: (imageUri: string, thumbUri?: string, previewUri?: string) => any;
}

export interface BatchUploadResult {
  tokenId: number;
  arweaveUri: string;
  arweaveImageUri: string;
  arweaveThumbUri: string;
  arweavePreviewUri: string;
}

export interface BatchUploadResponse {
  items: BatchUploadResult[];
  manifestUri?: string;
}

/**
 * Batch upload that mirrors the old Irys batch surface. Under the hood each
 * file is now its own user-signed Arweave tx — there is no bundler. The
 * `concurrency` knob still applies per-window; `feeMultiplier`, `skipFunding`,
 * `wallet`, `solanaProvider` are accepted for signature compatibility and
 * ignored. `manifestUri` is no longer produced (no Irys onchain folder).
 */
export async function uploadBatchToArweave(
  items: BatchUploadItem[],
  _wallet?: any,
  onProgress?: (completed: number, total: number, status: string) => void,
  concurrency = 5,
  enableThumbnails = true,
  customTags: ArweaveTag[] = [],
  isMutable = false,
  rootTx?: string,
  _feeMultiplier?: number,
  signal?: AbortSignal,
  resumeKey?: string,
  _skipFunding = false,
  _solanaProvider?: any,
): Promise<BatchUploadResponse> {
  if (items.length === 0) return { items: [] };

  // Resume from saved progress
  let previous: BatchUploadResult[] = [];
  const done = new Set<number>();
  if (resumeKey) {
    const saved = loadUploadProgress(resumeKey);
    if (saved?.completedItems?.length) {
      previous = saved.completedItems;
      previous.forEach(r => done.add(r.tokenId));
      onProgress?.(previous.length, items.length, `Resuming — ${previous.length}/${items.length} already uploaded`);
    }
  }

  const results: BatchUploadResult[] = new Array(items.length);
  for (const r of previous) results[r.tokenId] = r;

  const window = Math.min(concurrency, 5);
  let uploaded = previous.length;

  const rootTag = isMutable ? rootTx : undefined;

  for (let i = 0; i < items.length; i += window) {
    if (signal?.aborted) break;

    const slice = items.slice(i, i + window);
    const idxs = slice.map((_, k) => i + k);

    const windowResults = await Promise.all(slice.map(async (item, idx) => {
      const globalIdx = idxs[idx];
      if (done.has(globalIdx)) return null;
      try {
        onProgress?.(uploaded, items.length, `Processing item ${globalIdx + 1}/${items.length}…`);

        // 1. Thumbnails
        let processed: ProcessedImage | undefined;
        if (enableThumbnails) {
          const f = item.file instanceof File
            ? item.file
            : new File([item.file], `item_${globalIdx}.png`, { type: item.file.type });
          processed = await generateThumbnails(f);
        }

        // 2. Image
        const imgBytes = new Uint8Array(await item.file.arrayBuffer());
        const imgRes = await withRetry(() => uploadBytes(imgBytes, {
          contentType: item.file.type || "image/png",
          tags: buildTags(item.file.type || "image/png", customTags, rootTag),
        }), `image #${globalIdx + 1}`);
        await maybeAwait(imgRes, true);

        // 3. Thumb
        let thumbUri = imgRes.url;
        if (processed?.thumb && processed.thumb !== processed.original) {
          const tBytes = new Uint8Array(await processed.thumb.arrayBuffer());
          const tRes = await withRetry(() => uploadBytes(tBytes, {
            contentType: "image/webp",
            tags: buildTags("image/webp", customTags, rootTag),
          }), `thumb #${globalIdx + 1}`);
          await maybeAwait(tRes, true);
          thumbUri = tRes.url;
        }

        // 4. Preview
        let previewUri = imgRes.url;
        if (processed?.preview && processed.preview !== processed.original) {
          const pBytes = new Uint8Array(await processed.preview.arrayBuffer());
          const pRes = await withRetry(() => uploadBytes(pBytes, {
            contentType: "image/webp",
            tags: buildTags("image/webp", customTags, rootTag),
          }), `preview #${globalIdx + 1}`);
          await maybeAwait(pRes, true);
          previewUri = pRes.url;
        }

        // 5. Metadata JSON
        const metadata = item.buildMetadata(imgRes.url, thumbUri, previewUri);
        const metaBytes = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
        const metaRes = await withRetry(() => uploadBytes(metaBytes, {
          contentType: "application/json",
          tags: buildTags("application/json", customTags, rootTag),
        }), `metadata #${globalIdx + 1}`);
        await maybeAwait(metaRes, true);

        return {
          tokenId: globalIdx,
          arweaveUri: metaRes.url,
          arweaveImageUri: imgRes.url,
          arweaveThumbUri: thumbUri,
          arweavePreviewUri: previewUri,
        } satisfies BatchUploadResult;
      } catch (err) {
        console.error(`[Arweave] Item ${globalIdx + 1} failed:`, err);
        return null;
      }
    }));

    for (const r of windowResults) {
      if (r) {
        results[r.tokenId] = r;
        uploaded++;
      }
    }
    onProgress?.(uploaded, items.length, `Uploaded ${uploaded} / ${items.length}…`);
    if (resumeKey) saveUploadProgress(resumeKey, results.filter(Boolean), items.length);
    await new Promise(r => setTimeout(r, 0));
  }

  return { items: results.filter(Boolean) };
}

// ───────────────────── Funding stubs (no-ops for native) ─────────────────

/** No-op. Native Arweave has no node balance — user pays per-tx. */
export async function preFundIrysForBatch(
  _assets: (File | Blob | { size: number })[],
  _wallet?: any,
  options?: { feeMultiplier?: number; bufferMultiplier?: number; onStatus?: (s: string) => void },
  _solanaProvider?: any,
): Promise<void> {
  options?.onStatus?.("Native Arweave: per-tx funding — no pre-funding required.");
}

/** @deprecated No-op under native Arweave. */
export async function fundIrysNode(_amountStandard: number, _wallet?: any, _feeMultiplier?: number): Promise<null> {
  console.warn("[Arweave] fundIrysNode is a no-op under native Arweave.");
  return null;
}

/** Returns the user's AR balance as a string (standard units, not winston). */
export async function getIrysBalance(wallet?: { address?: string }): Promise<string> {
  const ar = await getArBalance(wallet?.address);
  return ar.toString();
}

export async function checkIrysBalanceThreshold(
  wallet?: { address?: string },
  thresholdStandard = 0.1,
): Promise<{ balanceStandard: number; isBelowThreshold: boolean }> {
  const balanceStandard = await getArBalance(wallet?.address);
  return { balanceStandard, isBelowThreshold: balanceStandard <= thresholdStandard };
}

/** @deprecated No-op under native Arweave. */
export async function withdrawIrysNodeBalance(_amountStandard: number | "all", _wallet?: any): Promise<null> {
  console.warn("[Arweave] withdrawIrysNodeBalance is a no-op under native Arweave.");
  return null;
}

/** @deprecated No-op. Receipts are not generated by native Arweave gateways. */
export async function getIrysReceipt(_txId: string, _wallet?: any): Promise<null> {
  return null;
}

/** @deprecated No-op. */
export async function verifyIrysReceipt(_receipt: any, _wallet?: any): Promise<boolean> {
  return false;
}
