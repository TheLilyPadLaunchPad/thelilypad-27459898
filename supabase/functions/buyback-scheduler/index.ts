// Buyback Scheduler — cron-invoked worker
//
// Claims one queued buyback at a time (FOR UPDATE SKIP LOCKED) and executes
// it against the configured DEX. On Solana the swap is built with Jupiter V6
// and signed with the treasury keypair. Idempotency + state machine live in
// the database; this worker is stateless and safe to run concurrently.
//
// Auth: callable by service role only (we check the cron secret on inbound
// HTTP requests so external traffic can't trigger it).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  Connection,
  Keypair,
  VersionedTransaction,
} from "npm:@solana/web3.js@1.95.3";
import bs58 from "npm:bs58@5.0.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TREASURY_PK_RAW = Deno.env.get("TREASURY_PRIVATE_KEY") ?? "";
const SCHEDULER_SECRET = Deno.env.get("BUYBACK_SCHEDULER_SECRET") ?? "";
const RPC_URL =
  Deno.env.get("SOLANA_RPC_URL") ?? "https://api.mainnet-beta.solana.com";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

function loadTreasuryKeypair(): Keypair | null {
  if (!TREASURY_PK_RAW) return null;
  try {
    if (TREASURY_PK_RAW.trim().startsWith("[")) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(TREASURY_PK_RAW)));
    }
    return Keypair.fromSecretKey(bs58.decode(TREASURY_PK_RAW.trim()));
  } catch (e) {
    console.error("[Scheduler] Bad TREASURY_PRIVATE_KEY:", (e as Error).message);
    return null;
  }
}

interface BuybackEvent {
  id: string;
  program_id: string | null;
  chain: string | null;
  token_address: string | null;
  mon_spent: number | null;
}

interface Program {
  id: string;
  chain: string;
  network: string;
  token_mint: string;
  dex: string;
  slippage_bps: number;
  min_pool_balance: number;
}

async function executeSolanaSwap(
  supabase: ReturnType<typeof createClient>,
  event: BuybackEvent,
  program: Program,
): Promise<void> {
  const kp = loadTreasuryKeypair();
  if (!kp) throw new Error("Treasury keypair not configured");

  const connection = new Connection(RPC_URL, "confirmed");

  // Circuit breaker: minimum pool balance
  const balLamports = await connection.getBalance(kp.publicKey);
  const balSol = balLamports / LAMPORTS_PER_SOL;
  if (balSol < program.min_pool_balance) {
    throw new Error(
      `Pool balance ${balSol} SOL below min ${program.min_pool_balance}`,
    );
  }

  const amountSol = Number(event.mon_spent);
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("Invalid swap amount");
  }
  const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

  // 1. Jupiter quote
  const quoteUrl =
    `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}` +
    `&outputMint=${program.token_mint}` +
    `&amount=${amountLamports}` +
    `&slippageBps=${program.slippage_bps}`;
  const qRes = await fetch(quoteUrl);
  if (!qRes.ok) throw new Error(`Jupiter quote failed: ${qRes.status}`);
  const quote = await qRes.json();

  // Circuit breaker: liquidity sanity
  if (!quote || !quote.outAmount || Number(quote.outAmount) <= 0) {
    throw new Error("Jupiter returned zero output — abort swap");
  }

  // 2. Build swap tx
  const sRes = await fetch("https://quote-api.jup.ag/v6/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: kp.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
    }),
  });
  if (!sRes.ok) throw new Error(`Jupiter swap build failed: ${sRes.status}`);
  const swapData = await sRes.json();

  const tx = VersionedTransaction.deserialize(
    Uint8Array.from(atob(swapData.swapTransaction), (c) => c.charCodeAt(0)),
  );
  tx.sign([kp]);

  // 3. Submit
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  const { value: confirm } = await connection.confirmTransaction(
    {
      signature: sig,
      ...(await connection.getLatestBlockhash()),
    },
    "confirmed",
  );
  if (confirm.err) throw new Error(`Tx failed: ${JSON.stringify(confirm.err)}`);

  // 4. Mark complete
  const { error: rpcErr } = await supabase.rpc("complete_buyback_event", {
    p_event_id: event.id,
    p_tx_hash: sig,
    p_tokens_bought: Number(quote.outAmount),
  });
  if (rpcErr) throw new Error(`complete_buyback_event: ${rpcErr.message}`);

  console.log(
    `[Scheduler] event ${event.id} confirmed sig=${sig} out=${quote.outAmount}`,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Verify cron secret (set when pg_cron calls this function)
  const provided =
    req.headers.get("x-scheduler-secret") ??
    new URL(req.url).searchParams.get("secret");
  if (!SCHEDULER_SECRET || provided !== SCHEDULER_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const results: Array<{ id: string; status: string; error?: string }> = [];
  // Process up to 3 events per tick to avoid long-running edge invocations
  for (let i = 0; i < 3; i++) {
    const { data: claimed, error: claimErr } = await supabase.rpc(
      "claim_next_buyback",
    );
    if (claimErr) {
      console.error("[Scheduler] claim error:", claimErr.message);
      break;
    }
    const event = (claimed as BuybackEvent[] | null)?.[0];
    if (!event) break;

    try {
      const { data: prog, error: progErr } = await supabase
        .from("buyback_programs")
        .select("*")
        .eq("id", event.program_id)
        .single();
      if (progErr || !prog) throw new Error("Program not found");

      if (prog.chain === "solana") {
        await executeSolanaSwap(supabase, event, prog as Program);
        results.push({ id: event.id, status: "confirmed" });
      } else {
        throw new Error(`Chain ${prog.chain} not supported in scheduler yet`);
      }
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error(`[Scheduler] event ${event.id} failed:`, msg);
      await supabase.rpc("fail_buyback_event", {
        p_event_id: event.id,
        p_error: msg,
      });
      results.push({ id: event.id, status: "failed", error: msg });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
