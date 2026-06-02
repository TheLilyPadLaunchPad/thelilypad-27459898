import React, { useState, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Leaf, Sparkles, Sticker, Smile, Image, ShoppingCart, Eye, Crown, Package, Percent, Gift, Timer, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BundlePurchaseModal } from "@/components/shop/BundlePurchaseModal";
import { BundleCountdown } from "@/components/shop/BundleCountdown";

interface OfficialPack {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string;
  tier: string;
  price_mon: number;
  total_sales: number;
  max_editions?: number | null;
  created_at: string;
}

interface Bundle {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  discount_percent: number;
  original_price: number;
  bundle_price: number;
  is_limited_time: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface BundleItem {
  id: string;
  bundle_id: string;
  item_id: string;
  shop_items: OfficialPack;
}

const OfficialPacks: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);

  const { data: packs = [], isLoading } = useQuery({
    queryKey: ['official-packs-shop'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_items")
        .select("*")
        .eq("creator_type", "platform")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as OfficialPack[];
    }
  });

  const { data: bundles = [], isLoading: bundlesLoading } = useQuery({
    queryKey: ['official-bundles-shop'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_bundles")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Bundle[];
    }
  });

  // Filter bundles: show active ones that haven't expired and have started (or have no time limit)
  const activeBundles = useMemo(() => {
    const now = Date.now();
    return bundles.filter(bundle => {
      if (!bundle.is_limited_time) return true;

      // Check if started (or no start date)
      if (bundle.starts_at && new Date(bundle.starts_at).getTime() > now) {
        // Not started yet - still show it with "Coming Soon" badge
        return true;
      }

      // Check if expired
      if (bundle.expires_at && new Date(bundle.expires_at).getTime() <= now) {
        return false; // Expired, don't show
      }

      return true;
    });
  }, [bundles]);

  const { data: bundleItemsMap = {} } = useQuery({
    queryKey: ['bundle-items-map', bundles.map(b => b.id)],
    queryFn: async () => {
      if (bundles.length === 0) return {};

      const { data, error } = await supabase
        .from("shop_bundle_items")
        .select("*, shop_items(*)")
        .in("bundle_id", bundles.map(b => b.id));

      if (error) throw error;

      const map: Record<string, BundleItem[]> = {};
      (data as BundleItem[]).forEach(item => {
        if (!map[item.bundle_id]) map[item.bundle_id] = [];
        map[item.bundle_id].push(item);
      });
      return map;
    },
    enabled: bundles.length > 0
  });

  const filteredPacks = packs.filter(pack => {
    if (activeTab === "all") return true;
    return pack.category === activeTab;
  });

  const lilyPadPacks = filteredPacks.filter(p => p.name.toLowerCase().includes("lily") || p.name.toLowerCase().includes("frog"));
  const otherPacks = filteredPacks.filter(p => !p.name.toLowerCase().includes("lily") && !p.name.toLowerCase().includes("frog"));

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "sticker_pack": return <Sticker className="w-4 h-4" />;
      case "emote_pack": return <Smile className="w-4 h-4" />;
      case "emoji_pack": return <Image className="w-4 h-4" />;
      default: return <Sticker className="w-4 h-4" />;
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "premium":
        return <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0"><Crown className="w-3 h-3 mr-1" />Premium</Badge>;
      case "exclusive":
        return <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0"><Sparkles className="w-3 h-3 mr-1" />Exclusive</Badge>;
      default:
        return <Badge variant="secondary">Basic</Badge>;
    }
  };

  const PackCard = ({ pack }: { pack: OfficialPack }) => (
    <Card
      className="group overflow-hidden hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 cursor-pointer border-border/50 hover:border-primary/30"
      onClick={() => navigate(`/marketplace/sticker/${pack.id}`)}
    >
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-primary/10 to-secondary/10">
        {pack.image_url ? (
          <img
            src={pack.image_url}
            alt={pack.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {getCategoryIcon(pack.category)}
          </div>
        )}

        {/* Official Badge Overlay */}
        <div className="absolute top-2 left-2 z-20">
          <Badge className="bg-primary/90 text-primary-foreground border-0 gap-1">
            <Leaf className="w-3 h-3" />
            Official
          </Badge>
        </div>

        {/* Sold Out Overlay */}
        {pack.max_editions && pack.total_sales >= pack.max_editions && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 pointer-events-none">
            <Badge variant="destructive" className="text-lg py-1 px-4">Sold Out</Badge>
          </div>
        )}

        {/* Price Overlay */}
        <div className="absolute bottom-2 right-2">
          <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm font-bold">
            {pack.price_mon > 0 ? `${pack.price_mon} USDC` : "FREE"}
          </Badge>
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">
            {pack.name}
          </h3>
          {getTierBadge(pack.tier)}
        </div>

        {pack.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {pack.description}
          </p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            {getCategoryIcon(pack.category)}
            <span className="capitalize">{pack.category.replace("_", " ")}</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <ShoppingCart className="w-3 h-3" />
            {pack.max_editions ? `${pack.total_sales} / ${pack.max_editions} sold` : `${pack.total_sales} sold`}
          </div>
        </div>

        <Button className="w-full gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          <Eye className="w-4 h-4" />
          View Pack
        </Button>
      </CardContent>
    </Card>
  );

  const handleBundleClick = (bundle: Bundle) => {
    setSelectedBundle(bundle);
    setPurchaseModalOpen(true);
  };

  const handlePurchaseComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['official-bundles-shop'] });
  };

  const BundleCard = ({ bundle }: { bundle: Bundle }) => {
    const items = bundleItemsMap[bundle.id] || [];
    const savings = bundle.original_price - bundle.bundle_price;

    // Check if this is a "coming soon" bundle
    const isNotStarted = bundle.is_limited_time && bundle.starts_at &&
      new Date(bundle.starts_at).getTime() > Date.now();

    return (
      <Card className={`group overflow-hidden transition-all duration-300 border-2 bg-gradient-to-br from-primary/5 to-secondary/5 ${bundle.is_limited_time
          ? "border-amber-500/30 hover:border-amber-500/60 hover:shadow-xl hover:shadow-amber-500/10"
          : "border-primary/20 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10"
        }`}>
        <div className="relative p-6">
          {/* Badges */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
            <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 gap-1 text-sm">
              <Percent className="w-3 h-3" />
              {bundle.discount_percent}% OFF
            </Badge>
            {bundle.is_limited_time && (
              <BundleCountdown
                startsAt={bundle.starts_at}
                expiresAt={bundle.expires_at}
                isLimitedTime={bundle.is_limited_time}
                variant="badge"
              />
            )}
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className={`p-3 rounded-xl ${bundle.is_limited_time ? "bg-amber-500/20" : "bg-primary/20"}`}>
              {bundle.is_limited_time ? (
                <Timer className="w-8 h-8 text-amber-500" />
              ) : (
                <Package className="w-8 h-8 text-primary" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-xl">{bundle.name}</h3>
              <p className="text-sm text-muted-foreground">
                {bundle.is_limited_time ? "Limited Time Deal" : "Bundle Deal"}
              </p>
            </div>
          </div>

          {bundle.description && (
            <p className="text-muted-foreground mb-4">
              {bundle.description}
            </p>
          )}

          {/* Included Packs Preview */}
          {items.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium mb-2 flex items-center gap-1">
                <Gift className="w-4 h-4" />
                Includes {items.length} packs:
              </p>
              <div className="flex flex-wrap gap-2">
                {items.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 bg-muted/50 rounded-lg p-2"
                  >
                    {item.shop_items.image_url ? (
                      <img
                        src={item.shop_items.image_url}
                        alt={item.shop_items.name}
                        className="w-8 h-8 rounded object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                        {getCategoryIcon(item.shop_items.category)}
                      </div>
                    )}
                    <span className="text-sm font-medium line-clamp-1">
                      {item.shop_items.name}
                    </span>
                  </div>
                ))}
                {items.length > 4 && (
                  <div className="flex items-center justify-center px-3 py-2 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">
                      +{items.length - 4} more
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Limited Time Countdown - Full Display */}
          {bundle.is_limited_time && !isNotStarted && (
            <div className="mb-4">
              <BundleCountdown
                startsAt={bundle.starts_at}
                expiresAt={bundle.expires_at}
                isLimitedTime={bundle.is_limited_time}
                variant="full"
              />
            </div>
          )}

          {/* Pricing */}
          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">Original Price:</span>
              <span className="text-lg line-through text-muted-foreground">{bundle.original_price} USDC</span>
            </div>
            <div className="flex justify-between items-center mb-2 text-green-600">
              <span className="text-sm">You Save:</span>
              <span className="font-medium">{savings.toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span className="font-semibold">Bundle Price:</span>
              <span className="text-2xl font-bold text-primary">{bundle.bundle_price} USDC</span>
            </div>
          </div>

          {isNotStarted ? (
            <Button
              className="w-full gap-2 h-12 text-lg"
              variant="secondary"
              disabled
            >
              <Clock className="w-5 h-5" />
              Coming Soon
            </Button>
          ) : (
            <Button
              className="w-full gap-2 h-12 text-lg"
              onClick={() => handleBundleClick(bundle)}
            >
              <ShoppingCart className="w-5 h-5" />
              Get Bundle
            </Button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 pt-28 pb-12">
        {/* Hero Section */}
        <div className="relative mb-12 rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 via-secondary/10 to-accent/20 p-8 md:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(var(--primary-rgb),0.15),transparent_50%)]" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-primary/20 backdrop-blur-sm">
                <Leaf className="w-8 h-8 text-primary" />
              </div>
              <div className="p-3 rounded-xl bg-secondary/20 backdrop-blur-sm">
                <Sparkles className="w-8 h-8 text-secondary-foreground" />
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3">
              Official Lily Pad & Frognad Packs
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Exclusive sticker packs, emotes, and emojis created by The Lily Pad team.
              Show your support and express yourself with our official collection!
            </p>
          </div>
        </div>

        {/* Bundle Deals Section */}
        {!bundlesLoading && activeBundles.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-6">
              <Package className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold">Bundle Deals</h2>
              <Badge className="bg-green-500/20 text-green-600 border-green-500/30">Save More</Badge>
              {activeBundles.some(b => b.is_limited_time) && (
                <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 gap-1">
                  <Timer className="w-3 h-3" />
                  Limited Time
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeBundles.map((bundle) => (
                <BundleCard key={bundle.id} bundle={bundle} />
              ))}
            </div>
          </section>
        )}

        {/* Category Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
          <TabsList className="grid w-full max-w-md grid-cols-4 mx-auto">
            <TabsTrigger value="all" className="gap-1">
              <Sparkles className="w-4 h-4" />
              All
            </TabsTrigger>
            <TabsTrigger value="sticker_pack" className="gap-1">
              <Sticker className="w-4 h-4" />
              Stickers
            </TabsTrigger>
            <TabsTrigger value="emote_pack" className="gap-1">
              <Smile className="w-4 h-4" />
              Emotes
            </TabsTrigger>
            <TabsTrigger value="emoji_pack" className="gap-1">
              <Image className="w-4 h-4" />
              Emoji
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-square" />
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredPacks.length === 0 && bundles.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted mb-6">
              <Sticker className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">No Packs Available</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Official packs are coming soon! Check back later for exclusive
              Lily Pad and Frognad stickers, emotes, and emojis.
            </p>
          </div>
        )}

        {/* Packs Grid */}
        {!isLoading && filteredPacks.length > 0 && (
          <div className="space-y-12">
            {/* Featured/Lily Pad Packs */}
            {lilyPadPacks.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <Leaf className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-semibold">Featured Packs</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {lilyPadPacks.map((pack) => (
                    <PackCard key={pack.id} pack={pack} />
                  ))}
                </div>
              </section>
            )}

            {/* Other Official Packs */}
            {otherPacks.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="w-5 h-5 text-secondary-foreground" />
                  <h2 className="text-xl font-semibold">More Official Packs</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {otherPacks.map((pack) => (
                    <PackCard key={pack.id} pack={pack} />
                  ))}
                </div>
              </section>
            )}

            {/* If no categorization needed, show all */}
            {lilyPadPacks.length === 0 && otherPacks.length === 0 && filteredPacks.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredPacks.map((pack) => (
                  <PackCard key={pack.id} pack={pack} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bundle Purchase Modal */}
        {selectedBundle && (
          <BundlePurchaseModal
            open={purchaseModalOpen}
            onOpenChange={setPurchaseModalOpen}
            bundle={selectedBundle}
            bundleItems={bundleItemsMap[selectedBundle.id] || []}
            onPurchaseComplete={handlePurchaseComplete}
          />
        )}
      </main>
    </div>
  );
};

export default OfficialPacks;
