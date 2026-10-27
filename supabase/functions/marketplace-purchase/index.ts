/**
 * marketplace-purchase — Solana secondary sales for Metaplex Core assets.
 *
 * Flow:
 *  1. Seller lists: signs an on-chain TransferDelegate approval naming the
 *     platform marketplace key (the NFT stays in the seller's wallet).
 *  2. Buyer asks for a "quote": we check the seller still owns the NFT and the
 *     approval is still in place, then return the exact payment split.
 *  3. Buyer pays seller / creator royalty / platform fee in ONE transaction
 *     signed by their own wallet (memo carries the listing id).
 *  4. "settle": we verify that payment on chain, lock the listing, and use the
 *     delegate approval to move the NFT straight into the buyer's wallet.
 *
 * A payment signature can only ever be redeemed once.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { createUmi } from "npm:@metaplex-foundation/umi-bundle-defaults@1.4.1";
import { keypairIdentity, publicKey } from "npm:@metaplex-foundation/umi@1.4.1";
import { mplCore, fetchAsset, transferV1 } from "npm:@metaplex-foundation/mpl-core@1.7.0";
import bs58 from "npm:bs58@6.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LAMPORTS = 1_000_000_000n;
const PLATFORM_FEE_BPS = 200n; // 2% secondary platform fee
const MAX_ROYALTY_BPS = 1000n; // cap creator royalty at 10%
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,90}$/;

function rpcUrl() {
  const k = Deno.env.get("HELIUS_API_KEY");
  return k ? `https://mainnet.helius-rpc.com/?api-key=${k}` : "https://api.mainnet-beta.solana.com";
}

function makeUmi() {
  const raw = Deno.env.get("TREASURY_PRIVATE_KEY");
  if (!raw) throw new Error("Marketplace signer is not configured");
  const umi = createUmi(rpcUrl()).use(mplCore());
  const secret = raw.trim().startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw.trim());
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));
  return umi;
}

function toLamports(sol: number | string): bigint {
  const [w, f = ""] = String(sol).split(".");
  return BigInt(w || "0") * LAMPORTS + BigInt((f + "000000000").slice(0, 9));
}
const toSol = (l: bigint) => Number(l) / 1e9;

async function loadQuote(admin: any, umi: any, listingId: string, buyer: string) {
  const { data: listing, error } = await admin
    .from("nft_listings")
    .select("*, nft:minted_nfts(id, asset_id, chain, collection:collections(id, contract_address, creator_address, royalty_percent, chain))")
    .eq("id", listingId)
    .maybeSingle();
  if (error || !listing) throw Object.assign(new Error("Listing not found"), { status: 404 });
  if (listing.status !== "active") throw Object.assign(new Error("This listing is no longer available"), { status: 409 });
  if (listing.expires_at && new Date(listing.expires_at) < new Date())
    throw Object.assign(new Error("This listing has expired"), { status: 409 });
  const chain = listing.nft?.collection?.chain || listing.nft?.chain || "solana";
  if (chain !== "solana") throw Object.assign(new Error("Only Solana listings are supported here"), { status: 400 });
  if (listing.seller_address === buyer) throw Object.assign(new Error("You can't buy your own listing"), { status: 400 });
  const assetId = listing.nft?.asset_id;
  if (!assetId) throw Object.assign(new Error("This NFT has no on-chain asset address"), { status: 400 });

  const asset: any = await fetchAsset(umi, publicKey(assetId));
  if (String(asset.owner) !== listing.seller_address)
    throw Object.assign(new Error("The seller no longer owns this NFT"), { status: 409 });
  const delegate = asset.transferDelegate?.authority;
  const platform = String(umi.identity.publicKey);
  if (!delegate || delegate.type !== "Address" || String(delegate.address) !== platform)
    throw Object.assign(new Error("The seller hasn't approved this sale on chain"), { status: 409 });

  const price = toLamports(listing.price);
  const fee = (price * PLATFORM_FEE_BPS) / 10000n;
  const creator: string | null = listing.nft?.collection?.creator_address || null;
  let royaltyBps = BigInt(Math.round(Number(listing.nft?.collection?.royalty_percent ?? 0) * 100));
  if (royaltyBps > MAX_ROYALTY_BPS) royaltyBps = MAX_ROYALTY_BPS;
  if (!creator || !BASE58.test(creator) || creator === listing.seller_address) royaltyBps = 0n;
  const royalty = (price * royaltyBps) / 10000n;
  const sellerAmt = price - fee - royalty;
  const treasury = Deno.env.get("TREASURY_ADDRESS") || platform;

  const recipients = [
    { role: "seller", address: listing.seller_address, lamports: sellerAmt },
    ...(royalty > 0n ? [{ role: "royalty", address: creator!, lamports: royalty }] : []),
    { role: "platform", address: treasury, lamports: fee },
  ].filter((r) => r.lamports > 0n);

  const collectionAddr = asset.updateAuthority?.type === "Collection" ? String(asset.updateAuthority.address) : null;
  return { listing, assetId, collectionAddr, price, fee, royalty, sellerAmt, recipients };
}

async function verifyPayment(signature: string, buyer: string, listingId: string, recipients: any[]) {
  let tx: any = null;
  for (let i = 0; i < 6 && !tx; i++) {
    const res = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }] }),
    });
    tx = (await res.json())?.result;
    if (!tx) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!tx) throw new Error("Payment transaction not found on chain");
  if (tx.meta?.err) throw new Error("Payment transaction failed on chain");
  const keys = tx.transaction.message.accountKeys as any[];
  const addrs = keys.map((k) => (typeof k === "string" ? k : k.pubkey));
  const signers = keys.filter((k) => typeof k !== "string" && k.signer).map((k) => k.pubkey);
  if (!signers.includes(buyer)) throw new Error("Payment was not signed by your wallet");
  const logs: string[] = tx.meta?.logMessages ?? [];
  if (!logs.some((l) => l.includes(listingId))) throw new Error("Payment is not tagged for this listing");

  const need = new Map<string, bigint>();
  for (const r of recipients) need.set(r.address, (need.get(r.address) ?? 0n) + r.lamports);
  for (const [addr, lamports] of need) {
    const i = addrs.indexOf(addr);
    if (i < 0) throw new Error("Payment is missing a required recipient");
    const delta = BigInt(tx.meta.postBalances[i]) - BigInt(tx.meta.preBalances[i]);
    if (delta < lamports) throw new Error("Payment amount is lower than the listing price");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const umi = makeUmi();

    if (action === "config") {
      return json({ ok: true, delegate: String(umi.identity.publicKey), platformFeeBps: Number(PLATFORM_FEE_BPS) });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Sign in to buy" }, 401);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ ok: false, error: "Sign in to buy" }, 401);

    const listingId = String(body.listingId || "");
    const buyer = String(body.buyer || "");
    if (!/^[0-9a-f-]{36}$/i.test(listingId) || !BASE58.test(buyer)) return json({ ok: false, error: "Invalid request" }, 400);

    if (action === "quote") {
      const q = await loadQuote(admin, umi, listingId, buyer);
      return json({
        ok: true,
        memo: `TheLilyPad:v1:marketplace:buy:listing=${listingId}`,
        recipients: q.recipients.map((r) => ({ ...r, lamports: r.lamports.toString() })),
        price: toSol(q.price), platformFee: toSol(q.fee), royalty: toSol(q.royalty), sellerProceeds: toSol(q.sellerAmt),
      });
    }

    if (action === "settle") {
      const signature = String(body.signature || "");
      if (!BASE58.test(signature)) return json({ ok: false, error: "Invalid signature" }, 400);

      // Idempotent retry: already settled with this payment.
      const { data: prior } = await admin.from("nft_listings").select("id,status,delivery_tx,delivery_error").eq("payment_tx", signature).maybeSingle();
      if (prior) {
        if (prior.id !== listingId) return json({ ok: false, error: "Payment already used" }, 409);
        if (prior.status === "sold") return json({ ok: true, deliveryTx: prior.delivery_tx });
      }

      let q;
      if (!prior) {
        q = await loadQuote(admin, umi, listingId, buyer);
        await verifyPayment(signature, buyer, listingId, q.recipients);
        const { data: locked } = await admin.from("nft_listings")
          .update({ status: "settling", payment_tx: signature, buyer_id: user.id, buyer_address: buyer,
            royalty_amount: toSol(q.royalty), platform_fee_amount: toSol(q.fee), seller_proceeds: toSol(q.sellerAmt) })
          .eq("id", listingId).eq("status", "active").select("id").maybeSingle();
        if (!locked) return json({ ok: false, error: "Someone else bought this first. Contact support for a refund.", refundNeeded: true }, 409);
      } else {
        // Retry of a failed delivery for an already-verified payment.
        const { data: l } = await admin.from("nft_listings").select("*, nft:minted_nfts(asset_id)").eq("id", listingId).single();
        const asset: any = await fetchAsset(umi, publicKey(l.nft.asset_id));
        q = { listing: l, assetId: l.nft.asset_id,
          collectionAddr: asset.updateAuthority?.type === "Collection" ? String(asset.updateAuthority.address) : null };
      }

      try {
        const res = await transferV1(umi, {
          asset: publicKey(q.assetId),
          newOwner: publicKey(buyer),
          ...(q.collectionAddr ? { collection: publicKey(q.collectionAddr) } : {}),
        }).sendAndConfirm(umi);
        const deliveryTx = bs58.encode(res.signature);
        await admin.from("nft_listings").update({ status: "sold", sold_at: new Date().toISOString(), delivery_tx: deliveryTx, tx_hash: signature, delivery_error: null }).eq("id", listingId);
        await admin.from("minted_nfts").update({ owner_address: buyer, owner_id: user.id }).eq("id", q.listing.nft_id);
        return json({ ok: true, deliveryTx });
      } catch (e) {
        const msg = (e as any)?.message || String(e);
        console.error("delivery failed", listingId, msg);
        await admin.from("nft_listings").update({ status: "delivery_failed", delivery_error: msg.slice(0, 500) }).eq("id", listingId);
        return json({ ok: false, error: "Payment received but delivery failed. Tap retry.", retryable: true }, 502);
      }
    }

    return json({ ok: false, error: "Unknown action" }, 400);
  } catch (e) {
    const status = (e as any)?.status || 500;
    console.error("marketplace-purchase", (e as any)?.message);
    return json({ ok: false, error: status === 500 ? "Something went wrong" : (e as any).message }, status);
  }
});
