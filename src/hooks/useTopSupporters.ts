import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TopSupporter {
  supporter_user_id: string | null;
  wallet_address: string | null;
  display_name: string | null;
  avatar_url: string | null;
  tips_sol: number;
  nft_spend_sol: number;
  total_score: number;
  tier: "platinum" | "gold" | "silver" | "bronze" | "supporter";
}

export function useTopSupporters(targetUserId: string | null | undefined, limit = 10) {
  const [supporters, setSupporters] = useState<TopSupporter[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!targetUserId) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_top_supporters", {
      target_user_id: targetUserId,
      limit_count: limit,
    });
    if (!error && data) {
      setSupporters(
        (data as any[]).map((r) => ({
          ...r,
          tips_sol: Number(r.tips_sol),
          nft_spend_sol: Number(r.nft_spend_sol),
          total_score: Number(r.total_score),
        })) as TopSupporter[]
      );
    }
    setLoading(false);
  }, [targetUserId, limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!targetUserId) return;
    const channel = supabase
      .channel(`supporters:${targetUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "earnings", filter: `user_id=eq.${targetUserId}` },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "nft_listings" },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetUserId, refresh]);

  return { supporters, loading, refresh };
}
