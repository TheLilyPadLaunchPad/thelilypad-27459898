import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CollectionPack {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    category: string;
    tier: string;
    price_mon: number;
    price_sol: number | null;
    currency: string | null;
    total_sales: number;
    required_collection_id: string | null;
}

/** Price a pack in its own currency, falling back to the legacy `price_mon` column. */
export function packPrice(pack: CollectionPack): { amount: number; currency: string } {
    const currency = (pack.currency || "SOL").toUpperCase();
    const amount =
        currency === "SOL"
            ? Number(pack.price_sol ?? 0) || Number(pack.price_mon ?? 0)
            : Number(pack.price_mon ?? 0);
    return { amount, currency };
}

async function fetchCollectionPacks(collectionId: string): Promise<CollectionPack[]> {
    const { data, error } = await supabase
        .from("shop_items")
        .select(
            "id, name, description, image_url, category, tier, price_mon, price_sol, currency, total_sales, required_collection_id"
        )
        .eq("collection_id", collectionId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(24);

    if (error) throw error;
    return (data ?? []) as unknown as CollectionPack[];
}

/** Packs (stickers / emotes / emojis) attached to a launch collection. */
export function useCollectionPacks(collectionId?: string | null) {
    return useQuery({
        queryKey: ["collection-packs", collectionId],
        queryFn: () => fetchCollectionPacks(collectionId as string),
        enabled: !!collectionId,
        staleTime: 60_000,
    });
}
