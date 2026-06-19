// Collection Sellout Buyback
//
// Triggered (manually for v1) when a collection mints out. Calculates the
// configured contribution from mint revenue, logs it to
// `collection_buyback_contributions`, and enqueues a buyback event for
// the existing Solana buyback program/scheduler to execute via Jupiter.
//
// Idempotent: if a row already exists for this collection it returns it.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BodySchema = z.object({
  collection_id: z.string().uuid(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const { collection_id } = parsed.data;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Load collection
  const { data: col, error: colErr } = await supabase
    .from("collections")
    .select("id, chain, minted, total_supply, phases, buyback_enabled, buyback_contribution_pct")
    .eq("id", collection_id)
    .maybeSingle();

  if (colErr || !col) {
    return new Response(JSON.stringify({ error: "Collection not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!col.buyback_enabled || !col.buyback_contribution_pct) {
    return new Response(JSON.stringify({ skipped: "buyback not enabled" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if ((col.chain ?? "solana") !== "solana") {
    return new Response(JSON.stringify({ skipped: "non-solana chain (v1)" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if ((col.minted ?? 0) < (col.total_supply ?? 0)) {
    return new Response(JSON.stringify({ skipped: "not yet minted out" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Idempotency: bail if we already have a row for this collection
  const { data: existing } = await supabase
    .from("collection_buyback_contributions")
    .select("id, status, event_id")
    .eq("collection_id", collection_id)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ already_processed: existing }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Estimate mint revenue from phases (v1: first phase price × minted)
  let revenueSol = 0;
  try {
    const phases = Array.isArray(col.phases) ? col.phases : [];
    const firstPrice = Number((phases[0] as any)?.price ?? 0);
    revenueSol = firstPrice * Number(col.minted ?? 0);
  } catch {
    revenueSol = 0;
  }
  const pct = Number(col.buyback_contribution_pct);
  const contributionSol = Number(((revenueSol * pct) / 100).toFixed(6));

  if (contributionSol <= 0) {
    return new Response(JSON.stringify({ skipped: "zero contribution" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find active Solana buyback program
  const { data: program } = await supabase
    .from("buyback_programs")
    .select("id, max_notional_per_run")
    .eq("chain", "solana")
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!program) {
    // Log row as pending; admin can seed a program later
    const { data: row } = await supabase
      .from("collection_buyback_contributions")
      .insert({
        collection_id,
        chain: "solana",
        mint_revenue_sol: revenueSol,
        contribution_pct: pct,
        contribution_sol: contributionSol,
        status: "pending",
        error: "no active solana buyback program configured",
      })
      .select()
      .single();
    return new Response(JSON.stringify({ logged: row, error: "no program" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Cap to program max
  const capped = Math.min(contributionSol, Number(program.max_notional_per_run));

  // Queue the buyback via the existing RPC (service role allowed)
  const { data: eventId, error: rpcErr } = await supabase.rpc("queue_buyback", {
    p_program_id: program.id,
    p_amount: capped,
    p_idempotency_key: `collection:${collection_id}:sellout`,
    p_scheduled_for: new Date().toISOString(),
  });

  const { data: row } = await supabase
    .from("collection_buyback_contributions")
    .insert({
      collection_id,
      program_id: program.id,
      event_id: rpcErr ? null : (eventId as string),
      chain: "solana",
      mint_revenue_sol: revenueSol,
      contribution_pct: pct,
      contribution_sol: capped,
      status: rpcErr ? "failed" : "queued",
      error: rpcErr ? rpcErr.message : null,
    })
    .select()
    .single();

  return new Response(JSON.stringify({ contribution: row, event_id: eventId ?? null }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
