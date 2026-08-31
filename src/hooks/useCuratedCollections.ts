import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FeatureRail } from "@/config/curation";

export interface CuratedCollection {
    id: string;
    collection_id: string;
    display_order: number;
    collection: {
        id: string;
        name: string;
        symbol: string | null;
        image_url: string | null;
        creator_address: string | null;
        status: string;
        minted: number;
        total_supply: number;
        chain: string | null;
        phases: unknown;
    };
}

/** Lowest configured phase price for a collection, or null when unpriced. */
export function collectionMintPrice(phases: unknown): number | null {
    if (!Array.isArray(phases)) return null;
    const prices = phases
        .map((p) => Number((p as { price?: unknown } | null)?.price))
        .filter((n) => Number.isFinite(n) && n >= 0);
    if (prices.length === 0) return null;
    return Math.min(...prices);
}


async function fetchCurated(rail: FeatureRail): Promise<CuratedCollection[]> {
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
        .from("featured_collections")
        .select(`
      id,
      collection_id,
      display_order,
      collection:collections (
        id,
        name,
        symbol,
        image_url,
        creator_address,
        status,
        minted,
        total_supply,
        chain,
        phases

      )
    `)
        .eq("feature_type", rail)
        .eq("is_active", true)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("display_order", { ascending: true })
        .limit(24);

    if (error) throw error;

    return ((data ?? []) as unknown as CuratedCollection[]).filter((r) => !!r.collection);
}

export function useCuratedCollections(rail: FeatureRail) {
    return useQuery({
        queryKey: ["curated-collections", rail],
        queryFn: () => fetchCurated(rail),
        staleTime: 60_000,
    });
}
