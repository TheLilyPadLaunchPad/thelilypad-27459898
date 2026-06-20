// Market Pulse: aggregate top NFT collections from external marketplaces
// Sources: Magic Eden (Solana + Monad)
// 5-minute cache per chain in public.market_pulse_cache
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Chain = "solana" | "monad";


interface Row {
  rank: number;
  chain: Chain;
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

const CACHE_TTL_MS = 5 * 60 * 1000;

// Solana: Magic Eden v2 popular_collections (public, no key).
// Ethereum/Monad: public RTP/Reservoir endpoints are blocked in this runtime,
// so we return [] gracefully until an API key is wired up.
async function fetchSolana(limit: number): Promise<Row[]> {
  // limit must be 50 or 100 per ME docs; we fetch 50 and slice client-side.
  const url = `https://api-mainnet.magiceden.dev/v2/marketplace/popular_collections?timeRange=1d&limit=50`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`magiceden solana ${res.status}`);
  const data = await res.json();
  const items: any[] = Array.isArray(data) ? data : data?.collections ?? [];
  return items.slice(0, limit).map((c, i) => ({
    rank: i + 1,
    chain: "solana",
    name: c.name ?? c.symbol ?? "Unknown",
    image: c.image ?? null,
    symbol: c.symbol ?? null,
    slug: c.symbol ?? null,
    // floorPrice is in lamports; volumeAll is already in SOL.
    floor: typeof c.floorPrice === "number" ? c.floorPrice / 1e9 : null,
    currency: "SOL",
    volume24h:
      typeof c.volume24hr === "number"
        ? c.volume24hr
        : typeof c.volume === "number"
        ? c.volume
        : null,
    volumeTotal: typeof c.volumeAll === "number" ? c.volumeAll : null,
    listed: c.listedCount ?? null,
    marketplace: "Magic Eden",
    url: c.symbol ? `https://magiceden.io/marketplace/${c.symbol}` : null,
  }));
}

async function fetchEmpty(_limit: number): Promise<Row[]> {
  // Upstream API not reachable from this edge runtime without an API key.
  return [];
}

const fetchers: Record<Chain, (n: number) => Promise<Row[]>> = {
  solana: fetchSolana,
  monad: fetchEmpty,
};




Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const chainParam = (url.searchParams.get("chain") ?? "solana").toLowerCase();
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
      30,
    );

    if (!["solana", "monad"].includes(chainParam)) {
      return new Response(
        JSON.stringify({ error: "invalid chain" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const chain = chainParam as Chain;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Cache check
    const { data: cached } = await supabase
      .from("market_pulse_cache")
      .select("payload, fetched_at")
      .eq("chain", chain)
      .maybeSingle();

    const fresh =
      cached &&
      Date.now() - new Date(cached.fetched_at as string).getTime() <
        CACHE_TTL_MS;

    if (fresh) {
      return new Response(
        JSON.stringify({
          chain,
          rows: cached.payload,
          fetched_at: cached.fetched_at,
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let rows: Row[] = [];
    let upstreamError: string | null = null;
    try {
      rows = await fetchers[chain](limit);
    } catch (e) {
      upstreamError = String((e as Error)?.message ?? e);
      // Serve stale cache if upstream fails
      if (cached) {
        return new Response(
          JSON.stringify({
            chain,
            rows: cached.payload,
            fetched_at: cached.fetched_at,
            cached: true,
            stale: true,
            error: upstreamError,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // No cache + upstream down: return empty rows with 200 so UI doesn't blank
      return new Response(
        JSON.stringify({
          chain,
          rows: [],
          fetched_at: new Date().toISOString(),
          cached: false,
          error: upstreamError,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    await supabase
      .from("market_pulse_cache")
      .upsert(
        { chain, payload: rows, fetched_at: new Date().toISOString() },
        { onConflict: "chain" },
      );

    return new Response(
      JSON.stringify({
        chain,
        rows,
        fetched_at: new Date().toISOString(),
        cached: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e?.message ?? e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
