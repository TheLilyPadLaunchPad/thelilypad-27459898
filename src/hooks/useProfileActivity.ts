import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ActivityKind = "follow" | "tip" | "mint" | "sale";
export type ActivityFilter = "all" | "followers" | "tips" | "mints" | "sales";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  actor_id: string | null;
  actor_address: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
  target_id: string | null;
  target_label: string | null;
  target_image: string | null;
  amount: number | null;
  message: string | null;
  created_at: string;
}

const PAGE = 30;

export function useProfileActivity(
  targetUserId: string | null | undefined,
  filter: ActivityFilter = "all"
) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const fetchPage = useCallback(
    async (before?: string) => {
      if (!targetUserId) return [];
      const { data, error } = await supabase.rpc("get_profile_activity_feed", {
        target_user_id: targetUserId,
        filter: filterRef.current,
        limit_count: PAGE,
        before_ts: before ?? null,
      });
      if (error) {
        console.error("[useProfileActivity] error", error);
        return [];
      }
      return (data as ActivityItem[]) || [];
    },
    [targetUserId]
  );

  // Initial / filter change reload
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHasMore(true);
    fetchPage().then((rows) => {
      if (cancelled) return;
      setItems(rows);
      setHasMore(rows.length === PAGE);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, filter]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || items.length === 0) return;
    setLoadingMore(true);
    const last = items[items.length - 1];
    const rows = await fetchPage(last.created_at);
    setItems((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE);
    setLoadingMore(false);
  }, [loadingMore, hasMore, items, fetchPage]);

  // Realtime: prepend new activity (refetch top page on any relevant change)
  useEffect(() => {
    if (!targetUserId) return;
    let timer: any;
    const refreshTop = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const rows = await fetchPage();
        setItems((prev) => {
          const existing = new Set(prev.map((p) => p.id));
          const fresh = rows.filter((r) => !existing.has(r.id));
          return [...fresh, ...prev];
        });
      }, 600);
    };

    const channel = supabase
      .channel(`activity:${targetUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "followers", filter: `streamer_id=eq.${targetUserId}` },
        refreshTop
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "earnings", filter: `user_id=eq.${targetUserId}` },
        refreshTop
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "minted_nfts" },
        refreshTop
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "nft_listings" },
        refreshTop
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [targetUserId, fetchPage]);

  return { items, loading, hasMore, loadingMore, loadMore };
}
