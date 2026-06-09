import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CollectionSupporter {
  supporter_user_id: string | null;
  wallet_address: string | null;
  display_name: string | null;
  avatar_url: string | null;
  nfts_owned: number;
  total_spend_sol: number;
}

export function useCollectionSupporters(collectionId: string | null | undefined, limit = 50) {
  const [supporters, setSupporters] = useState<CollectionSupporter[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!collectionId) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_collection_supporters", {
      collection_id: collectionId,
      limit_count: limit,
    });
    if (!error && data) {
      setSupporters(
        (data as any[]).map((r) => ({
          ...r,
          nfts_owned: Number(r.nfts_owned),
          total_spend_sol: Number(r.total_spend_sol),
        })) as CollectionSupporter[]
      );
    }
    setLoading(false);
  }, [collectionId, limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!collectionId) return;
    const channel = supabase
      .channel(`col-supporters:${collectionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "minted_nfts", filter: `collection_id=eq.${collectionId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [collectionId, refresh]);

  return { supporters, loading, refresh };
}
