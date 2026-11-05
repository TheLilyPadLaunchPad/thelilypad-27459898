/**
 * Unified Solana NFT transfer helpers.
 *
 * Supports both Metaplex Core assets and Bubblegum V2 compressed NFTs:
 *  - Core  → `transferV1` from @metaplex-foundation/mpl-core
 *  - cNFT  → `transferV2` from @metaplex-foundation/mpl-bubblegum with the
 *    Merkle proof resolved from the DAS API via `getAssetWithProof`.
 *
 * The pure helpers (`isValidSolanaAddress`, `detectSolanaAssetStandard`) are
 * unit-tested; the transaction builder is exercised through a real wallet.
 */

import { publicKey, type Umi } from "@metaplex-foundation/umi";
import { transferV1 } from "@metaplex-foundation/mpl-core";
import {
  transferV2,
  getAssetWithProof,
  findTreeConfigPda,
} from "@metaplex-foundation/mpl-bubblegum";
import { setComputeUnitPrice } from "@metaplex-foundation/mpl-toolbox";
import bs58 from "bs58";

export type SolanaAssetStandard = "core" | "compressed" | "unsupported";

/** Base58 Solana address check (32–44 chars, base58 alphabet). */
export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
}

/** Classify a DAS asset into the standard our transfer flow supports. */
export function detectSolanaAssetStandard(asset: {
  interface?: string;
  compression?: { compressed?: boolean } | null;
}): SolanaAssetStandard {
  if (asset.compression?.compressed === true) return "compressed";
  if (asset.interface === "MplCoreAsset") return "core";
  return "unsupported";
}

export interface TransferSolanaNftParams {
  /** Wallet-authenticated Umi instance (identity = current owner). */
  umi: Umi;
  /** DAS-enabled Umi instance used to resolve asset data and cNFT proofs. */
  dasUmi: Umi;
  /** On-chain asset address (Core asset or cNFT asset id). */
  assetAddress: string;
  /** Core collection address, when the asset belongs to one. */
  collectionAddress?: string | null;
  /** Recipient wallet address. */
  recipient: string;
  /** Progress callback for UI status lines. */
  onProgress?: (message: string) => void;
}

/**
 * Transfer a Core NFT or compressed NFT to a new owner.
 * Returns the base58 transaction signature.
 */
export async function transferSolanaNft({
  umi,
  dasUmi,
  assetAddress,
  collectionAddress,
  recipient,
  onProgress,
}: TransferSolanaNftParams): Promise<string> {
  if (!isValidSolanaAddress(assetAddress)) {
    throw new Error("This NFT has no valid on-chain asset address.");
  }
  if (!isValidSolanaAddress(recipient)) {
    throw new Error("Enter a valid Solana recipient address.");
  }

  onProgress?.("Looking up asset…");
  const dasAsset = await (dasUmi.rpc as any).getAsset(publicKey(assetAddress));
  const standard = detectSolanaAssetStandard(dasAsset);

  if (standard === "core") {
    onProgress?.("Transferring Core NFT…");
    const builder = transferV1(umi, {
      asset: publicKey(assetAddress),
      newOwner: publicKey(recipient),
      collection: collectionAddress ? publicKey(collectionAddress) : undefined,
    }).add(setComputeUnitPrice(umi, { microLamports: 50_000 }));

    const result = await builder.sendAndConfirm(umi, {
      send: { skipPreflight: false },
      confirm: { commitment: "confirmed" },
    });
    return bs58.encode(result.signature);
  }

  if (standard === "compressed") {
    onProgress?.("Fetching merkle proof…");
    const assetWithProof = await getAssetWithProof(
      dasUmi as any,
      publicKey(assetAddress),
      { truncateCanopy: true },
    );

    onProgress?.("Transferring compressed NFT…");
    const builder = transferV2(umi, {
      ...assetWithProof,
      leafOwner: umi.identity.publicKey,
      newLeafOwner: publicKey(recipient),
      coreCollection: collectionAddress ? publicKey(collectionAddress) : undefined,
      treeConfig: findTreeConfigPda(umi, { merkleTree: assetWithProof.merkleTree }),
    }).add(setComputeUnitPrice(umi, { microLamports: 50_000 }));

    const result = await builder.sendAndConfirm(umi, {
      send: { skipPreflight: false },
      confirm: { commitment: "confirmed" },
    });
    return bs58.encode(result.signature);
  }

  throw new Error(
    `Unsupported asset standard "${dasAsset.interface}". Only Core NFTs and compressed NFTs can be transferred here.`,
  );
}
