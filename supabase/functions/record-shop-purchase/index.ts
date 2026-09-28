/**
 * record-shop-purchase
 *
 * The only way to create shop_purchases / shop_bundle_purchases from the app.
 * Free items are recorded directly; paid items/bundles are recorded only after
 * the Solana payment is confirmed on chain, paid by the caller's signer, for at
 * least the listed price, and not already redeemed.
 *
 * Body: { kind: "item", itemId, txHash? } | { kind: "bundle", bundleId, txHash }
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const LAMPORTS = 1_000_000_000;
const rpcUrl = () => {
  const k = Deno.env.get("HELIUS_API_KEY");
  return k ? `https://mainnet.helius-rpc.com/?api-key=${k}` : "https://api.mainnet-beta.solana.com";
};

/** Returns the fee payer if the tx paid >= expectedSol to other accounts. */
async function verifyPaid(signature: string, expectedSol: number): Promise<string> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "getTransaction",
      params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }],
    }),
  });
  const tx = (await res.json())?.result;
  if (!tx) throw new Error("Payment transaction not found on chain");
  if (tx.meta?.err) throw new Error("Payment transaction failed on chain");
  const keys: any[] = tx.transaction?.message?.accountKeys ?? [];
  const payer = typeof keys[0] === "string" ? keys[0] : keys[0]?.pubkey;
  let received = 0;
  for (let i = 1; i < keys.length; i++) {
    const d = Number(tx.meta.postBalances[i]) - Number(tx.meta.preBalances[i]);
    if (d > 0) received += d;
  }
  if (received < Math.floor(expectedSol * LAMPORTS * 0.99)) throw new Error("Payment amount is lower than the price");
  return payer;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const authClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u, error: ue } = await authClient.auth.getUser(authHeader.slice(7));
    if (ue || !u?.user) return json({ error: "Authentication required" }, 401);
    const userId = u.user.id;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => null);
    const kind = body?.kind;
    const txHash = typeof body?.txHash === "string" ? body.txHash.trim() : "";
    if (txHash && !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(txHash)) return json({ error: "Invalid transaction" }, 400);

    const alreadyUsed = async () => {
      const [a, b] = await Promise.all([
        admin.from("shop_purchases").select("user_id").eq("tx_hash", txHash).limit(1),
        admin.from("shop_bundle_purchases").select("user_id").eq("tx_hash", txHash).limit(1),
      ]);
      return (a.data?.length ?? 0) + (b.data?.length ?? 0) > 0;
    };

    if (kind === "item") {
      const itemId = String(body?.itemId || "");
      const { data: item } = await admin.from("shop_items").select("id, price_sol").eq("id", itemId).maybeSingle();
      if (!item) return json({ error: "Item not found" }, 404);
      const price = Number(item.price_sol || 0);
      if (price > 0) {
        if (!txHash) return json({ error: "Payment required" }, 400);
        if (await alreadyUsed()) return json({ error: "Payment already used" }, 409);
        await verifyPaid(txHash, price);
      }
      const { error } = await admin.from("shop_purchases").insert({
        item_id: itemId, user_id: userId, price_paid: price, currency: "SOL",
        tx_hash: price > 0 ? txHash : "free_claim",
      });
      if (error) return json({ error: error.code === "23505" ? "already_owned" : "Could not record purchase", code: error.code }, error.code === "23505" ? 409 : 400);
      return json({ ok: true });
    }

    if (kind === "bundle") {
      const bundleId = String(body?.bundleId || "");
      const { data: bundle } = await admin.from("shop_bundles")
        .select("id, bundle_price_sol, bundle_price, is_active").eq("id", bundleId).maybeSingle();
      if (!bundle || !bundle.is_active) return json({ error: "Bundle not available" }, 404);
      const price = Number(bundle.bundle_price_sol || Number(bundle.bundle_price || 0) * 0.01);
      if (price > 0) {
        if (!txHash) return json({ error: "Payment required" }, 400);
        if (await alreadyUsed()) return json({ error: "Payment already used" }, 409);
        await verifyPaid(txHash, price);
      }
      const { error: bErr } = await admin.from("shop_bundle_purchases").insert({
        bundle_id: bundleId, user_id: userId, price_paid: price, tx_hash: txHash || "free_claim", currency: "SOL",
      });
      if (bErr) return json({ error: "Could not record purchase" }, 400);
      const { data: items } = await admin.from("shop_bundle_items").select("item_id").eq("bundle_id", bundleId);
      if (items?.length) {
        await admin.from("shop_purchases").insert(items.map((i: any) => ({
          item_id: i.item_id, user_id: userId, price_paid: 0, tx_hash: txHash || "free_claim", currency: "SOL",
        })));
      }
      return json({ ok: true });
    }

    return json({ error: "Invalid request" }, 400);
  } catch (e) {
    console.error("record-shop-purchase:", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Verification failed" }, 400);
  }
});
