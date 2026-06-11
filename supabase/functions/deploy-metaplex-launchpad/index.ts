/**
 * deploy-metaplex-launchpad
 *
 * Canonical Metaplex Core + Candy Machine deployer.
 * Mirrors the fixed-cost flow from scripts/deploy-cm.ts:
 *
 *   1. createCollection (with plugins)
 *   2. createCandyMachine  (hiddenSettings preferred → 1 tx, no addConfigLines)
 *   3. createCandyGuard + wrap
 *
 * Uses `npm:` specifiers (not esm.sh) so the Deno edge runtime can build
 * a stable lockfile — esm.sh imports were the source of opaque 500 / blank
 * screen crashes on this function.
 *
 * Returns a structured `{ ok, phase, error, stack }` body on failure so the
 * client/runtime-error report actually contains a cause.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { createUmi } from "npm:@metaplex-foundation/umi-bundle-defaults@0.9.2";
import {
  keypairIdentity,
  publicKey,
  some,
  sol,
  dateTime,
} from "npm:@metaplex-foundation/umi@0.9.2";
import {
  mplCore,
  createCollection,
  ruleSet,
} from "npm:@metaplex-foundation/mpl-core@1.1.1";
import {
  mplCandyMachine,
  createCandyMachine,
  createCandyGuard,
  wrap,
  findCandyGuardPda,
  addConfigLines,
} from "npm:@metaplex-foundation/mpl-core-candy-machine@0.3.0";
import {
  mplToolbox,
  setComputeUnitPrice,
  setComputeUnitLimit,
} from "npm:@metaplex-foundation/mpl-toolbox@0.9.4";
import bs58 from "npm:bs58@6.0.0";

// ─── CORS / response helpers ────────────────────────────────────────────────
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
  const stack = (error as any)?.stack || undefined;
  console.error(JSON.stringify({ level: "error", phase, error: message, stack }));
  return new Response(
    JSON.stringify({ ok: false, phase, error: message, stack }),
    { status, headers: jsonHeaders },
  );
};

// ─── Plugin builder ─────────────────────────────────────────────────────────
type PluginCfg = { enabled: boolean; config?: Record<string, any> } | undefined;
function buildCollectionPlugins(
  plugins: Record<string, PluginCfg> | undefined,
  fallback: { royaltyBps: number; creator: string },
): any[] {
  const out: any[] = [];
  const p = plugins || {};
  const isOn = (id: string) => p[id]?.enabled;
  const cfg = (id: string) => p[id]?.config || {};

  // Royalties — always include
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

  if (isOn("Attributes")) out.push({ type: "Attributes", attributeList: cfg("Attributes").attributeList || [] });
  if (isOn("VerifiedCreators")) out.push({ type: "VerifiedCreators", signatures: cfg("VerifiedCreators").signatures || [] });
  if (isOn("PermanentFreezeDelegate")) out.push({ type: "PermanentFreezeDelegate", frozen: !!cfg("PermanentFreezeDelegate").frozen });
  if (isOn("PermanentTransferDelegate")) out.push({ type: "PermanentTransferDelegate" });
  if (isOn("PermanentBurnDelegate")) out.push({ type: "PermanentBurnDelegate" });
  if (isOn("ImmutableMetadata")) out.push({ type: "ImmutableMetadata" });
  if (isOn("AddBlocker")) out.push({ type: "AddBlocker" });
  if (isOn("UpdateDelegate")) {
    const c2 = cfg("UpdateDelegate");
    out.push({
      type: "UpdateDelegate",
      additionalDelegates: (c2.additionalDelegates || []).map((a: string) => publicKey(a)),
    });
  }
  if (isOn("Autograph")) out.push({ type: "Autograph", signatures: cfg("Autograph").signatures || [] });
  return out;
}

// ─── Guard builder ──────────────────────────────────────────────────────────
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
    case "freezeTokenPayment":
      return some({
        amount: BigInt(Math.floor(num(c.amount) * Math.pow(10, num(c.decimals, 6)))),
        mint: publicKey(c.mint),
        destinationAta: publicKey(c.destinationAta),
      });
    case "freezeSolPayment":
      return some({ lamports: sol(num(c.amount)), destination: publicKey(c.destination) });
    case "startDate":
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
    case "nftBurn":
    case "assetGate":
    case "assetBurn":
      return some({ requiredCollection: publicKey(c.requiredCollection) });
    case "nftPayment":
    case "assetPayment":
      return some({
        requiredCollection: publicKey(c.requiredCollection),
        destination: publicKey(c.destination),
      });
    case "tokenGate":
    case "tokenBurn":
      return some({ mint: publicKey(c.mint), amount: BigInt(Math.floor(num(c.amount))) });
    case "gatekeeper":
      return some({ gatekeeperNetwork: publicKey(c.gatekeeperNetwork), expireOnUse: !!c.expireOnUse });
    case "thirdPartySigner":
      return some({ signerKey: publicKey(c.signerKey) });
    default:
      return null;
  }
}
function buildGuardSet(set: Record<string, any> | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  if (!set) return out;
  for (const [id, cfg] of Object.entries(set)) {
    if (!cfg || cfg.enabled === false) continue;
    try {
      const v = buildSingleGuard(id, cfg);
      if (v !== null) out[id] = v;
    } catch (e) {
      console.warn(`[guards] skipped ${id}: ${(e as Error).message}`);
    }
  }
  return out;
}

// ─── SHA-256 hash for hiddenSettings ────────────────────────────────────────
async function sha256Bytes(input: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return new Uint8Array(buf);
}

// ─── Handler ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let phase = "init";
  let paymentVerified = false;
  let paymentSignatureForRefund: string | undefined;
  let collectionIdForError: string | undefined;
  let supabaseServiceRoleOuter: any = null;
  try {
    // Auth
    phase = "auth";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail(phase, new Error("Missing Authorization header"), 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return fail(phase, new Error("Invalid token"), 401);

    // Payload
    phase = "payload";
    const payload = await req.json();
    const network: "devnet" | "mainnet" = payload.network === "mainnet" ? "mainnet" : "devnet";

    // Preflight: client checks network is configured BEFORE asking the
    // creator to sign the deploy-fee transaction.
    if (payload.preflight === true) {
      const devKeyP = Deno.env.get("DEVNET_TREASURY_PRIVATE_KEY");
      const mainKeyP = Deno.env.get("TREASURY_PRIVATE_KEY");
      const keyAvailable = network === "mainnet" ? !!mainKeyP : !!devKeyP;
      return ok({
        preflight: true,
        network,
        keyAvailable,
        rpcProvider: Deno.env.get("HELIUS_API_KEY") ? "helius" : "public",
      });
    }

    const {
      collectionId,
      name,
      symbol,
      uri: collectionUri,
      creatorAddress,
      itemsAvailable = 0,
      royaltyPercent = 5,
      items, // [{ name, uri }]
      collectionSecretKey,
      collectionPublicKey,
      collectionPlugins,
      defaultGuards,
      guardGroups,
      // Hidden-settings inputs (preferred)
      manifestRoot, // e.g. "https://gateway.pinata.cloud/ipfs/<CID>" (no trailing slash)
      placeholderName, // e.g. "Lily #"
      collectionType, // legacy
      // Creator pre-payment (rent + platform fee) — verified before deploy
      deployPaymentSignature,
      // Multi-phase config (persisted to collections.phases for the UI)
      phases,
    } = payload;
    collectionIdForError = collectionId;
    paymentSignatureForRefund = deployPaymentSignature;

    if (!collectionId || !creatorAddress || !name) {
      return fail(phase, new Error("Missing required parameters (collectionId, creatorAddress, name)"), 400);
    }

    // Lock solPayment.destination to the creator wallet across defaults + groups.
    // Mirrors the Metaplex Core Candy Machine standard "mint proceeds → creator"
    // pattern. Reject any payload that tries to redirect funds elsewhere.
    phase = "validate-guards";
    const assertDest = (guards: any, label: string) => {
      if (!guards || typeof guards !== "object") return;
      const sp = guards.solPayment;
      if (sp && sp.enabled !== false && sp.destination && String(sp.destination) !== String(creatorAddress)) {
        throw new Error(`solPayment.destination in ${label} must equal creatorAddress`);
      }
    };
    try {
      assertDest(defaultGuards, "defaultGuards");
      if (Array.isArray(guardGroups)) {
        for (const g of guardGroups) assertDest(g?.guards, `group "${g?.label}"`);
      }
    } catch (e) {
      return fail(phase, e, 400);
    }


    // Ownership
    phase = "ownership";
    const supabaseServiceRole = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    supabaseServiceRoleOuter = supabaseServiceRole;
    const { data: existingCollection, error: ownershipError } = await supabaseServiceRole
      .from("collections").select("creator_id").eq("id", collectionId).maybeSingle();
    if (ownershipError) return fail(phase, ownershipError, 500);
    if (!existingCollection) return fail(phase, new Error("Collection not found"), 404);
    if (existingCollection.creator_id !== user.id) return fail(phase, new Error("Forbidden: not the collection owner"), 403);

    // Treasury keypair — STRICT per-network. No silent devnet fallback:
    // if mainnet key is missing on a mainnet deploy we MUST reject before
    // any creator SOL is committed (client preflight should catch this).
    phase = "treasury";
    const devKey = Deno.env.get("DEVNET_TREASURY_PRIVATE_KEY");
    const mainKey = Deno.env.get("TREASURY_PRIVATE_KEY");
    const treasuryKey = network === "mainnet" ? mainKey : devKey;
    if (!treasuryKey) {
      return fail(
        phase,
        new Error(
          network === "mainnet"
            ? "Mainnet launches are temporarily disabled — platform treasury key not configured. No SOL was charged."
            : "Devnet treasury key not configured.",
        ),
        503,
      );
    }
    const effectiveNetwork: "devnet" | "mainnet" = network;

    // Umi — prefer Helius (premium RPC) when configured. Public mainnet RPC
    // is heavily rate-limited and routinely 429s the combined deploy tx.
    phase = "umi";
    const heliusKey = Deno.env.get("HELIUS_API_KEY");
    const rpcUrl = heliusKey
      ? (effectiveNetwork === "mainnet"
          ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
          : `https://devnet.helius-rpc.com/?api-key=${heliusKey}`)
      : (effectiveNetwork === "mainnet"
          ? "https://api.mainnet-beta.solana.com"
          : "https://api.devnet.solana.com");
    const umi = createUmi(rpcUrl).use(mplCore()).use(mplCandyMachine()).use(mplToolbox());
    const keypair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(treasuryKey));
    umi.use(keypairIdentity(keypair));

    const frontendCreatorPubkey = publicKey(creatorAddress);
    const treasuryAddress = keypair.publicKey;

    // Verify creator pre-payment: SOL transfer with protocol memo from
    // creatorAddress → treasury. Required for any deploy that spends rent.
    phase = "verify-payment";
    if (deployPaymentSignature) {
      try {
        const sigStr = String(deployPaymentSignature);
        const txInfo = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getTransaction",
            params: [sigStr, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
          }),
        }).then((r) => r.json());

        const tx = txInfo?.result;
        if (!tx) throw new Error("Pre-payment transaction not found on-chain");
        if (tx.meta?.err) throw new Error("Pre-payment transaction failed on-chain");

        const ixs: any[] = tx.transaction?.message?.instructions || [];
        const transfer = ixs.find(
          (i) => i.program === "system" && i.parsed?.type === "transfer",
        );
        if (!transfer) throw new Error("No SOL transfer found in pre-payment tx");
        const info = transfer.parsed.info;
        if (String(info.source) !== String(creatorAddress)) {
          throw new Error("Pre-payment sender does not match creatorAddress");
        }
        if (String(info.destination) !== String(treasuryAddress)) {
          throw new Error("Pre-payment recipient does not match treasury");
        }
        const memoIx = ixs.find(
          (i) => i.programId === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" ||
                 i.program === "spl-memo",
        );
        const memo = memoIx?.parsed || memoIx?.data || "";
        if (!String(memo).includes("TheLilyPad:v1:launchpad:deploy_collection")) {
          throw new Error("Pre-payment memo missing protocol tag");
        }
        console.log(`[verify-payment] ok ${sigStr} ${info.lamports} lamports`);
        paymentVerified = true;
      } catch (e) {
        return fail(phase, e, 402);
      }
    } else if (itemsAvailable > 0) {
      console.warn("[verify-payment] no deployPaymentSignature supplied — accepting for backward compat");
    }


    // Collection signer (optional vanity)
    phase = "collection-keypair";
    let collectionSigner;
    if (collectionSecretKey) {
      const secret = bs58.decode(collectionSecretKey);
      if (secret.length !== 64) return fail(phase, new Error(`Invalid collectionSecretKey length ${secret.length}`), 400);
      collectionSigner = umi.eddsa.createKeypairFromSecretKey(secret);
      if (collectionPublicKey && collectionSigner.publicKey !== collectionPublicKey) {
        return fail(phase, new Error("collectionPublicKey does not match supplied secret"), 400);
      }
    } else {
      collectionSigner = umi.eddsa.generateKeypair();
    }
    console.log(`[deploy] collection=${collectionSigner.publicKey} network=${network}`);

    // Plugins
    phase = "plugins";
    const pluginPayload = buildCollectionPlugins(collectionPlugins?.plugins, {
      royaltyBps: Math.round(Number(royaltyPercent) * 100),
      creator: String(frontendCreatorPubkey),
    });

    // 1) Create collection
    phase = "build-collection";
    let builder = createCollection(umi, {
      collection: collectionSigner,
      name,
      uri: collectionUri || "",
      plugins: pluginPayload,
    });

    // 2) Candy Machine (only when itemsAvailable > 0)
    let candyMachineAddress = "";
    let candyGuardAddress = "";
    let usingHidden = false;
    let itemsHashHex: string | null = null;

    if (itemsAvailable > 0) {
      phase = "candy-machine";
      const candyMachineSigner = umi.eddsa.generateKeypair();
      const candyGuardSigner = umi.eddsa.generateKeypair();
      candyMachineAddress = candyMachineSigner.publicKey;
      candyGuardAddress = findCandyGuardPda(umi, { base: candyGuardSigner.publicKey })[0];

      // Prefer hidden settings whenever we have a manifest root.
      // Falls back to configLineSettings + addConfigLines only when no root supplied.
      const root = (manifestRoot ? String(manifestRoot).replace(/\/+$/, "") : null);
      const cmArgs: any = {
        candyMachine: candyMachineSigner,
        collection: collectionSigner.publicKey,
        collectionUpdateAuthority: umi.identity,
        itemsAvailable: BigInt(itemsAvailable),
      };

      if (root) {
        // Build canonical hash from supplied items list (i:name:uri|…)
        const list = Array.isArray(items) ? items : [];
        const preImage = list
          .map((it: any, i: number) => `${i}:${it?.name || `${name} #${i}`}:${root}/${i}.json`)
          .join("|") || `${name}:${itemsAvailable}`;
        const hashBytes = await sha256Bytes(preImage);
        itemsHashHex = Array.from(hashBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

        const phName = String(placeholderName || `${String(name).slice(0, 22)} #`).slice(0, 32);
        cmArgs.hiddenSettings = some({
          name: phName,
          uri: `${root}/$ID$.json`.slice(0, 200),
          hash: hashBytes,
        });
        usingHidden = true;
        console.log(`[cm] hiddenSettings root=${root} placeholder=${phName} itemsHash=${itemsHashHex.slice(0, 16)}…`);
      } else {
        cmArgs.configLineSettings = some({
          prefixName: "",
          nameLength: 32,
          prefixUri: "",
          uriLength: 200,
          isSequential: false,
        });
        console.log(`[cm] configLineSettings (legacy — no manifestRoot supplied)`);
      }

      builder = builder.add(createCandyMachine(umi, cmArgs));

      // 3) Guards
      phase = "guards";
      const defaults = buildGuardSet(defaultGuards);
      if (!defaults.botTax) defaults.botTax = some({ lamports: sol(0.01), lastInstruction: true });

      const groupsPayload = Array.isArray(guardGroups) && guardGroups.length > 0
        ? guardGroups.map((g: any) => ({
            label: String(g.label || "").slice(0, 32),
            guards: buildGuardSet(g.guards),
          }))
        : undefined;

      const guardArgs: any = { base: candyGuardSigner, guards: defaults };
      if (groupsPayload) guardArgs.groups = groupsPayload;

      builder = builder.add(createCandyGuard(umi, guardArgs));
      builder = builder.add(
        wrap(umi, {
          candyGuard: candyGuardAddress,
          candyMachine: candyMachineSigner.publicKey,
          candyMachineAuthority: umi.identity,
        }),
      );
    }

    // Send — `skipPreflight: false` so real on-chain errors surface in logs
    // instead of being masked. Add jitter between batches to dodge mainnet
    // RPC rate limits when called repeatedly.
    phase = "send";
    console.log(`[deploy] phase=send · combined tx (collection + candy machine + guard + wrap)`);
    const { signature } = await builder.sendAndConfirm(umi, {
      send: { skipPreflight: false },
      confirm: { commitment: "confirmed" },
    });
    console.log(`[deploy] phase=send · tx ${bs58.encode(signature)} confirmed`);


    // Optional: addConfigLines only if we did NOT use hidden settings
    let itemsLoaded = 0;
    let insertError: string | null = null;
    if (candyMachineAddress && !usingHidden && Array.isArray(items) && items.length > 0) {
      phase = "insert-items";
      try {
        const cmPubkey = publicKey(candyMachineAddress);
        const validated = items
          .filter((it: any) => it && typeof it.name === "string" && typeof it.uri === "string")
          .map((it: any) => ({ name: String(it.name).slice(0, 32), uri: String(it.uri).slice(0, 200) }));
        const BATCH = 10;
        for (let i = 0; i < validated.length; i += BATCH) {
          const batch = validated.slice(i, i + BATCH);
          console.log(`[deploy] phase=insert-items · batch ${i / BATCH + 1} (${i}-${i + batch.length})`);
          await addConfigLines(umi, { candyMachine: cmPubkey, index: i, configLines: batch })
            .add(setComputeUnitPrice(umi, { microLamports: 100_000 }))
            .add(setComputeUnitLimit(umi, { units: 800_000 }))
            .sendAndConfirm(umi, { send: { skipPreflight: false }, confirm: { commitment: "confirmed" } });
          itemsLoaded = i + batch.length;
          // 250ms jitter between batches to avoid mainnet RPC rate-limit.
          if (i + BATCH < validated.length) {
            await new Promise((r) => setTimeout(r, 250));
          }
        }

      } catch (e: any) {
        insertError = e?.message || String(e);
        console.error(`[insert] failed at ${itemsLoaded}/${items.length}: ${insertError}`);
      }
    } else if (usingHidden) {
      itemsLoaded = Number(itemsAvailable) || 0;
    }

    // Persist
    phase = "persist";
    // Build UI-facing phases JSON from the supplied phase array (or the guard groups).
    let phasesForUi: any[] | null = null;
    try {
      const src = Array.isArray(phases) && phases.length > 0
        ? phases
        : (Array.isArray(guardGroups) ? guardGroups.map((g: any, i: number) => ({
            id: g?.label || `phase-${i}`,
            name: g?.label || `Phase ${i + 1}`,
            price: String(g?.guards?.solPayment?.amount ?? 0),
            maxPerWallet: g?.guards?.mintLimit?.limit ?? 0,
            startTime: g?.guards?.startDate?.date ?? null,
            endTime: g?.guards?.endDate?.date ?? null,
            requiresAllowlist: !!g?.guards?.allowList,
          })) : []);
      phasesForUi = src.map((p: any, i: number) => ({
        id: String(p.id ?? `phase-${i}`),
        name: String(p.name ?? p.id ?? `Phase ${i + 1}`),
        price: String(p.price ?? p.payment?.amount ?? 0),
        maxPerWallet: Number(p.maxPerWallet ?? 0),
        supply: Number(p.supply ?? itemsAvailable ?? 0),
        startTime: p.startTime ? new Date(p.startTime).toISOString() : null,
        endTime: p.endTime ? new Date(p.endTime).toISOString() : null,
        requiresAllowlist: !!(p.requiresAllowlist ?? p.merkleRoot),
        candyMachineAddress: candyMachineAddress || null,
        timezone: p.timezone || 'UTC',
      }));
    } catch (e) {
      console.warn('[persist] failed to normalize phases for UI:', (e as any)?.message);
    }

    await supabaseServiceRole.from("collections").update({
      contract_address: collectionSigner.publicKey,
      status: "live",
      candy_machine_address: candyMachineAddress || null,
      candy_guard_address: candyGuardAddress || null,
      collection_mint_address: collectionSigner.publicKey,
      items_loaded: itemsLoaded,
      ...(phasesForUi && phasesForUi.length > 0 ? { phases: phasesForUi } : {}),
    }).eq("id", collectionId);

    return ok({
      collectionAddress: collectionSigner.publicKey,
      candyMachineAddress: candyMachineAddress || null,
      candyGuardAddress: candyGuardAddress || null,
      signature: bs58.encode(signature),
      itemsLoaded,
      itemsAvailable: itemsAvailable || 0,
      pluginsApplied: pluginPayload.map((p: any) => p.type),
      hiddenSettings: usingHidden,
      itemsHashHex,
      manifestRoot: manifestRoot || null,
      partial: !!insertError || (itemsAvailable && itemsLoaded < itemsAvailable),
      insertError,
      network: effectiveNetwork,
      collectionType: collectionType || null,
    });
  } catch (error) {
    return fail(phase, error, 500);
  }
});
