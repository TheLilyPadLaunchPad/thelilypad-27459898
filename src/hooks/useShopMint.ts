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
} from '@/integrations/arweave/legacyClient';
import { supabase } from '@/integrations/supabase/client';
import { buildMetaplexMetadata } from '@/lib/metaplexMetadata';
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
  opts?: { description?: string; displayOrder?: number; externalUrl?: string },
) {
  return buildMetaplexMetadata({
    name: itemName,
    description: opts?.description || `${itemName} from the ${packName} pack`,
    image: imageUri,
    externalUrl: opts?.externalUrl,
    attributes: [
      { trait_type: 'Pack', value: packName },
      { trait_type: 'Category', value: category },
      { trait_type: 'Type', value: category.replace('_pack', '').replace('_', ' ') },
      ...(opts?.displayOrder != null
        ? [{ trait_type: 'Display Order', value: String(opts.displayOrder) }]
        : []),
    ],
    collection: { name: packName },
  });
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
  const [pendingDelivery, setPendingDelivery] = useState<
    { packId: string; paymentSignature: string } | null
  >(null);

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
        // NOTE: the collection + tree are created by the PLATFORM mint
        // authority (server side), never by the admin's personal wallet —
        // otherwise buyers' packs could never be minted for them.
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
        const collectionMeta = buildMetaplexMetadata({
          name: pack.name,
          description: `On-chain asset pack: ${pack.name}`,
          image: coverUri,
          creators: [],
        });
        const metadataUri = await uploadMetadataToArweave(collectionMeta, {
          address,
          chainType: 'solana',
          network: network || 'devnet',
        });

        // 3. Deploy Core Collection + Bubblegum tree under the platform
        //    mint authority (server side).
        toast.loading('Deploying collection + tree…', { id: 'deploy-pack' });
        const { data, error } = await supabase.functions.invoke('mint-pack-assets', {
          body: { action: 'deploy', packId: pack.id, metadataUri },
        });
        if (error) throw new Error(error.message);
        if (!data?.ok) throw new Error(data?.error || 'Pack deployment failed');

        const collectionAddress: string = data.collectionAddress;
        const treeAddress: string = data.treeAddress;

        // 4. Keep the Arweave cover on the pack record
        if (coverUri && coverUri !== pack.image_url) {
          await supabase.from('shop_items').update({ image_url: coverUri }).eq('id', pack.id);
        }

        toast.success('Pack deployed on-chain!', { id: 'deploy-pack' });
        return { collectionAddress, treeAddress };
      } catch (err: unknown) {
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
      let paymentSignature: string | undefined;

      try {
        const skipPayment = options?.skipPayment === true;

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
          paymentSignature = await connection.sendRawTransaction(signed.serialize());
          await connection.confirmTransaction(
            { signature: paymentSignature, blockhash, lastValidBlockHeight },
            'confirmed',
          );

          toast.loading('Payment confirmed! Minting assets…', { id: 'pack-purchase' });
        }


        // ── Step 2: Deliver — the platform mint authority signs the mints
        //    server side (the buyer owns neither the tree nor the collection).
        toast.loading('Minting assets to your wallet…', { id: 'pack-purchase' });

        const { data, error } = await supabase.functions.invoke('mint-pack-assets', {
          body: {
            action: 'mint',
            packId: pack.id,
            buyerWallet: address,
            paymentSignature,
          },
        });

        if (error) throw new Error(error.message);
        if (!data?.ok) throw new Error(data?.error || 'Delivery failed');

        const serverResults: Array<{
          success: boolean;
          contentId: string;
          signature?: string;
          error?: string;
        }> = data.results ?? [];

        for (const r of serverResults) {
          results.push({
            success: r.success,
            contentId: r.contentId,
            assetId: r.signature,
            signature: r.signature,
            error: r.error,
          });
        }
        setMintProgress({ done: results.length, total: mintableContents.length });

        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;

        if (failCount === 0) {
          toast.success(
            `Pack purchased! ${successCount} on-chain assets minted to your wallet.`,
            { id: 'pack-purchase' },
          );
        } else {
          toast.warning(
            `${successCount} of ${results.length} delivered. The rest will be retried — your payment is saved.`,
            { id: 'pack-purchase' },
          );
        }

        return results;
      } catch (err: unknown) {
        console.error('Pack purchase failed:', err);
        if (isUserRejection(err)) {
          toast.error('Transaction cancelled', { id: 'pack-purchase' });
        } else if (paymentSignature) {
          setPendingDelivery({ packId: pack.id, paymentSignature });
          toast.error(
            'Payment went through but delivery failed. Your payment is saved — tap retry to receive your items.',
            { id: 'pack-purchase' },
          );
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
    [address, isConnected, network, getSolanaProvider, setTransactionPending],
  );

  // ── User: retry a paid-but-undelivered pack ─────────────────────────────

  /**
   * Re-runs delivery for a payment that already settled. Safe to call repeatedly:
   * the backend refuses to mint the same payment twice.
   */
  const retryPackDelivery = useCallback(
    async (packId: string, paymentSignature?: string) => {
      if (!address) {
        toast.error('Please connect your wallet');
        return false;
      }
      setIsMinting(true);
      try {
        toast.loading('Retrying delivery…', { id: 'pack-retry' });
        const { data, error } = await supabase.functions.invoke('mint-pack-assets', {
          body: { action: 'mint', packId, buyerWallet: address, paymentSignature },
        });
        if (error) throw new Error(error.message);
        if (!data?.ok) throw new Error(data?.error || 'Delivery failed');

        const delivered = data.alreadyDelivered || data.deliveryStatus === 'delivered';
        if (delivered) {
          setPendingDelivery(null);
          toast.success('Your pack items are in your wallet.', { id: 'pack-retry' });
          return true;
        }
        toast.warning('Still not fully delivered — please try again shortly.', { id: 'pack-retry' });
        return false;
      } catch (err: unknown) {
        toast.error(getErrorMessage(err) || 'Retry failed', { id: 'pack-retry' });
        return false;
      } finally {
        setIsMinting(false);
      }
    },
    [address],
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
