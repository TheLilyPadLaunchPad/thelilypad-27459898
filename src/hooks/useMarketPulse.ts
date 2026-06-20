import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MarketPulseChain = "solana" | "monad";

export interface MarketPulseRow {
  rank: number;
  chain: MarketPulseChain;
  name: string;
  image: string | null;
  symbol: string | null;
  slug: string | null;
  floor: number | null;
  currency: string;
  volume24h: number | null;
  volumeTotal: number | null;
  listed: number | null;
  marketplace: string;
  url: string | null;
}

export function useMarketPulse(chain: MarketPulseChain, limit = 20) {
  return useQuery({
    queryKey: ["market-pulse", chain, limit],
    queryFn: async (): Promise<MarketPulseRow[]> => {
      const { data, error } = await supabase.functions.invoke("market-pulse", {
        body: null,
        method: "GET" as any,
        // supabase-js doesn't support query params on invoke; use direct fetch
      } as any);
      // Fallback: direct fetch with query params (invoke does not pass them)
      if (error || !data) {
        const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
        const url = `https://${projectId}.supabase.co/functions/v1/market-pulse?chain=${chain}&limit=${limit}`;
        const res = await fetch(url, {
          headers: {
            apikey:
              (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
          },
        });
        if (!res.ok) throw new Error(`market-pulse ${res.status}`);
        const json = await res.json();
        return (json?.rows ?? []) as MarketPulseRow[];
      }
      return (data?.rows ?? []) as MarketPulseRow[];
    },
    staleTime: 4 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
