import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HELIUS_BASE = "https://api.helius.xyz";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require Supabase anon apikey/bearer so this isn't open to the world.
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const apikeyHeader = req.headers.get("apikey") || "";
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const hasValidKey =
    !!anonKey && (apikeyHeader === anonKey || bearer === anonKey);
  if (!hasValidKey) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const heliusKey = Deno.env.get("HELIUS_API_KEY");
  if (!heliusKey) {
    return new Response(
      JSON.stringify({ error: "HELIUS_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const url = new URL(req.url);
    // Action is encoded as a query param so we don't depend on function path routing.
    // - action=address-history & address=<addr>  -> GET /v0/addresses/:addr/transactions
    // - action=parse-transactions                -> POST /v0/transactions (body forwarded)
    const action = url.searchParams.get("action");

    if (action === "address-history") {
      const address = url.searchParams.get("address");
      if (!address) {
        return new Response(
          JSON.stringify({ error: "Missing address" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const target = `${HELIUS_BASE}/v0/addresses/${encodeURIComponent(address)}/transactions?api-key=${heliusKey}`;
      const r = await fetch(target);
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "parse-transactions") {
      const body = await req.text();
      const target = `${HELIUS_BASE}/v0/transactions?api-key=${heliusKey}`;
      const r = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("helius-proxy error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Proxy error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
