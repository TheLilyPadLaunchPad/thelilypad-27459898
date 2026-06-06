import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createUmi } from "https://esm.sh/@metaplex-foundation/umi-bundle-defaults@0.9.2";
import { keypairIdentity, publicKey, some, none, dateTime, sol } from "https://esm.sh/@metaplex-foundation/umi@0.9.2";
import { mplCore, createCollection, ruleSet } from "https://esm.sh/@metaplex-foundation/mpl-core@1.1.1";
import { mplCandyMachine, createCandyMachine, createCandyGuard, wrap, findCandyGuardPda, addConfigLines, fetchCandyMachine } from "https://esm.sh/@metaplex-foundation/mpl-core-candy-machine@0.3.0";
import { mplToolbox, setComputeUnitPrice, setComputeUnitLimit } from "https://esm.sh/@metaplex-foundation/mpl-toolbox@0.9.4";
import bs58 from "https://esm.sh/bs58@6.0.0";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log(`[deploy-metaplex-launchpad] ${req.method} request received`);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    // Parse payload early so we can pick the correct treasury key per network
    const payload = await req.json();
    const network = payload.network || 'devnet';
    console.log(`[deploy-metaplex-launchpad] invoked`, { network, collectionId: payload?.collectionId, userId: user.id });

    const treasuryKey = network === 'devnet'
      ? (Deno.env.get("DEVNET_TREASURY_PRIVATE_KEY") || Deno.env.get("TREASURY_PRIVATE_KEY"))
      : Deno.env.get("TREASURY_PRIVATE_KEY");
    if (!treasuryKey) {
      throw new Error(`Treasury private key not configured for network: ${network}`);
    }

    const { 
      collectionId, 
      name, 
      symbol, 
      uri, 
      creatorAddress, 
      itemsAvailable,
      phases,
      baseUri,
      royaltyPercent = 5,
      items,
      collectionSecretKey,
      collectionPublicKey,
    } = payload;

    if (!collectionId || !creatorAddress) {
      return jsonResponse({ error: "Missing required parameters" }, 400);
    }


    // Ownership check — only the collection's creator can trigger a deploy for it.
    const supabaseServiceRole = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: existingCollection, error: ownershipError } = await supabaseServiceRole
      .from("collections")
      .select("creator_id")
      .eq("id", collectionId)
      .maybeSingle();

    if (ownershipError || !existingCollection) {
      return jsonResponse({ error: "Collection not found" }, 404);
    }
    if (existingCollection.creator_id !== user.id) {
      return jsonResponse({ error: "Forbidden: not the collection owner" }, 403);
    }

    console.log(`Starting backend deployment for collection: ${name} (${collectionId})`);


    // Initialize Umi with the backend payer
    const rpcUrl = network === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com';
    const umi = createUmi(rpcUrl)
      .use(mplCore())
      .use(mplCandyMachine())
      .use(mplToolbox());

    const secretKey = bs58.decode(treasuryKey);
    const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
    umi.use(keypairIdentity(keypair));

    const frontendCreatorPubkey = publicKey(creatorAddress);

    // 1. Create the Core Collection — use a pre-ground vanity keypair if provided
    //    (so the on-chain collection address ends in our brand suffix, e.g. "L3AP").
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
        console.log("[vanity] using supplied L3AP keypair:", collectionSigner.publicKey);
      } catch (e: any) {
        return jsonResponse({ error: `Invalid collectionSecretKey: ${e?.message || e}` }, 400);
      }
    } else {
      collectionSigner = umi.eddsa.generateKeypair();
    }
    console.log("Collection Address:", collectionSigner.publicKey);


    let builder = createCollection(umi, {
      collection: collectionSigner,
      name,
      uri: uri || "",
      plugins: [
        {
          type: 'Royalties',
          basisPoints: Math.round(royaltyPercent * 100),
          creators: [{ address: frontendCreatorPubkey, percentage: 100 }],
          ruleSet: ruleSet('None'),
        }
      ],
    });

    // 2. Create Candy Machine (if items > 0)
    let candyMachineAddress = "";
    let candyGuardAddress = "";

    if (itemsAvailable > 0) {
      const candyMachineSigner = umi.eddsa.generateKeypair();
      const candyGuardSigner = umi.eddsa.generateKeypair();
      candyMachineAddress = candyMachineSigner.publicKey;
      candyGuardAddress = findCandyGuardPda(umi, { base: candyGuardSigner.publicKey })[0];

      console.log("Candy Machine Address:", candyMachineAddress);

      // Create CM
      builder = builder.add(createCandyMachine(umi, {
        candyMachine: candyMachineSigner,
        collection: collectionSigner.publicKey,
        collectionUpdateAuthority: umi.identity, // Must be identity during creation
        itemsAvailable: BigInt(itemsAvailable),
        configLineSettings: some({
            prefixName: "",
            nameLength: 32,
            prefixUri: baseUri || "",
            uriLength: baseUri ? 50 : 200,
            isSequential: false,
        }),
      }));

      // Basic guards
      const primaryPrice = phases?.[0]?.price || 0;
      builder = builder.add(createCandyGuard(umi, {
        base: candyGuardSigner,
        guards: {
          botTax: some({ lamports: sol(0.01), lastInstruction: true }),
          solPayment: primaryPrice > 0 ? some({
            lamports: sol(primaryPrice),
            destination: frontendCreatorPubkey, // Funds go directly to creator
          }) : none(),
        }
      }));

      // Wrap
      builder = builder.add(wrap(umi, {
        candyGuard: candyGuardAddress,
        candyMachine: candyMachineSigner.publicKey,
        candyMachineAuthority: umi.identity,
      }));
    }

    console.log("Sending transaction to Solana...");
    const { signature } = await builder.sendAndConfirm(umi, { send: { skipPreflight: true } });
    console.log("Transaction confirmed!", bs58.encode(signature));

    // Insert config lines (items) into the Candy Machine, if provided
    let itemsLoaded = 0;
    let insertError: string | null = null;
    if (candyMachineAddress && Array.isArray(items) && items.length > 0) {
      try {
        const cmPubkey = publicKey(candyMachineAddress);
        const validated = items
          .filter((it: any) => it && typeof it.name === 'string' && typeof it.uri === 'string')
          .map((it: any) => ({ name: String(it.name).slice(0, 32), uri: String(it.uri).slice(0, 200) }));

        if (validated.length !== items.length) {
          console.warn(`[insert] ${items.length - validated.length} items dropped due to invalid shape`);
        }

        const BATCH = 10;
        for (let i = 0; i < validated.length; i += BATCH) {
          const batch = validated.slice(i, i + BATCH);
          console.log(`[insert] batch ${i / BATCH + 1} @ index ${i} (${batch.length} items)`);
          await addConfigLines(umi, {
            candyMachine: cmPubkey,
            index: i,
            configLines: batch,
          })
            .add(setComputeUnitPrice(umi, { microLamports: 100_000 }))
            .add(setComputeUnitLimit(umi, { units: 800_000 }))
            .sendAndConfirm(umi, { send: { skipPreflight: false }, confirm: { commitment: 'confirmed' } });
          itemsLoaded = i + batch.length;
        }
        console.log(`[insert] Done. ${itemsLoaded}/${validated.length} loaded.`);
      } catch (e: any) {
        insertError = e?.message || String(e);
        console.error("[insert] failed:", insertError);
      }
    }

    // Update the database with the deployed addresses (using existing service role client)
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
      partial: !!insertError || (itemsAvailable && itemsLoaded < itemsAvailable),
      insertError,
    });

  } catch (error: any) {
    console.error("Backend deployment error:", error);
    return jsonResponse({ error: error?.message || "Unknown error" }, 500);
  }

});
