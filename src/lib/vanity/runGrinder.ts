/**
 * Browser-side helper that spins up the vanity Web Worker and returns a
 * promise + progress stream. Falls back to a synchronous in-thread grind if
 * Web Workers aren't supported (rare).
 */
import type { GrindOptions, GrindResult } from "./grindKeypair";
import type { GrindWorkerMessage } from "./vanity.worker";

export interface RunGrinderHandle {
    promise: Promise<GrindResult>;
    cancel: () => void;
}

export function runGrinderInWorker(
    opts: GrindOptions & { onProgress?: (attempts: number) => void },
): RunGrinderHandle {
    const worker = new Worker(
        new URL("./vanity.worker.ts", import.meta.url),
        { type: "module" },
    );

    let cancelled = false;

    const promise = new Promise<GrindResult>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<GrindWorkerMessage>) => {
            const msg = e.data;
            if (msg.type === "progress") {
                opts.onProgress?.(msg.attempts);
            } else if (msg.type === "done") {
                worker.terminate();
                resolve(msg.result);
            } else if (msg.type === "error") {
                worker.terminate();
                const err = new Error(msg.message);
                (err as any).timeout = !!msg.timeout;
                reject(err);
            }
        };
        worker.onerror = (e) => {
            worker.terminate();
            reject(new Error(e.message || "vanity worker crashed"));
        };
    });

    // Strip non-cloneable callback before posting.
    const { onProgress: _omit, signal: _signal, ...postable } = opts;
    worker.postMessage(postable);

    return {
        promise,
        cancel: () => {
            if (cancelled) return;
            cancelled = true;
            worker.terminate();
        },
    };
}
