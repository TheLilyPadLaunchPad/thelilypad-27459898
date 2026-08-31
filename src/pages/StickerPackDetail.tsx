import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Sticker, Loader2, ShoppingCart, Check, Sparkles, AlertCircle, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSEO } from "@/hooks/useSEO";
import { useWallet } from "@/providers/WalletProvider";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useMockMode } from "@/hooks/useMockMode";
import {
  Connection,
  PublicKey,
} from "@solana/web3.js";
import { TREASURY_CONFIG } from "@/config/treasury";
import { PLATFORM_WALLETS } from "@/config/treasury";
import { getSolanaRpcUrl, type NetworkType } from "@/config/solana";
import { buildStickerPackPurchaseTx } from "@/chains/solana/shop";
import { useShopMint } from "@/hooks/useShopMint";

interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_mon: number;
  price_sol?: number | null;
  category: string;
  tier: string;
  total_sales: number;
  max_editions?: number | null;
  creator_id: string;
  is_active: boolean;
  created_at: string;
  collection_id?: string | null;
  collection_address?: string | null;
  tree_address?: string | null;
}


interface StickerContent {
  id: string;
  item_id: string;
  name: string;
  file_url: string;
  display_order: number;
  created_at: string;
  arweave_uri?: string | null;
  metadata_uri?: string | null;
}

export default function StickerPackDetail() {
  const { packId } = useParams<{ packId: string }>();
  const navigate = useNavigate();
  const { isConnected, address, getSolanaProvider, network } = useWallet();
  const { profile, loading: profileLoading } = useUserProfile();
  const { isMockMode } = useMockMode();
  const { purchasePackOnChain, isMinting } = useShopMint();
  // Prefer auth.users ID if available (for standard auth), otherwise profile ID (for wallet-only)
  const userId = profile?.user_id || profile?.id || null;

  const [pack, setPack] = useState<ShopItem | null>(null);
  const [stickers, setStickers] = useState<StickerContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [parentCollection, setParentCollection] = useState<{ id: string; name: string } | null>(null);


  useSEO({
    title: pack ? `${pack.name} | The Lily Pad` : "Sticker Pack | The Lily Pad",
    description: pack?.description || "View this sticker pack on The Lily Pad marketplace.",
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!packId) return;

      setIsLoading(true);
      try {
        // Fetch pack details
        const { data: packData, error: packError } = await supabase
          .from("shop_items")
          .select("*")
          .eq("id", packId)
          .maybeSingle();

        if (packError) {
          console.error("Error fetching pack:", packError);
          toast.error("Failed to load sticker pack");
          return;
        }

        if (!packData) {
          toast.error("Sticker pack not found");
          navigate("/marketplace");
          return;
        }

        setPack(packData);

        // Funnel context: which launch collection this pack belongs to
        const parentId = (packData as { collection_id?: string | null }).collection_id;
        if (parentId) {
          const { data: parent } = await supabase
            .from("collections")
            .select("id, name")
            .eq("id", parentId)
            .maybeSingle();
          setParentCollection(parent ?? null);
        } else {
          setParentCollection(null);
        }


        // Fetch stickers in the pack
        const { data: stickersData, error: stickersError } = await supabase
          .from("shop_item_contents")
          .select("*")
          .eq("item_id", packId)
          .order("display_order", { ascending: true });

        if (stickersError) {
          console.error("Error fetching stickers:", stickersError);
        } else {
          setStickers(stickersData || []);
        }

        // Check if user has already purchased
        if (userId) {
          const { data: purchaseData } = await supabase
            .from("shop_purchases")
            .select("id")
            .eq("item_id", packId)
            .eq("user_id", userId)
            .maybeSingle();

          setHasPurchased(!!purchaseData);
        } else {
          setHasPurchased(false);
        }
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    // Wait for profile resolution when wallet is connected
    if (isConnected && profileLoading) return;

    fetchData();
  }, [packId, userId, isConnected, profileLoading, navigate]);
  const handlePurchase = async () => {
    if (!isConnected) {
      toast.error("Please connect your wallet to purchase");
      navigate("/auth");
      return;
    }

    if (!pack) return;

    // Free sticker pack — still mint on-chain when the pack is deployed
    if (pack.price_mon <= 0) {
      setIsPurchasing(true);
      try {
        // Prefer auth user_id, fallback to profile id for wallet-only
        const purchaseUserId = profile?.user_id || profile?.id;

        if (!purchaseUserId) {
          throw new Error("User profile not found. Please connect your wallet.");
        }

        const freeDeliverable = stickers.filter((s) => s.metadata_uri);
        if (pack.collection_address && pack.tree_address && freeDeliverable.length > 0) {
          const results = await purchasePackOnChain(
            {
              id: pack.id,
              name: pack.name,
              description: pack.description,
              image_url: pack.image_url,
              category: pack.category,
              price_sol: 0,
              price_mon: 0,
              collection_address: pack.collection_address,
              tree_address: pack.tree_address,
            },
            freeDeliverable.map((s) => ({
              id: s.id,
              name: s.name,
              file_url: s.file_url,
              arweave_uri: s.arweave_uri ?? undefined,
              metadata_uri: s.metadata_uri ?? undefined,
              display_order: s.display_order,
            })),
            purchaseUserId,
            { skipPayment: true },
          );

          if (results.some((r) => r.success)) setHasPurchased(true);
          return;
        }


        const { error } = await supabase.from("shop_purchases").insert({
          item_id: pack.id,
          user_id: purchaseUserId,
          price_paid: 0,
          currency: "SOL",
          tx_hash: "free_claim",
        });

        if (error) {
          if (error.code === "23505") {
            toast.error("You already own this sticker pack!");
            setHasPurchased(true);
          } else {
            throw error;
          }
          return;
        }

        setHasPurchased(true);
        toast.success("Sticker pack claimed successfully!");
      } catch (err: any) {
        console.error("Claim error:", err);
        toast.error(err.message || "Failed to claim sticker pack");
      } finally {
        setIsPurchasing(false);
      }
      return;
    }

    // Paid sticker pack
    setIsPurchasing(true);
    try {
      const purchaseUserId = profile?.user_id || profile?.id;

      if (!purchaseUserId) {
        throw new Error("User profile not found. Please connect your wallet.");
      }

      let txSignature = "";

      if (isMockMode) {
        // Native Token flow
        const balance = Number(profile.native_token_balance || 0);
        if (balance < pack.price_mon) {
          throw new Error(`Insufficient LPT balance. You need ${pack.price_mon} LPT.`);
        }

        // Deduct from buyer
        const { error: deductError } = await supabase
          .from("user_profiles")
          .update({ native_token_balance: balance - pack.price_mon })
          .eq("id", purchaseUserId);

        if (deductError) throw deductError;

        // Record buyer transaction
        await supabase.from("token_transactions").insert({
          user_id: purchaseUserId,
          amount: -pack.price_mon,
          transaction_type: "purchase",
          reference_id: pack.id,
        });

        // Add to creator
        if (pack.creator_id) {
          const { data: creatorData } = await supabase
            .from("user_profiles")
            .select("native_token_balance")
            .eq("id", pack.creator_id)
            .maybeSingle();
            
          if (creatorData) {
            const currentCreatorBalance = Number(creatorData.native_token_balance || 0);
            await supabase
              .from("user_profiles")
              .update({ native_token_balance: currentCreatorBalance + pack.price_mon })
              .eq("id", pack.creator_id);

            // Record creator transaction
            await supabase.from("token_transactions").insert({
              user_id: pack.creator_id,
              amount: pack.price_mon,
              transaction_type: "sale",
              reference_id: pack.id,
            });
          }
        }
        
        txSignature = `mock_lpt_purchase_${Date.now()}`;
      } else {
        const priceSol = pack.price_sol ?? pack.price_mon;

        // Deployed on-chain → pay SOL and mint the pack contents as cNFTs
        // straight into the buyer's wallet (handles payment + DB records).
        const deliverable = stickers.filter((s) => s.metadata_uri);
        if (pack.collection_address && pack.tree_address && deliverable.length > 0) {
          const results = await purchasePackOnChain(
            {
              id: pack.id,
              name: pack.name,
              description: pack.description,
              image_url: pack.image_url,
              category: pack.category,
              price_sol: priceSol,
              price_mon: pack.price_mon,
              collection_address: pack.collection_address,
              tree_address: pack.tree_address,
            },
            deliverable.map((s) => ({
              id: s.id,
              name: s.name,
              file_url: s.file_url,
              arweave_uri: s.arweave_uri ?? undefined,
              metadata_uri: s.metadata_uri ?? undefined,
              display_order: s.display_order,
            })),
            purchaseUserId,
          );

          if (!results.some((r) => r.success)) return;
          setHasPurchased(true);
          return;
        }

        // Deployed on-chain but nothing mintable → don't take money for
        // assets we can't deliver to the wallet.
        if (pack.collection_address && pack.tree_address) {
          throw new Error(
            "This pack's items aren't ready for on-chain delivery yet. Please try again later.",
          );
        }

        // Not deployed on-chain → settle the SOL payment with the creator
        // split + platform fee, then record the entitlement.

        const solanaProvider = getSolanaProvider();
        if (!solanaProvider?.publicKey) {
          throw new Error("Solana wallet not available");
        }

        const rpcUrl = getSolanaRpcUrl(network as NetworkType);
        const connection = new Connection(rpcUrl, "confirmed");
        const fromPubkey = new PublicKey(address!);

        // Resolve creator payout wallet, fall back to treasury
        let creatorWallet = TREASURY_CONFIG.treasuryWallet || PLATFORM_WALLETS.solana.treasury;
        if (pack.creator_id) {
          const { data: creatorProfile } = await supabase
            .from("user_profiles")
            .select("wallet_address")
            .eq("id", pack.creator_id)
            .maybeSingle();
          if (creatorProfile?.wallet_address) {
            try {
              new PublicKey(creatorProfile.wallet_address);
              creatorWallet = creatorProfile.wallet_address;
            } catch {
              /* keep treasury fallback */
            }
          }
        }

        const transaction = buildStickerPackPurchaseTx(
          fromPubkey,
          creatorWallet,
          priceSol,
          pack.id,
        );

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = fromPubkey;

        const signedTx = await solanaProvider.signTransaction(transaction);
        txSignature = await connection.sendRawTransaction(signedTx.serialize());
        await connection.confirmTransaction(
          { signature: txSignature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
      }

      const { error } = await supabase.from("shop_purchases").insert({
        item_id: pack.id,
        user_id: purchaseUserId,
        price_paid: pack.price_sol ?? pack.price_mon,
        currency: isMockMode ? "LPT" : "SOL",
        tx_hash: txSignature,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error("You already own this sticker pack!");
          setHasPurchased(true);
        } else {
          throw error;
        }
        return;
      }

      setHasPurchased(true);
      toast.success("Sticker pack purchased successfully!");
    } catch (err: any) {
      console.error("Purchase error:", err);
      if (err.message?.includes("User rejected")) {
        toast.error("Transaction cancelled");
      } else {
        toast.error(err.message || "Failed to complete purchase");
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const tierColors: Record<string, string> = {
    basic: "bg-muted text-muted-foreground border-border",
    premium: "bg-primary/20 text-primary border-primary/30",
    exclusive: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="text-center py-20">
            <Sticker className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Sticker pack not found</h2>
            <Button onClick={() => navigate("/marketplace")} variant="outline">
              Back to Marketplace
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 pt-24 pb-24 md:pb-12">
        {/* Breadcrumb Navigation */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" className="hover:text-primary transition-colors">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/marketplace" className="hover:text-primary transition-colors">Marketplace</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            {parentCollection && (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      to={`/collection/${parentCollection.id}`}
                      className="hover:text-primary transition-colors truncate max-w-[160px]"
                    >
                      {parentCollection.name}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            )}

            <BreadcrumbItem>
              <BreadcrumbPage className="truncate max-w-[200px]">{pack.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Pack Info */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <div className="aspect-square relative overflow-hidden bg-muted rounded-t-lg">
                {pack.image_url ? (
                  <img
                    src={pack.image_url}
                    alt={pack.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                    <Sticker className="w-20 h-20 text-primary" />
                  </div>
                )}
                <Badge
                  variant="outline"
                  className={`absolute top-3 right-3 ${tierColors[pack.tier] || tierColors.basic}`}
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  {pack.tier.charAt(0).toUpperCase() + pack.tier.slice(1)}
                </Badge>
              </div>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <h1 className="text-2xl font-bold mb-2">{pack.name}</h1>
                  {pack.description && (
                    <p className="text-muted-foreground">{pack.description}</p>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Stickers</span>
                    <span className="font-medium">{stickers.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Sales</span>
                    <span className="font-medium">{pack.total_sales} {pack.max_editions ? `/ ${pack.max_editions}` : ''}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-bold text-lg">
                      {pack.price_mon > 0 ? `${pack.price_sol ?? pack.price_mon} SOL` : "Free"}
                    </span>
                  </div>
                </div>

                <Separator />

                {pack.max_editions && pack.total_sales >= pack.max_editions ? (
                  <Button disabled className="w-full gap-2" variant="destructive">
                    <AlertCircle className="w-4 h-4" />
                    Sold Out
                  </Button>
                ) : hasPurchased ? (
                  <Button disabled className="w-full gap-2" variant="secondary">
                    <Check className="w-4 h-4" />
                    Owned
                  </Button>
                ) : (
                  <Button
                    onClick={handlePurchase}
                    disabled={isPurchasing || isMinting}
                    className="w-full gap-2"
                  >
                    {isPurchasing || isMinting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isMockMode ? (
                      <Coins className="w-4 h-4" />
                    ) : (
                      <ShoppingCart className="w-4 h-4" />
                    )}
                    {isMockMode ? (
                      pack.price_mon > 0 ? `Buy for ${pack.price_mon} LPT` : "Get for Free"
                    ) : (
                      pack.price_mon > 0 ? `Buy for ${pack.price_sol ?? pack.price_mon} SOL` : "Get for Free"
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stickers Grid */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <Sticker className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Stickers in this Pack</h2>
              <Badge variant="secondary">{stickers.length}</Badge>
            </div>

            {stickers.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {stickers.map((sticker) => (
                  <Card
                    key={sticker.id}
                    className="overflow-hidden hover:border-primary/50 transition-colors group"
                  >
                    <div className="aspect-square relative overflow-hidden bg-muted p-4">
                      <img
                        src={sticker.file_url}
                        alt={sticker.name}
                        className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300"
                      />
                    </div>
                    <CardContent className="p-3">
                      <p className="text-sm font-medium truncate text-center">{sticker.name}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border border-dashed rounded-lg">
                <Sticker className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No stickers in this pack yet
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
