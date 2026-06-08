import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createUmi } from "https://esm.sh/@metaplex-foundation/umi-bundle-defaults@0.9.2";
import {
  keypairIdentity,
  publicKey,
  some,
  none,
  dateTime,
  sol,
} from "https://esm.sh/@metaplex-foundation/umi@0.9.2";
import {
  mplCore,
  createCollection,
  ruleSet,
} from "https://esm.sh/@metaplex-foundation/mpl-core@1.1.1";
import {
  mplCandyMachine,
  createCandyMachine,
  createCandyGuard,
  wrap,
  findCandyGuardPda,
  addConfigLines,
} from "https://esm.sh/@metaplex-foundation/mpl-core-candy-machine@0.3.0";
import {
  mplToolbox,
  setComputeUnitPrice,
  setComputeUnitLimit,
} from "https://esm.sh/@metaplex-foundation/mpl-toolbox@0.9.4";
import bs58 from "https://esm.sh/bs58@6.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

// ─────────────────────────────────────────────────────────────────────────────
// Plugin builder — turns the UI's CollectionPluginsConfig into mpl-core plugins
// ─────────────────────────────────────────────────────────────────────────────
type PluginCfg = { enabled: boolean; config?: Record<string, any> } | undefined;

function buildCollectionPlugins(
  plugins: Record<string, PluginCfg> | undefined,
  fallback: { royaltyBps: number; creator: string },
): any[] {
  const out: any[] = [];
  const p = plugins || {};
  const isOn = (id: string) => p[id]?.enabled;
  const cfg = (id: string) => p[id]?.config || {};

  // Royalties — always include (default to creator @ 100 % share)
  if (isOn("Royalties") || !plugins) {
    const c = cfg("Royalties");
    out.push({
      type: "Royalties",
      basisPoints: Number(c.basisPoints ?? fallback.royaltyBps),
      creators: (c.creators && c.creators.length > 0
        ? c.creators
        : [{ address: fallback.creator, percentage: 100 }]
      ).map((cr: any) => ({
        address: publicKey(cr.address),
        percentage: Number(cr.percentage ?? cr.share ?? 100),
      })),
      ruleSet: ruleSet(c.ruleSet || "None"),
    });
  }

  if (isOn("Attributes")) {
    out.push({ type: "Attributes", attributeList: cfg("Attributes").attributeList || [] });
  }
  if (isOn("VerifiedCreators")) {
    out.push({ type: "VerifiedCreators", signatures: cfg("VerifiedCreators").signatures || [] });
  }
  if (isOn("PermanentFreezeDelegate")) {
    out.push({ type: "PermanentFreezeDelegate", frozen: !!cfg("PermanentFreezeDelegate").frozen });
  }
  if (isOn("PermanentTransferDelegate")) out.push({ type: "PermanentTransferDelegate" });
  if (isOn("PermanentBurnDelegate")) out.push({ type: "PermanentBurnDelegate" });
  if (isOn("ImmutableMetadata")) out.push({ type: "ImmutableMetadata" });
  if (isOn("AddBlocker")) out.push({ type: "AddBlocker" });
  if (isOn("UpdateDelegate")) {
    const c = cfg("UpdateDelegate");
    out.push({
      type: "UpdateDelegate",
      additionalDelegates: (c.additionalDelegates || []).map((a: string) => publicKey(a)),
    });
  }
  if (isOn("Autograph")) {
    out.push({ type: "Autograph", signatures: cfg("Autograph").signatures || [] });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard builder — turns the UI's GuardSetConfig into mpl-core-candy-machine guards
// ─────────────────────────────────────────────────────────────────────────────
type GuardSet = Record<string, any>;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function buildSingleGuard(id: string, c: any): any | null {
  const num = (v: any, d = 0) => Number(v ?? d);
  switch (id) {
    case "botTax":
      return some({ lamports: sol(num(c.lamports, 0.01)), lastInstruction: c.lastInstruction !== false });
    case "solPayment":
      return some({ lamports: sol(num(c.amount)), destination: publicKey(c.destination) });
    case "tokenPayment":
      return some({
        amount: BigInt(Math.floor(num(c.amount) * Math.pow(10, num(c.decimals, 6)))),
        mint: publicKey(c.mint),
        destinationAta: publicKey(c.destinationAta),
      });
    case "token2022Payment":
      return some({
        amount: BigInt(Math.floor(num(c.amount) * Math.pow(10, num(c.decimals, 6)))),
        mint: publicKey(c.mint),
        destinationAta: publicKey(c.destinationAta),
      });
    case "freezeSolPayment":
      return some({ lamports: sol(num(c.amount)), destination: publicKey(c.destination) });
    case "freezeTokenPayment":
      return some({
        amount: BigInt(Math.floor(num(c.amount) * Math.pow(10, num(c.decimals, 6)))),
        mint: publicKey(c.mint),
        destinationAta: publicKey(c.destinationAta),
      });
    case "startDate":
      return some({ date: dateTime(new Date(c.date)) });
    case "endDate":
      return some({ date: dateTime(new Date(c.date)) });
    case "mintLimit":
      return some({ id: num(c.id, 1) % 256, limit: num(c.limit, 1) });
    case "redeemedAmount":
      return some({ maximum: BigInt(Math.max(0, num(c.maximum, 0))) });
    case "addressGate":
      return some({ address: publicKey(c.address) });
    case "allowList": {
      const bytes = hexToBytes(String(c.merkleRoot || ""));
      if (bytes.length !== 32) return null;
      return some({ merkleRoot: bytes });
    }
    case "nftGate":
      return some({ requiredCollection: publicKey(c.requiredCollection) });
    case "nftBurn":
      return some({ requiredCollection: publicKey(c.requiredCollection) });
    case "nftPayment":
      return some({
        requiredCollection: publicKey(c.requiredCollection),
        destination: publicKey(c.destination),
      });
    case "tokenGate":
      return some({ mint: publicKey(c.mint), amount: BigInt(Math.floor(num(c.amount))) });
    case "tokenBurn":
      return some({ mint: publicKey(c.mint), amount: BigInt(Math.floor(num(c.amount))) });
    case "programGate":
      return some({
        additional: ((c.additional || c.programs || []) as any[])
          .filter(Boolean)
          .map((a: string) => publicKey(a)),
      });
    case "gatekeeper":
      return some({
        gatekeeperNetwork: publicKey(c.gatekeeperNetwork),
        expireOnUse: !!c.expireOnUse,
      });
    case "thirdPartySigner":
      return some({ signerKey: publicKey(c.signerKey) });
    case "edition":
      return some({ editionStartOffset: num(c.editionStartOffset, 0) });
    case "assetGate":
      return some({ requiredCollection: publicKey(c.requiredCollection) });
    case "assetBurn":
      return some({ requiredCollection: publicKey(c.requiredCollection) });
    case "assetPayment":
      return some({
        requiredCollection: publicKey(c.requiredCollection),
        destination: publicKey(c.destination),
      });
    default:
      return null;
  }
}

function buildGuardSet(set: GuardSet | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  if (!set) return out;
  for (const [id, cfg] of Object.entries(set)) {
    if (!cfg || cfg.enabled === false) continue;
    try {
      const v = buildSingleGuard(id, cfg);
      if (v !== null) out[id] = v;
    } catch (e) {
      console.warn(`[guards] skipped ${id}:`, (e as Error).message);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  console.log(`[deploy-metaplex-launchpad] ${req.method} request received`);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Invalid token" }, 401);

    const payload = await req.json();
    const network = payload.network || "devnet";
    console.log(`[deploy-metaplex-launchpad] invoked`, {
      network,
      collectionId: payload?.collectionId,
      userId: user.id,
    });

    const treasuryKey = network === "devnet"
      ? (Deno.env.get("DEVNET_TREASURY_PRIVATE_KEY") || Deno.env.get("TREASURY_PRIVATE_KEY"))
      : Deno.env.get("TREASURY_PRIVATE_KEY");
    if (!treasuryKey) throw new Error(`Treasury private key not configured for network: ${network}`);

    const {
      collectionId,
      name,
      symbol,
      uri,
      creatorAddress,
      itemsAvailable,
      baseUri,
      royaltyPercent = 5,
      items,
      collectionSecretKey,
      collectionPublicKey,
      // NEW: full plugin / guard / hidden-settings payload
      collectionPlugins,
      defaultGuards,
      guardGroups,
      hiddenSettings,
      collectionType,
    } = payload;

    if (!collectionId || !creatorAddress) {
      return jsonResponse({ error: "Missing required parameters" }, 400);
    }

    // Ownership check
    const supabaseServiceRole = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: existingCollection, error: ownershipError } = await supabaseServiceRole
      .from("collections")
      .select("creator_id")
      .eq("id", collectionId)
      .maybeSingle();
    if (ownershipError || !existingCollection) return jsonResponse({ error: "Collection not found" }, 404);
    if (existingCollection.creator_id !== user.id) {
      return jsonResponse({ error: "Forbidden: not the collection owner" }, 403);
    }

    console.log(`Starting backend deployment for collection: ${name} (${collectionId})`);

    const rpcUrl = network === "mainnet"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com";
    const umi = createUmi(rpcUrl).use(mplCore()).use(mplCandyMachine()).use(mplToolbox());
    const keypair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(treasuryKey));
    umi.use(keypairIdentity(keypair));

    const frontendCreatorPubkey = publicKey(creatorAddress);

    // 1. Collection keypair (with optional vanity)
    let collectionSigner;
    if (collectionSecretKey) {
      try {
        const secret = bs58.decode(collectionSecretKey);
        if (secret.length !== 64) throw new Error(`invalid length ${secret.length}`);
        collectionSigner = umi.eddsa.createKeypairFromSecretKey(secret);
        if (collectionPublicKey && collectionSigner.publicKey !== collectionPublicKey) {
          return jsonResponse({ error: "collectionPublicKey does not match supplied secret key" }, 400);
        }
        if (!String(collectionSigner.publicKey).endsWith("L3AP")) {
          return jsonResponse({ error: "vanity collection address must end with L3AP" }, 400);
        }
      } catch (e: any) {
        return jsonResponse({ error: `Invalid collectionSecretKey: ${e?.message || e}` }, 400);
      }
    } else {
      collectionSigner = umi.eddsa.generateKeypair();
    }
    console.log("Collection Address:", collectionSigner.publicKey);

    // 2. Build collection plugin set
    const pluginPayload = buildCollectionPlugins(collectionPlugins?.plugins, {
      royaltyBps: Math.round(Number(royaltyPercent) * 100),
      creator: String(frontendCreatorPubkey),
    });
    console.log(`[plugins] enabled:`, pluginPayload.map((p: any) => p.type));

    let builder = createCollection(umi, {
      collection: collectionSigner,
      name,
      uri: uri || "",
      plugins: pluginPayload,
    });

    // 3. Candy Machine (if items > 0)
    let candyMachineAddress = "";
    let candyGuardAddress = "";

    if (itemsAvailable > 0) {
      const candyMachineSigner = umi.eddsa.generateKeypair();
      const candyGuardSigner = umi.eddsa.generateKeypair();
      candyMachineAddress = candyMachineSigner.publicKey;
      candyGuardAddress = findCandyGuardPda(umi, { base: candyGuardSigner.publicKey })[0];

      console.log("Candy Machine Address:", candyMachineAddress);

      // Auto hidden settings for blind-box collections
      let hidden = hiddenSettings;
      if (!hidden && collectionType === "blind_box") {
        // Hash is required by Metaplex; 32 bytes. Use a deterministic stub.
        const enc = new TextEncoder().encode(`${collectionId}:${name}:${itemsAvailable}`);
        const hashBuf = await crypto.subtle.digest("SHA-256", enc);
        hidden = {
          name: String(name).slice(0, 24) + " #$ID+1$",
          uri: baseUri
            ? `${String(baseUri).replace(/\/+$/, "")}/$ID$.json`
            : "https://arweave.net/placeholder/$ID$.json",
          hash: Array.from(new Uint8Array(hashBuf)),
        };
      }

      const cmArgs: any = {
        candyMachine: candyMachineSigner,
        collection: collectionSigner.publicKey,
        collectionUpdateAuthority: umi.identity,
        itemsAvailable: BigInt(itemsAvailable),
      };
      if (hidden) {
        cmArgs.hiddenSettings = some({
          name: String(hidden.name || "").slice(0, 32),
          uri: String(hidden.uri || "").slice(0, 200),
          hash: new Uint8Array(hidden.hash || new Array(32).fill(0)).slice(0, 32),
        });
        console.log("[cm] hiddenSettings enabled:", hidden.name, hidden.uri);
      } else {
        cmArgs.configLineSettings = some({
          prefixName: "",
          nameLength: 32,
          prefixUri: "",
          uriLength: 200,
          isSequential: false,
        });
      }

      builder = builder.add(createCandyMachine(umi, cmArgs));

      // 4. Guards — defaults + optional groups
      const defaults = buildGuardSet(defaultGuards);
      // Always ensure botTax exists as a safety net if user didn't set one
      if (!defaults.botTax) {
        defaults.botTax = some({ lamports: sol(0.01), lastInstruction: true });
      }
      // Fallback solPayment from legacy phases[0].price — only if user didn't define any payment
      if (!defaults.solPayment && !defaults.tokenPayment && payload.phases?.[0]?.price > 0) {
        defaults.solPayment = some({
          lamports: sol(Number(payload.phases[0].price)),
          destination: frontendCreatorPubkey,
        });
      }

      const groupsPayload = Array.isArray(guardGroups) && guardGroups.length > 0
        ? guardGroups.map((g: any) => ({
            label: String(g.label || "").slice(0, 32),
            guards: buildGuardSet(g.guards),
          }))
        : undefined;

      const guardArgs: any = { base: candyGuardSigner, guards: defaults };
      if (groupsPayload) {
        guardArgs.groups = groupsPayload;
        console.log(`[guards] ${groupsPayload.length} groups:`, groupsPayload.map((g) => g.label));
      }
      console.log(`[guards] defaults:`, Object.keys(defaults));

      builder = builder.add(createCandyGuard(umi, guardArgs));
      builder = builder.add(
        wrap(umi, {
          candyGuard: candyGuardAddress,
          candyMachine: candyMachineSigner.publicKey,
          candyMachineAuthority: umi.identity,
        }),
      );
    }

    console.log("Sending transaction to Solana...");
    const { signature } = await builder.sendAndConfirm(umi, { send: { skipPreflight: true } });
    console.log("Transaction confirmed!", bs58.encode(signature));

    // 5. Insert config lines (skipped if hiddenSettings is used)
    let itemsLoaded = 0;
    let insertError: string | null = null;
    const usingHidden = !!hiddenSettings || collectionType === "blind_box";
    if (candyMachineAddress && !usingHidden && Array.isArray(items) && items.length > 0) {
      try {
        const cmPubkey = publicKey(candyMachineAddress);
        const validated = items
          .filter((it: any) => it && typeof it.name === "string" && typeof it.uri === "string")
          .map((it: any) => ({
            name: String(it.name).slice(0, 32),
            uri: String(it.uri).slice(0, 200),
          }));
        const BATCH = 10;
        for (let i = 0; i < validated.length; i += BATCH) {
          const batch = validated.slice(i, i + BATCH);
          console.log(`[insert] batch ${i / BATCH + 1} @ index ${i} (${batch.length} items)`);
          await addConfigLines(umi, { candyMachine: cmPubkey, index: i, configLines: batch })
            .add(setComputeUnitPrice(umi, { microLamports: 100_000 }))
            .add(setComputeUnitLimit(umi, { units: 800_000 }))
            .sendAndConfirm(umi, { send: { skipPreflight: false }, confirm: { commitment: "confirmed" } });
          itemsLoaded = i + batch.length;
        }
        console.log(`[insert] Done. ${itemsLoaded}/${validated.length} loaded.`);
      } catch (e: any) {
        insertError = e?.message || String(e);
        console.error("[insert] failed:", insertError);
      }
    } else if (usingHidden) {
      console.log("[insert] skipped — hidden settings active");
      itemsLoaded = itemsAvailable;
    }

    await supabaseServiceRole.from("collections").update({
      contract_address: collectionSigner.publicKey,
      status: "live",
      candy_machine_address: candyMachineAddress || null,
      candy_guard_address: candyGuardAddress || null,
      collection_mint_address: collectionSigner.publicKey,
      items_loaded: itemsLoaded,
    }).eq("id", collectionId);

    return jsonResponse({
      success: true,
      collectionAddress: collectionSigner.publicKey,
      candyMachineAddress: candyMachineAddress || null,
      candyGuardAddress: candyGuardAddress || null,
      signature: bs58.encode(signature),
      itemsLoaded,
      itemsAvailable: itemsAvailable || 0,
      pluginsApplied: pluginPayload.map((p: any) => p.type),
      hiddenSettings: usingHidden,
      partial: !!insertError || (itemsAvailable && itemsLoaded < itemsAvailable),
      insertError,
    });
  } catch (error: any) {
    console.error("Backend deployment error:", error);
    return jsonResponse({ error: error?.message || "Unknown error" }, 500);
  }
});
