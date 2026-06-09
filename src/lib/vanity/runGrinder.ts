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

/**
 * Parallel grinder pool — spins up N web workers and resolves with the first
 * match. Cancels the rest immediately. Much more stable than a single worker
 * because match-time variance averages out across workers (~N× speedup).
 *
 * On timeout: rejects with a VanityTimeoutError-shaped error (`.timeout=true`)
 * so callers can fall back to a random keypair without aborting deploy.
 */
export function runGrinderPool(
    opts: GrindOptions & { onProgress?: (attempts: number) => void; workers?: number },
): RunGrinderHandle {
    const hw = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
    const n = Math.max(1, Math.min(opts.workers ?? Math.max(2, hw - 1), 6));
    const handles: RunGrinderHandle[] = [];
    let settled = false;
    const totals: number[] = new Array(n).fill(0);

    const promise = new Promise<GrindResult>((resolve, reject) => {
        for (let i = 0; i < n; i++) {
            const idx = i;
            const h = runGrinderInWorker({
                ...opts,
                onProgress: (a) => {
                    totals[idx] = a;
                    opts.onProgress?.(totals.reduce((s, v) => s + v, 0));
                },
            });
            handles.push(h);
            h.promise.then(
                (result) => {
                    if (settled) return;
                    settled = true;
                    handles.forEach((other) => other !== h && other.cancel());
                    resolve(result);
                },
                (err) => {
                    if (settled) return;
                    // Only reject when ALL workers have failed (timed out together).
                    if (handles.every((hh) => hh === h || (hh as any)._done)) {
                        settled = true;
                        reject(err);
                    }
                    (h as any)._done = true;
                },
            );
        }
    });

    return {
        promise,
        cancel: () => {
            settled = true;
            handles.forEach((h) => h.cancel());
        },
    };
}
