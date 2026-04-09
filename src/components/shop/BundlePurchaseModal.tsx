import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/providers/WalletProvider";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useShopMint, type PackContentItem, type OnChainPack } from "@/hooks/useShopMint";
import { toast } from "sonner";
import {
  Package,
  Loader2,
  Check,
  Wallet,
  ShoppingCart,
  Percent,
  Gift,
  Sparkles,
  AlertCircle,
  ExternalLink,
  Info,
  Globe,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isUserRejection, getErrorMessage } from "@/lib/errorUtils";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { getSolanaRpcUrl } from "@/config/solana";
import { createProtocolMemoInstruction } from "@/lib/solanaProtocol";
import { PLATFORM_WALLETS } from "@/config/treasury";

// Platform treasury address for receiving bundle payments (Solana)
const PLATFORM_TREASURY_ADDRESS = PLATFORM_WALLETS.solana.treasury;

interface BundleItem {
  id: string;
  bundle_id: string;
  item_id: string;
  shop_items: {
    id: string;
    name: string;
    image_url: string | null;
    category: string;
    price_mon: number;
    price_sol?: number | null;
    collection_address?: string | null;
    tree_address?: string | null;
  };
}

interface Bundle {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  discount_percent: number;
  original_price: number;
  bundle_price: number;
  bundle_price_sol?: number;
}

interface BundlePurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle: Bundle;
  bundleItems: BundleItem[];
  onPurchaseComplete?: () => void;
}

export const BundlePurchaseModal: React.FC<BundlePurchaseModalProps> = ({
  open,
  onOpenChange,
  bundle,
  bundleItems,
  onPurchaseComplete,
}) => {
  const navigate = useNavigate();
  const {
    address,
    isConnected,
    connect,
    balance,
    network,
    getSolanaProvider,
    setTransactionPending,
  } = useWallet();
  const { profile, loading: profileLoading } = useUserProfile();
  const { purchasePackOnChain, isMinting, mintProgress } = useShopMint();
  const userId = profile?.id ?? null;

  const [isPurchasing, setIsPurchasing] = useState(false);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [ownedItems, setOwnedItems] = useState<string[]>([]);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [purchaseStep, setPurchaseStep] = useState<
    "idle" | "confirming" | "processing" | "minting" | "complete"
  >("idle");

  // Price in SOL (use bundle_price_sol if available, otherwise convert from price_mon)
  const priceInSol = bundle.bundle_price_sol || bundle.bundle_price * 0.01;

  // Check if any items in this bundle are on-chain (have collection + tree deployed)
  const hasOnChainItems = bundleItems.some(
    (bi) => bi.shop_items.collection_address && bi.shop_items.tree_address
  );

  useEffect(() => {
    const checkExistingPurchases = async () => {
      if (!open) return;
      // If wallet is connected, wait for profile to resolve so userId is stable
      if (isConnected && profileLoading) return;
      if (!userId) return;

      // Check if user already owns the bundle
      const { data: bundlePurchase } = await supabase
        .from("shop_bundle_purchases")
        .select("id")
        .eq("bundle_id", bundle.id)
        .eq("user_id", userId)
        .maybeSingle();

      if (bundlePurchase) {
        setHasPurchased(true);
      }

      // Check which individual items user already owns
      const itemIds = bundleItems.map((bi) => bi.item_id);
      const { data: purchases } = await supabase
        .from("shop_purchases")
        .select("item_id")
        .eq("user_id", userId)
        .in("item_id", itemIds);

      if (purchases) {
        setOwnedItems(purchases.map((p) => p.item_id));
      }
    };

    checkExistingPurchases();
  }, [userId, isConnected, profileLoading, open, bundle.id, bundleItems]);

  const handlePurchase = async () => {
    if (!isConnected || !address) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!userId) {
      toast.error("Please complete your profile to purchase");
      navigate("/profile-setup");
      return;
    }

    const userBalance = parseFloat(balance || "0");
    if (userBalance < priceInSol) {
      toast.error(`Insufficient balance. You need ${priceInSol.toFixed(4)} SOL`);
      return;
    }

    setIsPurchasing(true);
    setPurchaseStep("confirming");
    // Mark transaction as pending to prevent ProtectedRoute redirect during signing
    setTransactionPending(true);

    try {
      const provider = getSolanaProvider();
      if (!provider || !provider.publicKey) {
        throw new Error("Solana wallet not connected");
      }

      setPurchaseStep("processing");

      // Create Solana transaction
      const connection = new Connection(getSolanaRpcUrl(network), 'confirmed');
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: provider.publicKey,
          toPubkey: new PublicKey(PLATFORM_TREASURY_ADDRESS),
          lamports: Math.floor(priceInSol * LAMPORTS_PER_SOL),
        })
      );

      // Add protocol memo for on-chain identification
      transaction.add(createProtocolMemoInstruction('shop:bundle_purchase', {
        bundle: bundle.id.slice(0, 8),
      }));

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = provider.publicKey;

      const signed = await provider.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      setTxHash(signature);

      // Prefer auth user_id, fallback to profile id for wallet-only
      const purchaseUserId = profile?.user_id || profile?.id;

      if (!purchaseUserId) {
        throw new Error("User profile not found. Please connect your wallet.");
      }

      const { error: purchaseError } = await supabase
        .from("shop_bundle_purchases")
        .insert({
          bundle_id: bundle.id,
          user_id: purchaseUserId,
          price_paid: priceInSol,
          tx_hash: signature,
          currency: "SOL",
        });

      if (purchaseError) throw purchaseError;

      // Add individual items to user's purchases
      const itemPurchases = bundleItems.map(bi => ({
        item_id: bi.item_id,
        user_id: purchaseUserId,
        price_paid: 0, // Part of bundle
        tx_hash: signature,
        currency: "SOL",
      }));

      await supabase.from("shop_purchases").insert(itemPurchases);

      // ── On-chain cNFT minting for items with deployed collections ─────
      if (hasOnChainItems) {
        setPurchaseStep("minting");

        for (const bi of bundleItems) {
          const item = bi.shop_items;
          if (!item.collection_address || !item.tree_address) continue;

          // Fetch sticker contents for this pack that have Arweave metadata
          const { data: contents } = await supabase
            .from("shop_item_contents")
            .select("id, name, file_url, arweave_uri, metadata_uri, display_order")
            .eq("item_id", item.id)
            .order("display_order");

          if (contents && contents.length > 0) {
            const packForMint: OnChainPack = {
              id: item.id,
              name: item.name,
              description: null,
              image_url: item.image_url,
              category: item.category,
              price_sol: 0, // Already paid via bundle
              price_mon: 0,
              collection_address: item.collection_address,
              tree_address: item.tree_address,
            };

            await purchasePackOnChain(
              packForMint,
              contents as PackContentItem[],
              purchaseUserId,
              {
                skipPayment: true,
                skipPurchaseRecord: true,
              },
            );
          }
        }
      }

      setPurchaseStep("complete");
      setHasPurchased(true);

      toast.success(
        hasOnChainItems
          ? "Bundle purchased! On-chain assets minted to your wallet."
          : "Bundle purchased successfully!"
      );
      onPurchaseComplete?.();

    } catch (error: unknown) {
      console.error("Purchase failed:", error);

      if (isUserRejection(error)) {
        toast.error("Transaction cancelled");
      } else {
        toast.error(getErrorMessage(error) || "Failed to complete purchase");
      }

      setPurchaseStep("idle");
    } finally {
      setIsPurchasing(false);
      setTransactionPending(false);
    }
  };

  const explorerUrl = (network === 'mainnet' || network === 'mainnet-beta')
    ? `https://explorer.solana.com/tx/${txHash}`
    : `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            {bundle.name}
          </DialogTitle>
          <DialogDescription>
            {bundle.description || "Get this exclusive bundle at a discounted price"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          {/* Bundle Image */}
          {bundle.image_url && (
            <div className="w-full aspect-video rounded-lg overflow-hidden bg-muted">
              <img
                src={bundle.image_url}
                alt={bundle.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Price Info */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground line-through">
                  ${bundle.original_price.toFixed(2)}
                </div>
                <div className="text-2xl font-bold text-primary">
                  {priceInSol.toFixed(4)} SOL
                </div>
              </div>
              <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                <Percent className="w-3 h-3 mr-1" />
                {bundle.discount_percent}% OFF
              </Badge>
            </div>
          </div>

          {/* Items in Bundle */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Includes:</div>
            <ScrollArea className="h-[150px]">
              <div className="space-y-2">
                {bundleItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg">
                    <div className="w-10 h-10 rounded bg-muted overflow-hidden">
                      {item.shop_items.image_url && (
                        <img
                          src={item.shop_items.image_url}
                          alt={item.shop_items.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{item.shop_items.name}</div>
                      <div className="text-xs text-muted-foreground">{item.shop_items.category}</div>
                    </div>
                    {ownedItems.includes(item.item_id) && (
                      <Badge variant="secondary" className="text-xs">
                        <Check className="w-3 h-3 mr-1" />
                        Owned
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <Separator />

          {/* Purchase Status */}
          {purchaseStep === "complete" && txHash && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-green-500 mb-2">
                <Sparkles className="w-5 h-5" />
                <span className="font-medium">Purchase Complete!</span>
              </div>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                View transaction <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* On-chain minting progress */}
          {purchaseStep === "minting" && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-blue-500">
                <Globe className="w-4 h-4 animate-pulse" />
                <span className="text-sm font-medium">
                  Minting on-chain assets ({mintProgress.done}/{mintProgress.total})
                </span>
              </div>
              <Progress
                value={mintProgress.total > 0 ? (mintProgress.done / mintProgress.total) * 100 : 0}
                className="h-2"
              />
            </div>
          )}

          {/* Action Button */}
          {!isConnected ? (
            <Button className="w-full" onClick={() => connect()}>
              <Wallet className="w-4 h-4 mr-2" />
              Connect Wallet
            </Button>
          ) : hasPurchased ? (
            <Button className="w-full" variant="secondary" onClick={() => navigate("/my-purchases")}>
              <Gift className="w-4 h-4 mr-2" />
              View My Purchases
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={handlePurchase}
              disabled={isPurchasing || isMinting}
            >
              {purchaseStep === "confirming" && (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Confirm in wallet...
                </>
              )}
              {purchaseStep === "processing" && (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing payment...
                </>
              )}
              {purchaseStep === "minting" && (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Minting assets...
                </>
              )}
              {purchaseStep === "idle" && (
                <>
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Purchase for {priceInSol.toFixed(4)} SOL
                  {hasOnChainItems && " + Mint"}
                </>
              )}
            </Button>
          )}

          {/* Balance Info */}
          {isConnected && !hasPurchased && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Your balance:</span>
              <span>{parseFloat(balance || "0").toFixed(4)} SOL</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BundlePurchaseModal;
