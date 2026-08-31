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
    };
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
        chain
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
