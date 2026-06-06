/**
 * Vanity Keypair Grinder
 *
 * Generates Solana keypairs whose base58 public key starts (prefix) or ends
 * (suffix) with a given brand string — e.g. addresses ending in "L3AP".
 *
 * The base58 alphabet excludes the characters 0, O, I, and l, so any `match`
 * containing those will never resolve. We validate up front.
 *
 * Expected cost: ~58^len attempts. "L3AP" = ~11.3M attempts (≈ tens of seconds
 * in a worker on a modern laptop).
 */
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export interface GrindOptions {
    match: string;
    position: "prefix" | "suffix";
    /** Case-sensitive comparison. Defaults to true (base58 is case-sensitive). */
    caseSensitive?: boolean;
    /** Hard timeout in ms. 0 = no timeout. Defaults to 60_000. */
    timeoutMs?: number;
    /** Reports attempt count every ~`progressEvery` iterations. */
    onProgress?: (attempts: number) => void;
    progressEvery?: number;
    /** Optional abort signal to cancel mid-grind. */
    signal?: AbortSignal;
}

export interface GrindResult {
    /** Base58 public key (the on-chain address). */
    publicKey: string;
    /** Base58-encoded 64-byte secret key. Keep secret! */
    secretKey: string;
    attempts: number;
    elapsedMs: number;
}

export function assertValidMatch(match: string) {
    if (!match) throw new Error("match cannot be empty");
    for (const ch of match) {
        if (!BASE58_ALPHABET.includes(ch)) {
            throw new Error(
                `"${ch}" is not in the base58 alphabet (0, O, I, l are excluded). Choose a different brand.`,
            );
        }
    }
}

/**
 * Synchronous grinder — blocks the calling thread. Use inside a Web Worker or
 * a Node script. The browser UI thread should not call this directly.
 */
export function grindKeypairSync(opts: GrindOptions): GrindResult {
    assertValidMatch(opts.match);
    const target = opts.caseSensitive === false ? opts.match.toLowerCase() : opts.match;
    const cs = opts.caseSensitive !== false;
    const position = opts.position;
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const progressEvery = opts.progressEvery ?? 50_000;
    const start = Date.now();

    let attempts = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        attempts++;
        const kp = Keypair.generate();
        const addr = kp.publicKey.toBase58();
        const cmp = cs ? addr : addr.toLowerCase();
        const ok = position === "prefix"
            ? cmp.startsWith(target)
            : cmp.endsWith(target);
        if (ok) {
            return {
                publicKey: addr,
                secretKey: bs58.encode(kp.secretKey),
                attempts,
                elapsedMs: Date.now() - start,
            };
        }
        if (attempts % progressEvery === 0) {
            opts.onProgress?.(attempts);
            if (opts.signal?.aborted) throw new Error("aborted");
            if (timeoutMs > 0 && Date.now() - start > timeoutMs) {
                throw new VanityTimeoutError(attempts, Date.now() - start);
            }
        }
    }
}

export class VanityTimeoutError extends Error {
    constructor(public attempts: number, public elapsedMs: number) {
        super(`Vanity grind timed out after ${attempts.toLocaleString()} attempts (${elapsedMs}ms)`);
        this.name = "VanityTimeoutError";
    }
}
