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

async function fetchSolana(limit: number): Promise<Row[]> {
  // Magic Eden public popular collections endpoint
  const url = `https://api-mainnet.magiceden.dev/v2/marketplace/popular_collections?timeRange=1d&limit=${limit}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`magiceden solana ${res.status}`);
  const data = await res.json();
  const items: any[] = Array.isArray(data) ? data : data?.collections ?? [];
  return items.slice(0, limit).map((c, i) => ({
    rank: i + 1,
    chain: "solana",
    name: c.name ?? c.symbol ?? c.collectionSymbol ?? "Unknown",
    image: c.image ?? c.img ?? null,
    symbol: c.symbol ?? c.collectionSymbol ?? null,
    slug: c.symbol ?? c.collectionSymbol ?? null,
    floor: typeof c.floorPrice === "number" ? c.floorPrice / 1e9 : null,
    currency: "SOL",
    volume24h:
      typeof c.volume24hr === "number"
        ? c.volume24hr / 1e9
        : typeof c.volume === "number"
        ? c.volume / 1e9
        : null,
    volumeTotal:
      typeof c.volumeAll === "number" ? c.volumeAll / 1e9 : null,
    listed: c.listedCount ?? null,
    marketplace: "Magic Eden",
    url: c.symbol
      ? `https://magiceden.io/marketplace/${c.symbol}`
      : null,
  }));
}

async function fetchEthereum(limit: number): Promise<Row[]> {
  // Reservoir free public endpoint (no key for basic usage; may rate-limit)
  const url = `https://api.reservoir.tools/collections/v7?limit=${Math.min(
    limit,
    20,
  )}&sortBy=24DayVolume`;
  const res = await fetch(url, { headers: { accept: "*/*" } });
  if (!res.ok) throw new Error(`reservoir ${res.status}`);
  const data = await res.json();
  const items: any[] = data?.collections ?? [];
  return items.slice(0, limit).map((c, i) => ({
    rank: i + 1,
    chain: "ethereum",
    name: c.name ?? "Unknown",
    image: c.image ?? null,
    symbol: c.symbol ?? null,
    slug: c.slug ?? null,
    floor: c.floorAsk?.price?.amount?.native ?? null,
    currency: "ETH",
    volume24h: c.volume?.["1day"] ?? null,
    volumeTotal: c.volume?.allTime ?? null,
    listed: c.onSaleCount ? Number(c.onSaleCount) : null,
    marketplace: "Reservoir / OpenSea",
    url: c.slug ? `https://opensea.io/collection/${c.slug}` : null,
  }));
}

async function fetchMonad(limit: number): Promise<Row[]> {
  // Magic Eden Monad collection stats — fall back gracefully
  try {
    const url = `https://api-mainnet.magiceden.dev/v3/rtp/monad/collections/v7?limit=${Math.min(
      limit,
      20,
    )}&sortBy=1DayVolume`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`me monad ${res.status}`);
    const data = await res.json();
    const items: any[] = data?.collections ?? [];
    return items.slice(0, limit).map((c, i) => ({
      rank: i + 1,
      chain: "monad",
      name: c.name ?? "Unknown",
      image: c.image ?? null,
      symbol: c.symbol ?? null,
      slug: c.slug ?? c.id ?? null,
      floor: c.floorAsk?.price?.amount?.native ?? null,
      currency: "MON",
      volume24h: c.volume?.["1day"] ?? null,
      volumeTotal: c.volume?.allTime ?? null,
      listed: c.onSaleCount ? Number(c.onSaleCount) : null,
      marketplace: "Magic Eden",
      url: c.slug ? `https://magiceden.io/collections/monad/${c.slug}` : null,
    }));
  } catch {
    return [];
  }
}

const fetchers: Record<Chain, (n: number) => Promise<Row[]>> = {
  solana: fetchSolana,
  ethereum: fetchEthereum,
  monad: fetchMonad,
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
    try {
      rows = await fetchers[chain](limit);
    } catch (e) {
      // Serve stale cache if upstream fails
      if (cached) {
        return new Response(
          JSON.stringify({
            chain,
            rows: cached.payload,
            fetched_at: cached.fetched_at,
            cached: true,
            stale: true,
            error: String(e),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw e;
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
