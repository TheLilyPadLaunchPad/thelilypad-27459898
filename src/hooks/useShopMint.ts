/**
 * useShopMint — On-chain minting for shop packs (stickers, emotes, emojis)
 *
 * Each pack is backed by a Metaplex Core Collection + Bubblegum Merkle Tree.
 * When a user buys a pack, each sticker/emote inside is minted as a cNFT
 * directly to the buyer's wallet, with artwork permanently stored on Arweave.
 *
 * Flow:
 *   Admin: upload images → Arweave → deploy Core Collection + Bubblegum Tree
 *   User:  pay SOL → mint cNFTs for every item in the pack → DB record
 */

import { useCallback, useState } from 'react';
import { useWallet } from '@/providers/WalletProvider';
import { useSolanaLaunch } from '@/hooks/useSolanaLaunch';
import {
  uploadToArweave,
  uploadMetadataToArweave,
} from '@/integrations/irys/client';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getSolanaRpcUrl } from '@/config/solana';
import { PLATFORM_WALLETS } from '@/config/treasury';
import { createProtocolMemoInstruction } from '@/lib/solanaProtocol';
import { isUserRejection, getErrorMessage } from '@/lib/errorUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PackContentItem {
  id: string;
  name: string;
  file_url: string;         // legacy Supabase Storage URL
  arweave_uri?: string;     // permanent Arweave image URL
  metadata_uri?: string;    // Arweave JSON metadata URL
  display_order: number;
}

export interface OnChainPack {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string;
  price_sol: number | null;
  price_mon: number;
  collection_address?: string | null;
  tree_address?: string | null;
}

export interface MintResult {
  success: boolean;
  contentId: string;
  assetId?: string;
  signature?: string;
  error?: string;
}

export interface PurchaseMintOptions {
  skipPayment?: boolean;
  skipPurchaseRecord?: boolean;
}

// ── Metadata builder ──────────────────────────────────────────────────────────

export function buildStickerMetadata(
  itemName: string,
  packName: string,
  category: string,
  imageUri: string,
  opts?: { description?: string; displayOrder?: number },
) {
  return {
    name: itemName,
    description: opts?.description || `${itemName} from the ${packName} pack`,
    image: imageUri,
    attributes: [
      { trait_type: 'Pack', value: packName },
      { trait_type: 'Category', value: category },
      { trait_type: 'Type', value: category.replace('_pack', '').replace('_', ' ') },
      ...(opts?.displayOrder != null
        ? [{ trait_type: 'Display Order', value: String(opts.displayOrder) }]
        : []),
    ],
    properties: {
      category: 'image',
      files: [{ uri: imageUri, type: 'image/png' }],
    },
    collection: { name: packName },
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useShopMint() {
  const { address, network, getSolanaProvider, isConnected, setTransactionPending } =
    useWallet();
  const { deploySolanaCollection, deployBubblegumTree, mintCompressedCore } =
    useSolanaLaunch();

  const [isDeploying, setIsDeploying] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintProgress, setMintProgress] = useState({ done: 0, total: 0 });

  // ── Admin: Deploy on-chain collection for a pack ────────────────────────

  /**
   * Deploys a Metaplex Core Collection + Bubblegum tree for a shop pack.
   * Call this when admin finishes setting up a pack and clicks "Deploy On-Chain".
   *
   * Returns { collectionAddress, treeAddress } to be stored on shop_items.
   */
  const deployPackOnChain = useCallback(
    async (pack: { id: string; name: string; image_url: string | null }) => {
      if (!isConnected || !address) {
        throw new Error('Wallet not connected');
      }

      setIsDeploying(true);
      try {
        // 1. Upload pack cover image to Arweave for the collection metadata
        let coverUri = pack.image_url || '';
        if (pack.image_url && !pack.image_url.includes('arweave.net')) {
          toast.loading('Uploading pack cover to Arweave…', { id: 'deploy-pack' });
          const response = await fetch(pack.image_url);
          const blob = await response.blob();
          coverUri = await uploadToArweave(blob, {
            address,
            chainType: 'solana',
            network: network || 'devnet',
          });
        }

        // 2. Upload collection metadata JSON to Arweave
        toast.loading('Uploading collection metadata…', { id: 'deploy-pack' });
        const collectionMeta = {
          name: pack.name,
          description: `On-chain asset pack: ${pack.name}`,
          image: coverUri,
          properties: { category: 'image', creators: [] },
        };
        const metadataUri = await uploadMetadataToArweave(collectionMeta, {
          address,
          chainType: 'solana',
          network: network || 'devnet',
        });

        // 3. Deploy Core Collection
        toast.loading('Deploying Core Collection…', { id: 'deploy-pack' });
        const result = await deploySolanaCollection({
          name: pack.name,
          symbol: 'LILY',
          uri: metadataUri,
          sellerFeeBasisPoints: 0,
          creators: [{ address, share: 100 }],
        });

        if (!result?.address) throw new Error('Collection deployment failed');
        const collectionAddress = result.address;

        // 4. Deploy Bubblegum Tree (depth 14 = ~16k leaves, enough for packs)
        toast.loading('Deploying Bubblegum Tree…', { id: 'deploy-pack' });
        const treeAddress = await deployBubblegumTree(14, 64, 8);

        // 5. Persist on-chain addresses to shop_items
        const { error: updateErr } = await supabase
          .from('shop_items')
          .update({
            collection_address: collectionAddress,
            tree_address: treeAddress,
            image_url: coverUri, // update to Arweave URL
          })
          .eq('id', pack.id);

        if (updateErr) console.error('Failed to save on-chain addresses:', updateErr);

        toast.success('Pack deployed on-chain!', { id: 'deploy-pack' });
        return { collectionAddress, treeAddress };
      } catch (err: any) {
        console.error('Deploy pack on-chain failed:', err);
        toast.error(getErrorMessage(err), { id: 'deploy-pack' });
        throw err;
      } finally {
        setIsDeploying(false);
      }
    },
    [address, isConnected, network, deploySolanaCollection, deployBubblegumTree],
  );

  // ── Admin: Upload a single sticker to Arweave + build metadata ──────────

  /**
   * Uploads a sticker image to Arweave and creates its metadata JSON,
   * returning URIs to store on shop_item_contents.
   */
  const uploadStickerToArweave = useCallback(
    async (
      file: File,
      stickerName: string,
      packName: string,
      category: string,
    ) => {
      if (!address) throw new Error('Wallet not connected');

      const walletInfo = { address, chainType: 'solana' as const, network: network || 'devnet' };

      // 1. Upload image
      const imageUri = await uploadToArweave(file, walletInfo);

      // 2. Build & upload metadata
      const metadata = buildStickerMetadata(stickerName, packName, category, imageUri);
      const metadataUri = await uploadMetadataToArweave(metadata, walletInfo);

      return { arweaveUri: imageUri, metadataUri };
    },
    [address, network],
  );

  // ── User: Purchase a pack and mint cNFTs ────────────────────────────────

  /**
   * Full purchase flow:
   *   1. SOL payment to platform treasury
   *   2. Mint each sticker/emote as a cNFT to buyer wallet
   *   3. Record in shop_purchases & minted_nfts
   */
  const purchasePackOnChain = useCallback(
    async (
      pack: OnChainPack,
      contents: PackContentItem[],
      userId: string,
      options?: PurchaseMintOptions,
    ): Promise<MintResult[]> => {
      if (!isConnected || !address) {
        toast.error('Please connect your wallet');
        return [];
      }

      if (!pack.collection_address || !pack.tree_address) {
        toast.error('This pack has not been deployed on-chain yet');
        return [];
      }

      // Filter to only contents that have Arweave metadata
      const mintableContents = contents.filter((c) => c.metadata_uri);
      if (mintableContents.length === 0) {
        toast.error('No on-chain stickers found in this pack');
        return [];
      }

      setIsMinting(true);
      setMintProgress({ done: 0, total: mintableContents.length });
      setTransactionPending(true);

      const results: MintResult[] = [];

      try {
        const skipPayment = options?.skipPayment === true;
        const skipPurchaseRecord = options?.skipPurchaseRecord === true;

        // ── Step 1: SOL Payment ──────────────────────────────────────────
        const priceSol = pack.price_sol || pack.price_mon * 0.01;

        if (!skipPayment && priceSol > 0) {
          toast.loading('Confirm payment in wallet…', { id: 'pack-purchase' });

          const provider = getSolanaProvider();
          if (!provider?.publicKey) throw new Error('Solana wallet not connected');

          const connection = new Connection(
            getSolanaRpcUrl(network || 'devnet'),
            'confirmed',
          );

          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: provider.publicKey,
              toPubkey: new PublicKey(PLATFORM_WALLETS.solana.treasury),
              lamports: Math.floor(priceSol * LAMPORTS_PER_SOL),
            }),
          );

          // Protocol memo for on-chain identification
          transaction.add(
            createProtocolMemoInstruction(
              'shop:item_purchase',
              { pack: pack.id.slice(0, 8), items: String(mintableContents.length) },
            ),
          );

          const { blockhash, lastValidBlockHeight } =
            await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = provider.publicKey;

          const signed = await provider.signTransaction(transaction);
          const paymentSig = await connection.sendRawTransaction(signed.serialize());
          await connection.confirmTransaction(
            { signature: paymentSig, blockhash, lastValidBlockHeight },
            'confirmed',
          );

          toast.loading('Payment confirmed! Minting assets…', { id: 'pack-purchase' });
        }

        // ── Step 2: Mint cNFTs ───────────────────────────────────────────
        for (let i = 0; i < mintableContents.length; i++) {
          const content = mintableContents[i];
          try {
            toast.loading(
              `Minting ${content.name} (${i + 1}/${mintableContents.length})…`,
              { id: 'pack-purchase' },
            );

            const mintResult = await mintCompressedCore(
              pack.tree_address!,
              pack.collection_address!,
              content.name,
              content.metadata_uri!,
              0, // no royalties on utility assets
              address, // mint to buyer
            );

            results.push({
              success: true,
              contentId: content.id,
              assetId: mintResult?.assetId,
              signature: mintResult?.signature
                ? Buffer.from(mintResult.signature).toString('base64')
                : undefined,
            });
          } catch (err: any) {
            console.error(`Failed to mint ${content.name}:`, err);
            results.push({
              success: false,
              contentId: content.id,
              error: getErrorMessage(err),
            });
          }

          setMintProgress({ done: i + 1, total: mintableContents.length });
        }

        // ── Step 3: Record purchase in DB ────────────────────────────────
        const pricePaid = skipPayment ? 0 : pack.price_sol || pack.price_mon * 0.01;
        const successCount = results.filter((r) => r.success).length;

        if (successCount > 0) {
          // shop_purchases record
          if (!skipPurchaseRecord) {
            await supabase.from('shop_purchases').insert({
              item_id: pack.id,
              user_id: userId,
              price_paid: pricePaid,
              currency: 'SOL',
              tx_hash: results.find((r) => r.signature)?.signature || null,
            });
          }

          // minted_nfts records for each successful mint
          const nftRecords = results
            .filter((r) => r.success && r.assetId)
            .map((r, idx) => {
              const content = mintableContents.find((c) => c.id === r.contentId);
              return {
                name: content?.name || `${pack.name} #${idx + 1}`,
                description: `On-chain ${pack.category.replace('_', ' ')} from ${pack.name}`,
                image_url: content?.arweave_uri || content?.file_url || pack.image_url,
                collection_id: null, // could link to a collections record if desired
                owner_address: address,
                owner_id: userId,
                token_id: idx + 1,
                tx_hash: r.assetId || '',
                attributes: [
                  { trait_type: 'Pack', value: pack.name },
                  { trait_type: 'Category', value: pack.category },
                  { trait_type: 'Asset Type', value: 'cNFT' },
                ],
                is_revealed: true,
              };
            });

          if (nftRecords.length > 0) {
            await supabase.from('minted_nfts').insert(nftRecords);
          }
        }

        const failCount = results.filter((r) => !r.success).length;
        if (failCount === 0) {
          toast.success(
            `Pack purchased! ${successCount} on-chain assets minted to your wallet.`,
            { id: 'pack-purchase' },
          );
        } else {
          toast.warning(
            `${successCount} minted, ${failCount} failed. Check My NFTs.`,
            { id: 'pack-purchase' },
          );
        }

        return results;
      } catch (err: any) {
        console.error('Pack purchase failed:', err);
        if (isUserRejection(err)) {
          toast.error('Transaction cancelled', { id: 'pack-purchase' });
        } else {
          toast.error(getErrorMessage(err) || 'Purchase failed', {
            id: 'pack-purchase',
          });
        }
        return results;
      } finally {
        setIsMinting(false);
        setTransactionPending(false);
      }
    },
    [address, isConnected, network, getSolanaProvider, mintCompressedCore, setTransactionPending],
  );

  return {
    // Admin
    deployPackOnChain,
    uploadStickerToArweave,
    isDeploying,

    // User
    purchasePackOnChain,
    isMinting,
    mintProgress,
  };
}
