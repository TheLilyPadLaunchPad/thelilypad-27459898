import { useCallback } from "react";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { publicKey } from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { addPluginV1, approvePluginAuthorityV1, createPlugin, fetchAsset } from "@metaplex-foundation/mpl-core";
import bs58 from "bs58";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/providers/WalletProvider";
import { getSolanaRpcUrl, initializeUmi } from "@/config/solana";
import { createMemoInstruction } from "@/lib/solanaProtocol";

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("marketplace-purchase", { body });
  if (error) {
    let msg = error.message;
    try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (!data?.ok) throw new Error(data?.error || "Request failed");
  return data;
}

/** Solana secondary marketplace: seller approval + buyer pay & receive. */
export function useSolanaMarketplace() {
  const { network, getSolanaProvider } = useWallet();

  /** Seller approves the marketplace key to move this NFT once it is bought. */
  const approveListing = useCallback(async (assetAddress: string) => {
    const provider = getSolanaProvider();
    if (!provider?.publicKey) throw new Error("Connect your Solana wallet");
    const { delegate } = await call({ action: "config" });
    const umi = initializeUmi(network).use(walletAdapterIdentity({
      publicKey: provider.publicKey,
      signTransaction: provider.signTransaction.bind(provider),
      signAllTransactions: provider.signAllTransactions.bind(provider),
    } as any));
    const asset: any = await fetchAsset(umi, publicKey(assetAddress));
    if (String(asset.owner) !== provider.publicKey.toBase58()) throw new Error("This wallet doesn't own the NFT");
    const collection = asset.updateAuthority?.type === "Collection" ? publicKey(asset.updateAuthority.address) : undefined;
    const authority = { type: "Address" as const, address: publicKey(delegate) };
    const builder = asset.transferDelegate
      ? approvePluginAuthorityV1(umi, { asset: asset.publicKey, collection, plugin: { type: "TransferDelegate" }, newAuthority: authority })
      : addPluginV1(umi, { asset: asset.publicKey, collection, plugin: createPlugin({ type: "TransferDelegate" }), initAuthority: authority });
    const res = await builder.sendAndConfirm(umi);
    return bs58.encode(res.signature);
  }, [getSolanaProvider, network]);

  /** Buyer pays seller/royalty/fee in one tx, then the NFT is sent to their wallet. */
  const buyListing = useCallback(async (listingId: string, onStage?: (s: string) => void) => {
    const provider = getSolanaProvider();
    if (!provider?.publicKey) throw new Error("Connect your Solana wallet");
    const buyer = provider.publicKey.toBase58();
    onStage?.("Checking listing…");
    const quote = await call({ action: "quote", listingId, buyer });

    const connection = new Connection(getSolanaRpcUrl(network || "mainnet"), "confirmed");
    const tx = new Transaction();
    for (const r of quote.recipients) {
      tx.add(SystemProgram.transfer({ fromPubkey: provider.publicKey, toPubkey: new PublicKey(r.address), lamports: BigInt(r.lamports) }));
    }
    tx.add(createMemoInstruction(quote.memo));
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = provider.publicKey;
    onStage?.("Approve payment in your wallet…");
    const signed = await provider.signTransaction(tx);
    const signature = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

    onStage?.("Payment confirmed — sending NFT to your wallet…");
    const settle = (attempt = 0): Promise<any> =>
      call({ action: "settle", listingId, buyer, signature }).catch(async (e) => {
        if (attempt < 2) { await new Promise((r) => setTimeout(r, 2500)); return settle(attempt + 1); }
        throw Object.assign(e, { paymentSignature: signature });
      });
    const done = await settle();
    return { signature, deliveryTx: done.deliveryTx, quote };
  }, [getSolanaProvider, network]);

  const retryDelivery = useCallback(async (listingId: string, signature: string) => {
    const provider = getSolanaProvider();
    if (!provider?.publicKey) throw new Error("Connect your Solana wallet");
    return call({ action: "settle", listingId, buyer: provider.publicKey.toBase58(), signature });
  }, [getSolanaProvider]);

  const getQuote = useCallback(async (listingId: string) => {
    const provider = getSolanaProvider();
    if (!provider?.publicKey) throw new Error("Connect your Solana wallet");
    return call({ action: "quote", listingId, buyer: provider.publicKey.toBase58() });
  }, [getSolanaProvider]);

  return { approveListing, buyListing, retryDelivery, getQuote };
}
