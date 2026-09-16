/**
 * mint-pack-assets
 *
 * Server-side delivery for shop packs (stickers / emotes / emojis).
 *
 * The pack's Core Collection + Bubblegum tree are owned by the PLATFORM
 * treasury key, so only the platform can mint into them. Buyers pay SOL from
 * their own wallet, then this function verifies the payment on chain and mints
 * every pack item as a compressed NFT straight into the buyer's wallet.
 *
 * Actions:
 *   - "deploy": (admin) create the Core Collection + Bubblegum tree for a pack
 *               under the platform mint authority.
 *   - "mint":   (buyer) verify payment (if any) and deliver the pack items.
 *
 * Idempotent: a payment signature can only ever be redeemed once; retries
 * return the already-delivered result instead of minting twice.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { createUmi } from "npm:@metaplex-foundation/umi-bundle-defaults@1.4.1";
import {
  keypairIdentity,
  publicKey,
  some,
  generateSigner,
} from "npm:@metaplex-foundation/umi@1.4.1";
import {
  mplCore,
  createCollection,
} from "npm:@metaplex-foundation/mpl-core@1.7.0";
import {
  mplBubblegum,
  createTreeV2,
  mintV2,
  findTreeConfigPda,
} from "npm:@metaplex-foundation/mpl-bubblegum@5.0.2";
import {
  mplToolbox,
  setComputeUnitPrice,
} from "npm:@metaplex-foundation/mpl-toolbox@0.10.0";
import bs58 from "npm:bs58@6.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const ok = (body: unknown) =>
  new Response(JSON.stringify({ ok: true, ...(body as object) }), { status: 200, headers: jsonHeaders });
const fail = (phase: string, error: unknown, status = 500) => {
  const message = (error as any)?.message || String(error);
  console.error(JSON.stringify({ level: "error", phase, error: message }));
  return new Response(JSON.stringify({ ok: false, phase, error: message }), {
    status,
    headers: jsonHeaders,
  });
};

const LAMPORTS_PER_SOL = 1_000_000_000;

function rpcUrl() {
  const heliusKey = Deno.env.get("HELIUS_API_KEY");
  return heliusKey
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
    : "https://api.mainnet-beta.solana.com";
}

function loadPlatformSigner(umi: any) {
  const raw = Deno.env.get("TREASURY_PRIVATE_KEY");
  if (!raw) throw new Error("Platform mint authority is not configured");
  const secret = raw.trim().startsWith("[")
    ? Uint8Array.from(JSON.parse(raw))
    : bs58.decode(raw.trim());
  return umi.eddsa.createKeypairFromSecretKey(secret);
}

function makeUmi() {
  const umi = createUmi(rpcUrl()).use(mplCore()).use(mplBubblegum()).use(mplToolbox());
  const kp = loadPlatformSigner(umi);
  umi.use(keypairIdentity(kp));
  return umi;
}

/** Confirms `signature` paid at least `expectedSol` to `destination` from `payer`. */
async function verifyPayment(
  signature: string,
  destination: string,
  expectedSol: number,
  payer: string,
) {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
    }),
  });
  const json = await res.json();
  const tx = json?.result;
  if (!tx) throw new Error("Payment transaction not found on chain");
  if (tx.meta?.err) throw new Error("Payment transaction failed on chain");

  const keys: string[] = (tx.transaction?.message?.accountKeys ?? []).map((k: any) =>
    typeof k === "string" ? k : k.pubkey,
  );
  const destIdx = keys.indexOf(destination);
  if (destIdx < 0) throw new Error("Payment did not go to the platform treasury");

  const delta =
    Number(tx.meta.postBalances[destIdx]) - Number(tx.meta.preBalances[destIdx]);
  const expectedLamports = Math.floor(expectedSol * LAMPORTS_PER_SOL);
  // 1% tolerance for rounding between client price math and lamports.
  if (delta < Math.floor(expectedLamports * 0.99)) {
    throw new Error("Payment amount is lower than the pack price");
  }

  const signers: string[] = (tx.transaction?.message?.accountKeys ?? [])
    .filter((k: any) => typeof k !== "string" && k.signer)
    .map((k: any) => k.pubkey);
  if (signers.length && !signers.includes(payer)) {
    throw new Error("Payment was not signed by the buying wallet");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let phase = "init";
  try {
    phase = "auth";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail(phase, new Error("Missing Authorization header"), 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return fail(phase, new Error("Invalid token"), 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    phase = "payload";
    const body = await req.json();
    const action: "deploy" | "mint" = body.action === "deploy" ? "deploy" : "mint";
    const packId: string = body.packId;
    if (!packId) return fail(phase, new Error("packId is required"), 400);

    const { data: pack, error: packErr } = await admin
      .from("shop_items")
      .select("id, name, description, image_url, category, price_sol, price_mon, collection_address, tree_address, mint_authority, creator_id")
      .eq("id", packId)
      .maybeSingle();
    if (packErr) return fail(phase, packErr, 500);
    if (!pack) return fail(phase, new Error("Pack not found"), 404);

    // ── Deploy (admin only) ────────────────────────────────────────────────
    if (action === "deploy") {
      phase = "deploy-authorize";
      const { data: isAdmin } = await admin.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (!isAdmin) return fail(phase, new Error("Admins only"), 403);

      phase = "deploy";
      const metadataUri: string = body.metadataUri;
      if (!metadataUri) return fail(phase, new Error("metadataUri is required"), 400);

      const umi = makeUmi();
      const authority = umi.identity.publicKey.toString();

      const collectionSigner = generateSigner(umi);
      await createCollection(umi, {
        collection: collectionSigner,
        name: pack.name,
        uri: metadataUri,
        plugins: [{ type: "BubblegumV2" }],
      })
        .add(setComputeUnitPrice(umi, { microLamports: 100_000 }))
        .sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

      const merkleTree = generateSigner(umi);
      const treeBuilder = await createTreeV2(umi, {
        merkleTree,
        maxDepth: 14,
        maxBufferSize: 64,
        canopyDepth: 8,
      });
      await setComputeUnitPrice(umi, { microLamports: 100_000 })
        .add(treeBuilder)
        .sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

      await admin
        .from("shop_items")
        .update({
          collection_address: collectionSigner.publicKey.toString(),
          tree_address: merkleTree.publicKey.toString(),
          mint_authority: authority,
        })
        .eq("id", packId);

      return ok({
        collectionAddress: collectionSigner.publicKey.toString(),
        treeAddress: merkleTree.publicKey.toString(),
        mintAuthority: authority,
      });
    }

    // ── Mint / deliver ─────────────────────────────────────────────────────
    phase = "mint-validate";
    const buyerWallet: string = body.buyerWallet;
    const paymentSignature: string | undefined = body.paymentSignature || undefined;
    if (!buyerWallet) return fail(phase, new Error("buyerWallet is required"), 400);
    if (!pack.collection_address || !pack.tree_address) {
      return fail(phase, new Error("This pack has not been deployed on-chain yet"), 400);
    }

    const umi = makeUmi();
    const platformAuthority = umi.identity.publicKey.toString();
    if (pack.mint_authority && pack.mint_authority !== platformAuthority) {
      return fail(
        phase,
        new Error("This pack was deployed under a different wallet and must be redeployed before it can be sold"),
        409,
      );
    }

    // Idempotency: a signature can only be redeemed once, and items already
    // delivered are never minted again on a retry.
    let existingPurchase: { id: string; delivery_status?: string | null; delivery_results?: any } | null = null;
    if (paymentSignature) {
      const { data: existing } = await admin
        .from("shop_purchases")
        .select("id, delivery_status, delivery_results")
        .eq("payment_signature", paymentSignature)
        .maybeSingle();
      existingPurchase = existing ?? null;
      if (existing && existing.delivery_status === "delivered") {
        return ok({ alreadyDelivered: true, results: existing.delivery_results ?? [] });
      }
    }

    const priorResults: any[] = Array.isArray(existingPurchase?.delivery_results)
      ? existingPurchase!.delivery_results
      : [];
    const alreadyMinted = new Set(
      priorResults.filter((r: any) => r?.success && r?.contentId).map((r: any) => r.contentId),
    );

    phase = "mint-contents";
    const { data: contents } = await admin
      .from("shop_item_contents")
      .select("id, name, file_url, arweave_uri, metadata_uri, display_order")
      .eq("item_id", packId)
      .order("display_order", { ascending: true });

    const deliverable = (contents ?? []).filter((c: any) => c.metadata_uri);
    if (deliverable.length === 0) {
      return fail(phase, new Error("This pack has no items ready to mint"), 400);
    }
    // Only mint what the buyer has not received yet.
    const mintable = deliverable.filter((c: any) => !alreadyMinted.has(c.id));


    phase = "verify-payment";
    const priceSol = Number(pack.price_sol ?? 0) || Number(pack.price_mon ?? 0) * 0.01;
    const treasury =
      Deno.env.get("TREASURY_ADDRESS") || platformAuthority;
    if (priceSol > 0) {
      if (!paymentSignature) return fail(phase, new Error("Payment signature is required"), 400);
      await verifyPayment(paymentSignature, treasury, priceSol, buyerWallet);
    }

    const priorSuccesses = priorResults.filter((r: any) => r?.success);

    // Everything already landed in the buyer's wallet — nothing left to mint.
    if (mintable.length === 0) {
      if (existingPurchase) {
        await admin
          .from("shop_purchases")
          .update({ delivery_status: "delivered", delivery_results: priorSuccesses })
          .eq("id", existingPurchase.id);
      }
      return ok({ alreadyDelivered: true, deliveryStatus: "delivered", results: priorSuccesses });
    }

    phase = "mint";
    const tree = publicKey(pack.tree_address);
    const treeConfig = findTreeConfigPda(umi, { merkleTree: tree });
    const leafOwner = publicKey(buyerWallet);
    const results: any[] = [];


    for (const item of mintable) {
      try {
        const res = await mintV2(umi, {
          collectionAuthority: umi.identity,
          leafOwner,
          merkleTree: tree,
          treeConfig,
          coreCollection: publicKey(pack.collection_address),
          metadata: {
            name: item.name,
            uri: item.metadata_uri,
            sellerFeeBasisPoints: 0,
            collection: some(publicKey(pack.collection_address)),
            creators: [],
          },
        })
          .add(setComputeUnitPrice(umi, { microLamports: 50_000 }))
          .sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

        results.push({
          success: true,
          contentId: item.id,
          name: item.name,
          signature: bs58.encode(res.signature),
        });
      } catch (e) {
        console.error("mint failed", item.name, (e as Error).message);
        results.push({
          success: false,
          contentId: item.id,
          name: item.name,
          error: (e as Error).message,
        });
      }
    }

    // Combine with anything delivered on an earlier attempt.
    const combined = [...priorSuccesses, ...results];
    const successCount = combined.filter((r) => r.success).length;
    const deliveryStatus =
      successCount === deliverable.length ? "delivered" : successCount > 0 ? "partial" : "failed";

    phase = "record";
    if (existingPurchase) {
      await admin
        .from("shop_purchases")
        .update({ delivery_status: deliveryStatus, delivery_results: combined })
        .eq("id", existingPurchase.id);
    } else {
      await admin.from("shop_purchases").insert({
        item_id: packId,
        user_id: user.id,
        price_paid: priceSol,
        currency: "SOL",
        tx_hash: paymentSignature ?? null,
        payment_signature: paymentSignature ?? null,
        from_address: buyerWallet,
        delivery_status: deliveryStatus,
        delivery_results: combined,
      });
    }

    const newSuccesses = results.filter((r) => r.success);
    if (newSuccesses.length > 0) {
      const nftRecords = newSuccesses.map((r, idx) => {
        const content = mintable.find((c: any) => c.id === r.contentId);
        return {
          name: r.name,
          description: `On-chain ${String(pack.category).replace("_", " ")} from ${pack.name}`,
          image_url: content?.arweave_uri || content?.file_url || pack.image_url,
          collection_id: null,
          owner_address: buyerWallet,
          owner_id: user.id,
          token_id: priorSuccesses.length + idx + 1,
          tx_hash: r.signature,
          attributes: [
            { trait_type: "Pack", value: pack.name },
            { trait_type: "Category", value: pack.category },
            { trait_type: "Asset Type", value: "cNFT" },
          ],
          is_revealed: true,
        };
      });
      await admin.from("minted_nfts").insert(nftRecords);
    }

    return ok({
      results: combined,
      deliveryStatus,
      successCount,
      total: deliverable.length,
    });

  } catch (e) {
    return fail(phase, e, 500);
  }
});
