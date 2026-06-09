/**
 * Post-deploy verification for Metaplex Core collections.
 *
 * After a backend deploy returns a collection address, the on-chain
 * `CollectionV1` account can take a few seconds to propagate to public RPCs
 * (or, in failure modes, may never have been created at all). This helper
 * polls `fetchCollection` against the network the deploy targeted and
 * resolves true only when the account is found.
 */

import { publicKey } from '@metaplex-foundation/umi';
import { fetchCollection } from '@metaplex-foundation/mpl-core';
import { initializeUmi, NetworkType } from '@/config/solana';

export interface VerifyCoreCollectionOptions {
    /** Total attempts (default 8) */
    attempts?: number;
    /** Delay between attempts in ms (default 2000) */
    delayMs?: number;
}

export interface VerifyCoreCollectionResult {
    exists: boolean;
    attempts: number;
    error?: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function verifyCoreCollection(
    address: string,
    network: NetworkType,
    opts: VerifyCoreCollectionOptions = {}
): Promise<VerifyCoreCollectionResult> {
    const attempts = opts.attempts ?? 8;
    const delayMs = opts.delayMs ?? 2000;

    const umi = initializeUmi(network);
    let lastErr: string | undefined;

    for (let i = 1; i <= attempts; i++) {
        try {
            await fetchCollection(umi, publicKey(address));
            return { exists: true, attempts: i };
        } catch (e: any) {
            lastErr = e?.message || String(e);
            // Only retry for "not found" style errors; other errors are RPC issues we also retry.
            if (i < attempts) await sleep(delayMs);
        }
    }

    return { exists: false, attempts, error: lastErr };
}

/**
 * Translate Metaplex/Umi "account not found" errors into something a user can act on.
 * Returns a friendly message when the error is recognized, otherwise returns null.
 */
export function friendlyCollectionFetchError(err: any): string | null {
    const msg = err?.message || String(err ?? '');
    if (/account of type \[?CollectionV1\]?\s+was not found/i.test(msg) ||
        /account.*not found at the provided address/i.test(msg)) {
        return "This collection isn't available on-chain. It may still be propagating across RPC nodes (try again in a minute), or the deploy did not complete. If the problem persists, contact the creator or an admin to repair the collection.";
    }
    return null;
}
