/**
 * Dynamic priority fee helper.
 *
 * Replaces hardcoded microLamports values with a value derived from the
 * current network's `getRecentPrioritizationFees` 75th percentile.
 *
 * Falls back to a sensible static value if the RPC method is unavailable or
 * fails. Result is cached briefly to avoid hammering the RPC during a single
 * deploy flow.
 */

import type { Umi } from '@metaplex-foundation/umi';

export type PriorityTier = 'low' | 'normal' | 'high';

const FALLBACK: Record<PriorityTier, number> = {
    low: 25_000,
    normal: 75_000,
    high: 200_000,
};

const CAP: Record<PriorityTier, number> = {
    low: 100_000,
    normal: 500_000,
    high: 2_000_000,
};

interface CacheEntry {
    value: number;
    expiresAt: number;
}
const cache = new Map<PriorityTier, CacheEntry>();
const TTL_MS = 15_000;

function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
    return sorted[idx];
}

/**
 * Returns a microLamports value suitable for `setComputeUnitPrice`.
 * Tier multipliers on top of the network 75th percentile:
 *   low    × 1.0
 *   normal × 2.0
 *   high   × 4.0
 */
export async function getDynamicPriorityFee(
    umi: Umi,
    tier: PriorityTier = 'normal',
): Promise<number> {
    const cached = cache.get(tier);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;

    let value = FALLBACK[tier];
    try {
        const endpoint = (umi.rpc as any).getEndpoint?.() as string | undefined;
        if (endpoint) {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'priority-fee',
                    method: 'getRecentPrioritizationFees',
                    params: [],
                }),
            });
            const json = await res.json();
            const fees: number[] = Array.isArray(json?.result)
                ? json.result.map((r: any) => Number(r?.prioritizationFee) || 0).filter((n: number) => n > 0)
                : [];
            if (fees.length > 0) {
                const p75 = percentile(fees, 0.75);
                const mult = tier === 'low' ? 1 : tier === 'normal' ? 2 : 4;
                value = Math.max(FALLBACK[tier], Math.min(CAP[tier], Math.round(p75 * mult)));
            }
        }
    } catch (e) {
        console.warn('[priorityFee] dynamic lookup failed, using fallback', e);
    }

    cache.set(tier, { value, expiresAt: now + TTL_MS });
    return value;
}
