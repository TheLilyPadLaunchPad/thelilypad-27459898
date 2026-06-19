import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CollectionBuybackContribution {
  id: string;
  collection_id: string;
  program_id: string | null;
  event_id: string | null;
  chain: string;
  mint_revenue_sol: number;
  contribution_pct: number;
  contribution_sol: number;
  tx_signature: string | null;
  status: "pending" | "transferred" | "queued" | "failed";
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface CollectionBuybackSummary {
  enabled: boolean;
  contributionPct: number | null;
  totalContributedSol: number;
  contributions: CollectionBuybackContribution[];
  loading: boolean;
}

/**
 * Reads a collection's buyback opt-in settings + ledger of contributions
 * routed into the platform buyback pool when the collection mints out.
 */
export function useCollectionBuyback(collectionId?: string): CollectionBuybackSummary {
  const [state, setState] = useState<CollectionBuybackSummary>({
    enabled: false,
    contributionPct: null,
    totalContributedSol: 0,
    contributions: [],
    loading: true,
  });

  useEffect(() => {
    if (!collectionId) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;

    (async () => {
      const [{ data: col }, { data: rows }] = await Promise.all([
        supabase
          .from("collections")
          .select("buyback_enabled, buyback_contribution_pct")
          .eq("id", collectionId)
          .maybeSingle(),
        supabase
          .from("collection_buyback_contributions" as any)
          .select("*")
          .eq("collection_id", collectionId)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;
      const contributions = (rows ?? []) as unknown as CollectionBuybackContribution[];
      const total = contributions.reduce(
        (sum, r) => sum + (Number(r.contribution_sol) || 0),
        0
      );
      setState({
        enabled: !!(col as any)?.buyback_enabled,
        contributionPct: (col as any)?.buyback_contribution_pct ?? null,
        totalContributedSol: total,
        contributions,
        loading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  return state;
}
