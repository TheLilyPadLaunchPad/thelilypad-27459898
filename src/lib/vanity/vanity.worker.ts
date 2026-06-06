/// <reference lib="webworker" />
/**
 * Web Worker host for the vanity keypair grinder.
 *
 * Usage from the main thread:
 *   const worker = new Worker(new URL("@/lib/vanity/vanity.worker.ts", import.meta.url), { type: "module" });
 *   worker.postMessage({ match: "L3AP", position: "suffix", timeoutMs: 60000 });
 *   worker.onmessage = (e) => { ... e.data is GrindWorkerMessage ... };
 */
import { grindKeypairSync, VanityTimeoutError, type GrindOptions, type GrindResult } from "./grindKeypair";

export type GrindWorkerMessage =
    | { type: "progress"; attempts: number }
    | { type: "done"; result: GrindResult }
    | { type: "error"; message: string; timeout?: boolean };

self.onmessage = (e: MessageEvent<GrindOptions>) => {
    const opts = e.data;
    try {
        const result = grindKeypairSync({
            ...opts,
            onProgress: (attempts) => {
                (self as any).postMessage({ type: "progress", attempts } satisfies GrindWorkerMessage);
            },
        });
        (self as any).postMessage({ type: "done", result } satisfies GrindWorkerMessage);
    } catch (err: any) {
        (self as any).postMessage({
            type: "error",
            message: err?.message || String(err),
            timeout: err instanceof VanityTimeoutError,
        } satisfies GrindWorkerMessage);
    }
};

export {}; // module
