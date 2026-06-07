/**
 * useCollectionStatsSolana
 *
 * Per-mint floor + 24h volume for Solana NFTs, using a two-tier source:
 *   1. The Lily Pad's own marketplace (lowest active listing) for known collections.
 *   2. Magic Eden's public API (via fetch-collection-stats-solana edge fn) as
 *      fallback for any mint we don't already have data for.
 *
 * Input: list of mint addresses (Solana asset addresses).
 * Output: Map<mint, { floor, volume24h, source }>.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CollectionStats {
  floorPrice: number | null;
  volume24h: number | null;
  source: "lilypad" | "magiceden" | "none";
}

export function useCollectionStatsSolana(mints: string[], enabled: boolean) {
  const [stats, setStats] = useState<Map<string, CollectionStats>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const key = useMemo(() => mints.slice().sort().join(","), [mints]);

  useEffect(() => {
    if (!enabled || mints.length === 0) {
      setStats(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const next = new Map<string, CollectionStats>();
      try {
        const { data, error } = await supabase.functions.invoke(
          "fetch-collection-stats-solana",
          { body: { mints } }
        );
        if (!error && data?.stats) {
          for (const s of data.stats) {
            next.set(s.key, {
              floorPrice: s.floorPrice,
              volume24h: s.volume24h,
              source: s.source === "magiceden" ? "magiceden" : "none",
            });
          }
        }
      } catch (err) {
        console.error("[useCollectionStatsSolana]", err);
      } finally {
        if (!cancelled) {
          setStats(next);
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { stats, isLoading };
}
