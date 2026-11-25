import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { DEFAULT_SOLANA_TREASURY, getCallerWallets } from "../_shared/callerWallets.ts";
import { validTicketCount, verifyRaffleSolanaPayment, verifyRaffleMonadPayment, nativeUnits } from "../_shared/rafflePayment.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Invalid request" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return json({ error: "Entry service unavailable" }, 503);
    const authorization = req.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401);
    const auth = createClient(url, anon);
    const { data, error } = await auth.auth.getUser(authorization.slice(7));
    if (error || !data.user || data.user.is_anonymous) return json({ error: "Sign in required" }, 401);
    const userId = data.user.id;
    const admin = createClient(url, service);
    const body = await req.json();
    const { raffleId, ticketCount, chain, network = "mainnet" } = body;
    const txHash = typeof body.txHash === "string" ? body.txHash : "";
    if (typeof raffleId !== "string" || !/^[0-9a-f-]{36}$/i.test(raffleId)
      || !["solana", "monad"].includes(chain) || !["mainnet", "devnet", "testnet"].includes(network)) {
      return json({ error: "Invalid entry request" }, 400);
    }
    if (network !== "mainnet") {
      const { data: isAdmin, error: roleError } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (roleError || !isAdmin) return json({ error: "Test payments are restricted to administrators" }, 403);
    }
    // Return an already-settled entry without creating or altering tickets.
    if (txHash) {
      const { data: existing, error: existingError } = await admin.from("lily_raffle_entries")
        .select("id, user_id, raffle_id, ticket_count").eq("tx_hash", txHash).maybeSingle();
      if (existingError) return json({ error: "Could not check payment" }, 503);
      if (existing) return existing.user_id === userId && existing.raffle_id === raffleId && existing.ticket_count === ticketCount
        ? json({ ok: true, entryId: existing.id, alreadyRecorded: true }) : json({ error: "Payment already used" }, 409);
    }
    const { data: raffle, error: raffleError } = await admin.from("lily_raffles").select("*").eq("id", raffleId).maybeSingle();
    if (raffleError || !raffle) return json({ error: "Raffle unavailable" }, 404);
    const now = Date.now();
    if (!raffle.is_active || raffle.is_drawn || now < Date.parse(raffle.start_date) || now >= Date.parse(raffle.end_date)) {
      return json({ error: "Raffle is not open" }, 400);
    }
    const { data: entries, error: entriesError } = await admin.from("lily_raffle_entries")
      .select("ticket_count").eq("raffle_id", raffleId).eq("user_id", userId);
    if (entriesError) return json({ error: "Could not check ticket allowance" }, 503);
    const used = (entries ?? []).reduce((sum, entry) => sum + entry.ticket_count, 0);
    if (!validTicketCount(ticketCount, used, raffle.max_tickets_per_user ?? 100)) return json({ error: "Ticket limit exceeded" }, 400);
    const totalPaid = Number(raffle.entry_price) * ticketCount;
    if (!Number.isFinite(totalPaid) || totalPaid < 0) return json({ error: "Invalid ticket price" }, 400);
    if (totalPaid > 0) {
      if (!(chain === "solana" ? /^[1-9A-HJ-NP-Za-km-z]{64,90}$/ : /^0x[0-9a-fA-F]{64}$/).test(txHash)) {
        return json({ error: "Payment required" }, 400);
      }
      const wallets = await getCallerWallets(admin, userId);
      const heliusKey = Deno.env.get("HELIUS_API_KEY");
      const rpc = chain === "solana"
        ? network === "mainnet" ? heliusKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}` : "https://api.mainnet-beta.solana.com"
          : network === "devnet" ? "https://api.devnet.solana.com" : "https://api.testnet.solana.com"
        : network === "mainnet" ? "https://rpc.monad.xyz" : "https://testnet-rpc.monad.xyz";
      const call = async (method: string, params: unknown[]) => {
        const response = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        const result = await response.json();
        if (!response.ok || result.error) throw new Error("Payment lookup failed");
        return result.result;
      };
      let valid = false;
      let paidAt = 0;
      if (chain === "solana") {
        const tx = await call("getTransaction", [txHash, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
        valid = verifyRaffleSolanaPayment(tx, wallets, Deno.env.get("TREASURY_ADDRESS") || DEFAULT_SOLANA_TREASURY,
          nativeUnits(String(raffle.entry_price), 9) * BigInt(ticketCount));
        paidAt = Number(tx?.blockTime) * 1000;
      } else {
        const [tx, receipt, chainId] = await Promise.all([call("eth_getTransactionByHash", [txHash]),
          call("eth_getTransactionReceipt", [txHash]), call("eth_chainId", [])]);
        if (Number(chainId) !== (network === "mainnet" ? 143 : 10143)) return json({ error: "Payment chain mismatch" }, 400);
        valid = verifyRaffleMonadPayment(tx, receipt, wallets, "0x54Ac7Bcaba9A41b701066B7D8b204Ec14b72C96E",
          nativeUnits(String(raffle.entry_price), 18) * BigInt(ticketCount));
        if (receipt?.blockNumber) paidAt = Number((await call("eth_getBlockByNumber", [receipt.blockNumber, false]))?.timestamp) * 1000;
      }
      if (!valid || !paidAt || paidAt < Date.parse(raffle.start_date) || paidAt >= Date.parse(raffle.end_date)) {
        return json({ error: "Payment does not match this raffle entry" }, 400);
      }
    }
    // The insert trigger locks the raffle and rechecks limits and price atomically.
    const { data: entryId, error: insertError } = await admin.rpc("record_verified_raffle_entry", {
      p_raffle_id: raffleId, p_user_id: userId, p_ticket_count: ticketCount, p_tx_hash: txHash || null,
    });
    if (insertError || !entryId) return json({ error: "Entry could not be recorded; check your ticket limit or retry your payment" }, 409);
    return json({ ok: true, entryId });
  } catch {
    return json({ error: "Could not verify raffle entry" }, 400);
  }
});