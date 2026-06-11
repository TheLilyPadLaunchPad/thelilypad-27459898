/**
 * refund-deploy-payment
 *
 * Refunds a previously-collected launchpad deploy fee when the on-chain
 * deploy failed AFTER the creator's pre-payment was verified. Idempotent
 * via the `deploy_refunds` table — calling twice with the same signature
 * returns the original refund signature.
 *
 * Verification:
 *   1. The payment tx must exist on the correct network and match the
 *      protocol memo `TheLilyPad:v1:launchpad:deploy_collection`.
 *   2. The transfer must be FROM the requesting creator TO the platform
 *      treasury (derived from the configured TREASURY_PRIVATE_KEY /
 *      DEVNET_TREASURY_PRIVATE_KEY).
 *   3. No prior refund for the same payment signature.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "npm:@solana/web3.js@1.95.3";
import bs58 from "npm:bs58@6.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function ok(body: unknown) {
  return new Response(JSON.stringify({ ok: true, ...(body as object) }), {
    status: 200,
    headers: jsonHeaders,
  });
}
function fail(phase: string, error: unknown, status = 500) {
  const message = (error as any)?.message || String(error);
  console.error(JSON.stringify({ level: "error", fn: "refund-deploy-payment", phase, error: message }));
  return new Response(JSON.stringify({ ok: false, phase, error: message }), {
    status,
    headers: jsonHeaders,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let phase = "init";
  try {
    phase = "auth";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail(phase, new Error("Missing Authorization header"), 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return fail(phase, new Error("Invalid token"), 401);

    phase = "payload";
    const { paymentSignature, network: rawNetwork, collectionId, reason } = await req.json();
    if (!paymentSignature || typeof paymentSignature !== "string") {
      return fail(phase, new Error("paymentSignature is required"), 400);
    }
    const network: "devnet" | "mainnet" = rawNetwork === "mainnet" ? "mainnet" : "devnet";

    phase = "service-role";
    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Idempotency check
    phase = "idempotency";
    const { data: existing } = await service
      .from("deploy_refunds")
      .select("refund_signature, lamports, creator_address")
      .eq("payment_signature", paymentSignature)
      .maybeSingle();
    if (existing) {
      return ok({
        alreadyRefunded: true,
        refundSignature: existing.refund_signature,
        lamports: String(existing.lamports),
        creatorAddress: existing.creator_address,
      });
    }

    // Treasury / network
    phase = "treasury";
    const devKey = Deno.env.get("DEVNET_TREASURY_PRIVATE_KEY");
    const mainKey = Deno.env.get("TREASURY_PRIVATE_KEY");
    const treasuryKey = network === "mainnet" ? mainKey : devKey;
    if (!treasuryKey) {
      return fail(phase, new Error(`Treasury key not configured for ${network}`), 503);
    }
    const treasuryKeypair = Keypair.fromSecretKey(bs58.decode(treasuryKey));

    const heliusKey = Deno.env.get("HELIUS_API_KEY");
    const rpcUrl = heliusKey
      ? (network === "mainnet"
          ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
          : `https://devnet.helius-rpc.com/?api-key=${heliusKey}`)
      : (network === "mainnet"
          ? "https://api.mainnet-beta.solana.com"
          : "https://api.devnet.solana.com");
    const connection = new Connection(rpcUrl, "confirmed");

    // Verify the original payment tx
    phase = "verify-payment";
    const txInfo = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [paymentSignature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
      }),
    }).then((r) => r.json());

    const tx = txInfo?.result;
    if (!tx) return fail(phase, new Error("Payment tx not found on the requested network"), 404);
    if (tx.meta?.err) return fail(phase, new Error("Payment tx failed on-chain"), 400);

    const ixs: any[] = tx.transaction?.message?.instructions || [];
    const transfer = ixs.find((i) => i.program === "system" && i.parsed?.type === "transfer");
    if (!transfer) return fail(phase, new Error("No SOL transfer in payment tx"), 400);
    const info = transfer.parsed.info;
    const memoIx = ixs.find(
      (i) => i.programId === MEMO_PROGRAM_ID.toBase58() || i.program === "spl-memo",
    );
    const memo = memoIx?.parsed || memoIx?.data || "";
    if (!String(memo).includes("TheLilyPad:v1:launchpad:deploy_collection")) {
      return fail(phase, new Error("Payment tx is not a launchpad deploy fee"), 400);
    }
    if (String(info.destination) !== treasuryKeypair.publicKey.toBase58()) {
      return fail(phase, new Error("Payment was not sent to the platform treasury"), 400);
    }

    // Authorise refund: the caller must be the original payer (matched via
    // their wallet linked profile) OR a service-side admin job.
    phase = "authorize";
    const creatorAddress = String(info.source);
    const { data: profile } = await service
      .from("user_profiles")
      .select("user_id, wallet_address")
      .eq("user_id", user.id)
      .maybeSingle();
    const isOwner = profile?.wallet_address === creatorAddress;
    // also accept admin
    const { data: adminRole } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!isOwner && !adminRole) {
      return fail(phase, new Error("Only the original payer or an admin can request a refund"), 403);
    }

    // Send refund
    phase = "send-refund";
    const lamports = Number(info.lamports);
    if (!Number.isFinite(lamports) || lamports <= 0) {
      return fail(phase, new Error("Invalid payment lamports"), 400);
    }
    const recipient = new PublicKey(creatorAddress);

    const refundTx = new Transaction();
    refundTx.add(
      SystemProgram.transfer({
        fromPubkey: treasuryKeypair.publicKey,
        toPubkey: recipient,
        lamports,
      }),
    );
    const memoText = `TheLilyPad:v1:launchpad:refund_deploy:ref=${paymentSignature.slice(0, 20)}`;
    refundTx.add(
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: new TextEncoder().encode(memoText),
      }),
    );

    const refundSignature = await sendAndConfirmTransaction(connection, refundTx, [treasuryKeypair], {
      commitment: "confirmed",
      skipPreflight: false,
    });

    // Persist refund record
    phase = "persist";
    await service.from("deploy_refunds").insert({
      payment_signature: paymentSignature,
      collection_id: collectionId || null,
      creator_address: creatorAddress,
      lamports,
      refund_signature: refundSignature,
      reason: (reason || "").slice(0, 500),
      network,
    });

    console.log(`[refund] paid ${lamports} lamports to ${creatorAddress} sig=${refundSignature}`);
    return ok({
      refundSignature,
      lamports: String(lamports),
      creatorAddress,
    });
  } catch (error) {
    return fail(phase, error, 500);
  }
});
