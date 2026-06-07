// Fetches Solana NFT collection floor + 24h volume.
// Strategy: Magic Eden public API (no key required).
//   1) For each mint -> /v2/tokens/{mint} -> read `collection` (symbol)
//   2) For each unique symbol -> /v2/collections/{symbol}/stats
// In-memory cache per cold start to avoid re-hitting ME for the same mint/symbol.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StatItem {
  /** asset mint OR collection address used as the lookup key by the caller */
  key: string;
  collectionSymbol: string | null;
  floorPrice: number | null; // in SOL
  volume24h: number | null;  // in SOL
  listedCount: number | null;
  source: "magiceden" | "none";
}

const ME = "https://api-mainnet.magiceden.dev/v2";
const tokenCache = new Map<string, string | null>();   // mint -> symbol
const statsCache = new Map<string, { floor: number | null; vol: number | null; listed: number | null; at: number }>();
const TTL_MS = 5 * 60_000;

async function fetchSymbolForMint(mint: string): Promise<string | null> {
  if (tokenCache.has(mint)) return tokenCache.get(mint)!;
  try {
    const r = await fetch(`${ME}/tokens/${mint}`);
    if (!r.ok) { tokenCache.set(mint, null); return null; }
    const j = await r.json();
    const sym = j?.collection ?? null;
    tokenCache.set(mint, sym);
    return sym;
  } catch {
    tokenCache.set(mint, null);
    return null;
  }
}

async function fetchStatsForSymbol(symbol: string) {
  const cached = statsCache.get(symbol);
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  try {
    const r = await fetch(`${ME}/collections/${encodeURIComponent(symbol)}/stats`);
    if (!r.ok) {
      const empty = { floor: null, vol: null, listed: null, at: Date.now() };
      statsCache.set(symbol, empty);
      return empty;
    }
    const j = await r.json();
    // ME returns lamports for floorPrice/volumeAll; volume24hr is also in lamports
    const lamportsToSol = (n: any) =>
      typeof n === "number" && isFinite(n) ? n / 1_000_000_000 : null;
    const entry = {
      floor: lamportsToSol(j?.floorPrice),
      vol: lamportsToSol(j?.volume24hr),
      listed: typeof j?.listedCount === "number" ? j.listedCount : null,
      at: Date.now(),
    };
    statsCache.set(symbol, entry);
    return entry;
  } catch {
    const empty = { floor: null, vol: null, listed: null, at: Date.now() };
    statsCache.set(symbol, empty);
    return empty;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth guard
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Auth required" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user } } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { mints } = await req.json() as { mints: string[] };
    if (!Array.isArray(mints) || mints.length === 0) {
      return new Response(JSON.stringify({ stats: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const unique = [...new Set(mints.filter(Boolean))].slice(0, 25);

    const results: StatItem[] = [];
    for (const mint of unique) {
      const symbol = await fetchSymbolForMint(mint);
      if (!symbol) {
        results.push({ key: mint, collectionSymbol: null, floorPrice: null, volume24h: null, listedCount: null, source: "none" });
        continue;
      }
      const s = await fetchStatsForSymbol(symbol);
      results.push({
        key: mint,
        collectionSymbol: symbol,
        floorPrice: s.floor,
        volume24h: s.vol,
        listedCount: s.listed,
        source: s.floor != null || s.vol != null ? "magiceden" : "none",
      });
      await new Promise(r => setTimeout(r, 80)); // gentle pacing
    }

    return new Response(JSON.stringify({ stats: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
