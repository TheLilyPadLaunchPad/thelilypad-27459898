/**
 * Custom Umi UploaderInterface backed by native Arweave (arweave-js +
 * ArConnect/Wander). Drop-in replacement for `@metaplex-foundation/umi-
 * uploader-irys` — register with `umi.use(arweaveUploader())`.
 *
 * Behaviour notes vs the Irys plugin it replaces:
 *  • No bundler. Each call to `upload()` produces one Arweave tx per file,
 *    signed by the user's browser wallet and paid for in AR.
 *  • Files ≤ ~95 KiB are dispatched (bundled by wallet, near-instant URI).
 *    Larger files are L1 txs whose URIs may 404 for 2–20 min — Candy
 *    Machine deploy paths MUST call `waitForConfirmation()` from
 *    `nativeClient` before using the URI on-chain.
 *  • `getUploadPrice` returns a `SolAmount` of 0 — the user pays in AR
 *    directly, the platform deducts nothing in SOL.
 *  • `onProgress` is invoked per-file as a percentage of the batch.
 */

import type {
  UmiPlugin,
  UploaderInterface,
  UploaderUploadOptions,
  UploaderGetUploadPriceOptions,
  GenericFile,
  SolAmount,
} from "@metaplex-foundation/umi";
import { createAmount } from "@metaplex-foundation/umi";

import { uploadBytes, type ArweaveTag } from "./nativeClient";

function toArweaveTags(file: GenericFile): ArweaveTag[] {
  return file.tags.map((t) => ({ name: t.name, value: t.value }));
}

export function createArweaveUploader(): UploaderInterface {
  return {
    async upload(
      files: GenericFile[],
      options: UploaderUploadOptions = {}
    ): Promise<string[]> {
      const uris: string[] = [];
      for (let i = 0; i < files.length; i++) {
        if (options.signal?.aborted) {
          throw new Error("Upload aborted");
        }
        const file = files[i];
        const result = await uploadBytes(file.buffer, {
          contentType: file.contentType ?? undefined,
          tags: toArweaveTags(file),
        });
        uris.push(result.url);
        options.onProgress?.(
          Math.round(((i + 1) / files.length) * 100),
          { index: i, total: files.length, url: result.url }
        );
      }
      return uris;
    },

    async uploadJson<T>(
      json: T,
      options: UploaderUploadOptions = {}
    ): Promise<string> {
      if (options.signal?.aborted) {
        throw new Error("Upload aborted");
      }
      const bytes = new TextEncoder().encode(JSON.stringify(json));
      const result = await uploadBytes(bytes, {
        contentType: "application/json",
      });
      options.onProgress?.(100, { index: 0, total: 1, url: result.url });
      return result.url;
    },

    async getUploadPrice(
      _files: GenericFile[],
      _options: UploaderGetUploadPriceOptions = {}
    ): Promise<SolAmount> {
      // User pays in AR directly via wallet; no SOL is debited by Umi.
      // UI layers should call `getUploadPriceAr(bytes)` from nativeClient
      // to display the real AR cost before upload.
      return createAmount(0, "SOL", 9);
    },
  };
}

/** Umi plugin form: `umi.use(arweaveUploader())`. */
export function arweaveUploader(): UmiPlugin {
  return {
    install(umi) {
      umi.uploader = createArweaveUploader();
    },
  };
}
