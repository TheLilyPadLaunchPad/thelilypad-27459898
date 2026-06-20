// Market Pulse: aggregate top NFT collections from external marketplaces
// Sources: Magic Eden (Solana + Monad), Reservoir (Ethereum)
// 5-minute cache per chain in public.market_pulse_cache
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Chain = "solana" | "ethereum" | "monad";

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

// Magic Eden RTP v3 covers solana / ethereum / monad with one schema.
const ME_CHAIN_PATH: Record<Chain, string> = {
  solana: "solana",
  ethereum: "ethereum",
  monad: "monad",
};

const CURRENCY: Record<Chain, string> = {
  solana: "SOL",
  ethereum: "ETH",
  monad: "MON",
};

const COLLECTION_URL: Record<Chain, (slug: string) => string> = {
  solana: (s) => `https://magiceden.io/marketplace/${s}`,
  ethereum: (s) => `https://magiceden.io/collections/ethereum/${s}`,
  monad: (s) => `https://magiceden.io/collections/monad/${s}`,
};

async function fetchFromMagicEden(chain: Chain, limit: number): Promise<Row[]> {
  const url = `https://api-mainnet.magiceden.dev/v3/rtp/${ME_CHAIN_PATH[chain]}/collections/v7?limit=${Math.min(
    limit,
    20,
  )}&sortBy=1DayVolume`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`magiceden ${chain} ${res.status}`);
  const data = await res.json();
  const items: any[] = data?.collections ?? [];
  return items.slice(0, limit).map((c, i) => {
    const slug = c.slug ?? c.id ?? c.symbol ?? null;
    return {
      rank: i + 1,
      chain,
      name: c.name ?? "Unknown",
      image: c.image ?? c.imageUrl ?? null,
      symbol: c.symbol ?? null,
      slug,
      floor: c.floorAsk?.price?.amount?.native ?? null,
      currency: CURRENCY[chain],
      volume24h: c.volume?.["1day"] ?? null,
      volumeTotal: c.volume?.allTime ?? null,
      listed: c.onSaleCount ? Number(c.onSaleCount) : null,
      marketplace: "Magic Eden",
      url: slug ? COLLECTION_URL[chain](slug) : null,
    };
  });
}

const fetchers: Record<Chain, (n: number) => Promise<Row[]>> = {
  solana: (n) => fetchFromMagicEden("solana", n),
  ethereum: (n) => fetchFromMagicEden("ethereum", n),
  monad: (n) => fetchFromMagicEden("monad", n),
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

    if (!["solana", "ethereum", "monad"].includes(chainParam)) {
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
