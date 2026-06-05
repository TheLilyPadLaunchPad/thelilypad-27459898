import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createUmi } from "npm:@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, publicKey, some, none, dateTime, sol } from "npm:@metaplex-foundation/umi";
import { createCollection, ruleSet } from "npm:@metaplex-foundation/mpl-core";
import { createCandyMachine, createCandyGuard, wrap, findCandyGuardPda } from "npm:@metaplex-foundation/mpl-core-candy-machine";
import { setComputeUnitLimit, setComputeUnitPrice } from "npm:@metaplex-foundation/mpl-toolbox";
import bs58 from "npm:bs58";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    }

    // Parse payload early so we can pick the correct treasury key per network
    const payload = await req.json();
    const network = payload.network || 'devnet';

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
    } = payload;

    if (!collectionId || !creatorAddress) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), { status: 400, headers: corsHeaders });
    }

    // Ownership check — only the collection's creator can trigger a deploy for it.
    const supabaseServiceRole = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: existingCollection, error: ownershipError } = await supabaseServiceRole
      .from("collections")
      .select("creator_id")
      .eq("id", collectionId)
      .maybeSingle();

    if (ownershipError || !existingCollection) {
      return new Response(JSON.stringify({ error: "Collection not found" }), { status: 404, headers: corsHeaders });
    }
    if (existingCollection.creator_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden: not the collection owner" }), { status: 403, headers: corsHeaders });
    }

    console.log(`Starting backend deployment for collection: ${name} (${collectionId})`);

    // Initialize Umi with the backend payer
    const rpcUrl = network === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com';
    const umi = createUmi(rpcUrl).use(setComputeUnitLimit({ units: 800_000 })).use(setComputeUnitPrice({ microLamports: 100_000 }));
    
    const secretKey = bs58.decode(treasuryKey);
    const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
    umi.use(keypairIdentity(keypair));

    const frontendCreatorPubkey = publicKey(creatorAddress);

    // 1. Create the Core Collection
    const collectionSigner = umi.eddsa.generateKeypair();
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

    // Update the database with the deployed addresses (using existing service role client)
    await supabaseServiceRole.from("collections").update({
      contract_address: collectionSigner.publicKey,
      status: "live",
      candy_machine_address: candyMachineAddress || null,
      candy_guard_address: candyGuardAddress || null,
      collection_mint_address: collectionSigner.publicKey,
    }).eq("id", collectionId);

    return new Response(JSON.stringify({ 
      success: true, 
      collectionAddress: collectionSigner.publicKey,
      candyMachineAddress: candyMachineAddress || null,
      candyGuardAddress: candyGuardAddress || null,
      signature: bs58.encode(signature)
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Backend deployment error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
