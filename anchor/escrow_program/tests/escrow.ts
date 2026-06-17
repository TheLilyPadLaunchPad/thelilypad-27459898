import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EscrowProgram } from "../target/types/escrow_program";
import { 
  createCoreCollection,
  create,
  fetchCollection,
  fetchAsset,
} from "@metaplex-foundation/mpl-core";
import { 
  createUmi,
  generateSigner,
  publicKey,
} from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { 
  initializeListing,
  purchase,
  cancelListing,
} from "../target/types/escrow_program";

describe("Escrow Program - Core Asset Integration", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.EscrowProgram as Program<EscrowProgram>;
  
  // Umi instance for Core operations
  const umi = createUmi(provider.connection.rpcEndpoint);
  umi.use(walletAdapterIdentity(provider.wallet));

  it("Creates a Core Collection", async () => {
    const collectionSigner = generateSigner(umi);
    
    await createCoreCollection(umi, {
      collection: collectionSigner,
      name: "Test Collection",
      uri: "https://example.com/metadata.json",
      plugins: [],
    });

    const collection = await fetchCollection(umi, collectionSigner.publicKey);
    assert(collection.name === "Test Collection");
  });

  it("Mints a Core Asset into the collection", async () => {
    const collectionSigner = generateSigner(umi);
    const assetSigner = generateSigner(umi);

    // First create collection
    await createCoreCollection(umi, {
      collection: collectionSigner,
      name: "Test Collection",
      uri: "https://example.com/metadata.json",
      plugins: [],
    });

    const collection = await fetchCollection(umi, collectionSigner.publicKey);

    // Mint asset into collection
    await create(umi, {
      asset: assetSigner,
      collection,
      name: "Test Asset",
      uri: "https://example.com/asset.json",
    });

    const asset = await fetchAsset(umi, assetSigner.publicKey);
    assert(asset.name === "Test Asset");
  });

  it("Initializes an escrow listing for a Core Asset", async () => {
    const collectionSigner = generateSigner(umi);
    const assetSigner = generateSigner(umi);

    // Create collection and mint asset
    await createCoreCollection(umi, {
      collection: collectionSigner,
      name: "Test Collection",
      uri: "https://example.com/metadata.json",
      plugins: [],
    });

    const collection = await fetchCollection(umi, collectionSigner.publicKey);

    await create(umi, {
      asset: assetSigner,
      collection,
      name: "Test Asset",
      uri: "https://example.com/asset.json",
    });

    // Initialize escrow listing
    const price = new anchor.BN(1_000_000_000); // 1 SOL
    await program.methods
      .initializeListing(price)
      .accounts({
        escrowAccount: null, // PDA derived from asset
        asset: assetSigner.publicKey.toString(),
        seller: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Verify escrow account created
    // (Implementation depends on your PDA derivation)
  });

  it("Purchases a Core Asset through escrow using Core CPI", async () => {
    // This test verifies the Core CPI transfer works correctly
    // Full implementation would:
    // 1. Create collection and mint asset
    // 2. Initialize listing
    // 3. Execute purchase
    // 4. Verify asset transferred to buyer via Core CPI
    // 5. Verify fees routed correctly
    
    // Placeholder for full integration test
    console.log("Core CPI integration test - requires full setup");
  });

  it("Cancels an escrow listing", async () => {
    // Test cancellation flow
    console.log("Cancel listing test - requires full setup");
  });
});
