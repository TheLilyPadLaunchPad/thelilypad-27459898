import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  Download,
  ShoppingBag,
  ExternalLink,
  ImageIcon,
  Calendar,
  Coins
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useChainCurrency } from "@/hooks/useChainCurrency";

interface PurchasedItem {
  id: string;
  item_id: string;
  price_paid: number;
  purchased_at: string;
  tx_hash: string | null;
  item: {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    category: string;
    tier: string;
  } | null;
  contents: Array<{
    id: string;
    name: string;
    file_url: string;
    display_order: number;
  }>;
}

interface PurchasedBundle {
  id: string;
  bundle_id: string;
  price_paid: number;
  purchased_at: string;
  tx_hash: string | null;
  bundle: {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    discount_percent: number;
  } | null;
  items: Array<{
    item: {
      id: string;
      name: string;
      description: string | null;
      image_url: string | null;
      category: string;
    } | null;
    contents: Array<{
      id: string;
      name: string;
      file_url: string;
      display_order: number;
    }>;
  }>;
}

export default function MyPurchases() {
  const navigate = useNavigate();
  const { symbol, txUrl } = useChainCurrency();
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [purchasedItems, setPurchasedItems] = useState<PurchasedItem[]>([]);
  const [purchasedBundles, setPurchasedBundles] = useState<PurchasedBundle[]>([]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      setUserId(user.id);
    };
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;

    const fetchPurchases = async () => {
      setIsLoading(true);
      try {
        // Fetch individual item purchases
        const { data: itemPurchases, error: itemError } = await supabase
          .from("shop_purchases")
          .select(`
            id,
            item_id,
            price_paid,
            purchased_at,
            tx_hash
          `)
          .eq("user_id", userId)
          .order("purchased_at", { ascending: false });

        if (itemError) throw itemError;

        // Fetch item details and contents for each purchase
        const itemsWithDetails: PurchasedItem[] = [];
        for (const purchase of itemPurchases || []) {
          const { data: item } = await supabase
            .from("shop_items")
            .select("id, name, description, image_url, category, tier")
            .eq("id", purchase.item_id)
            .maybeSingle();

          const { data: contents } = await supabase
            .from("shop_item_contents")
            .select("id, name, file_url, display_order")
            .eq("item_id", purchase.item_id)
            .order("display_order");

          itemsWithDetails.push({
            ...purchase,
            item,
            contents: contents || [],
          });
        }
        setPurchasedItems(itemsWithDetails);

        // Fetch bundle purchases
        const { data: bundlePurchases, error: bundleError } = await supabase
          .from("shop_bundle_purchases")
          .select(`
            id,
            bundle_id,
            price_paid,
            purchased_at,
            tx_hash
          `)
          .eq("user_id", userId)
          .order("purchased_at", { ascending: false });

        if (bundleError) throw bundleError;

        // Fetch bundle details and items for each purchase
        const bundlesWithDetails: PurchasedBundle[] = [];
        for (const purchase of bundlePurchases || []) {
          const { data: bundle } = await supabase
            .from("shop_bundles")
            .select("id, name, description, image_url, discount_percent")
            .eq("id", purchase.bundle_id)
            .maybeSingle();

          // Get bundle items
          const { data: bundleItems } = await supabase
            .from("shop_bundle_items")
            .select("item_id")
            .eq("bundle_id", purchase.bundle_id);

          const itemsWithContents = [];
          for (const bundleItem of bundleItems || []) {
            const { data: item } = await supabase
              .from("shop_items")
              .select("id, name, description, image_url, category")
              .eq("id", bundleItem.item_id)
              .maybeSingle();

            const { data: contents } = await supabase
              .from("shop_item_contents")
              .select("id, name, file_url, display_order")
              .eq("item_id", bundleItem.item_id)
              .order("display_order");

            itemsWithContents.push({
              item,
              contents: contents || [],
            });
          }

          bundlesWithDetails.push({
            ...purchase,
            bundle,
            items: itemsWithContents,
          });
        }
        setPurchasedBundles(bundlesWithDetails);
      } catch (error) {
        console.error("Error fetching purchases:", error);
        toast.error("Failed to load purchases");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPurchases();
  }, [userId]);

  const handleDownload = async (url: string, name: string) => {
    try {
      // Extract storage path from publicUrl. Public URLs look like:
      //   .../storage/v1/object/public/shop-items/<path>
      // Signed URLs look like:
      //   .../storage/v1/object/sign/shop-items/<path>?token=...
      const match = url.match(/\/object\/(?:public|sign)\/shop-items\/([^?]+)/);
      if (!match) {
        // Fallback: open the URL directly (legacy non-shop links)
        window.open(url, "_blank");
        toast.success(`Opening ${name}`);
        return;
      }
      const path = decodeURIComponent(match[1]);
      const { data, error } = await supabase
        .storage
        .from("shop-items")
        .createSignedUrl(path, 300);
      if (error || !data?.signedUrl) {
        throw error || new Error("Failed to create download link");
      }
      window.open(data.signedUrl, "_blank");
      toast.success(`Opening ${name}`);
    } catch (e: any) {
      console.error("Download failed:", e);
      toast.error(e?.message || "Failed to open download");
    }
  };

  const totalItems = purchasedItems.length;
  const totalBundles = purchasedBundles.length;
  const totalSpent = [...purchasedItems, ...purchasedBundles].reduce(
    (acc, p) => acc + Number(p.price_paid),
    0
  );

  const tierColors: Record<string, string> = {
    free: "bg-muted text-muted-foreground",
    basic: "bg-primary/20 text-primary",
    premium: "bg-yellow-500/20 text-yellow-600",
    exclusive: "bg-purple-500/20 text-purple-600",
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">My Purchases</h1>
          <p className="text-muted-foreground">
            View and download all your purchased packs and bundles
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-full bg-primary/10">
                <ShoppingBag className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Items Owned</p>
                <p className="text-2xl font-bold">{totalItems}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-full bg-accent/10">
                <Package className="h-6 w-6 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bundles Owned</p>
                <p className="text-2xl font-bold">{totalBundles}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-full bg-secondary/10">
                <Coins className="h-6 w-6 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spent</p>
                <p className="text-2xl font-bold">{totalSpent.toFixed(2)} {symbol}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : totalItems === 0 && totalBundles === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No purchases yet</h2>
              <p className="text-muted-foreground mb-4">
                Browse the shop to find sticker packs and bundles
              </p>
              <Button onClick={() => navigate("/official-packs")}>
                Browse Shop
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="items" className="space-y-6">
            <TabsList>
              <TabsTrigger value="items" className="gap-2">
                <ShoppingBag className="h-4 w-4" />
                Items ({totalItems})
              </TabsTrigger>
              <TabsTrigger value="bundles" className="gap-2">
                <Package className="h-4 w-4" />
                Bundles ({totalBundles})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="items" className="space-y-4">
              {purchasedItems.map((purchase) => (
                <Card key={purchase.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Item Image */}
                      <div className="w-full md:w-32 h-32 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {purchase.item?.image_url ? (
                          <img
                            src={purchase.item.image_url}
                            alt={purchase.item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Item Details */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-lg font-semibold">
                              {purchase.item?.name || "Unknown Item"}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="capitalize">
                                {purchase.item?.category?.replace("_", " ")}
                              </Badge>
                              {purchase.item?.tier && (
                                <Badge className={tierColors[purchase.item.tier]}>
                                  {purchase.item.tier}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(purchase.purchased_at), "MMM d, yyyy")}
                            </div>
                            <div className="font-medium text-foreground">
                              {Number(purchase.price_paid).toFixed(2)} {symbol}
                            </div>
                          </div>
                        </div>

                        {purchase.item?.description && (
                          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                            {purchase.item.description}
                          </p>
                        )}

                        {/* Downloads */}
                        {purchase.contents.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Downloads ({purchase.contents.length})</p>
                            <div className="flex flex-wrap gap-2">
                              {purchase.contents.map((content) => (
                                <Button
                                  key={content.id}
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDownload(content.file_url, content.name)}
                                  className="gap-2"
                                >
                                  <Download className="h-3 w-3" />
                                  {content.name}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}

                        {purchase.tx_hash && (
                          <div className="mt-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-muted-foreground gap-1"
                              onClick={() =>
                                window.open(
                                  txUrl(purchase.tx_hash!),
                                  "_blank"
                                )
                              }
                            >
                              <ExternalLink className="h-3 w-3" />
                              View Transaction
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="bundles" className="space-y-4">
              {purchasedBundles.map((purchase) => (
                <Card key={purchase.id}>
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          {purchase.bundle?.image_url ? (
                            <img
                              src={purchase.bundle.image_url}
                              alt={purchase.bundle.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div>
                          <CardTitle className="text-lg">
                            {purchase.bundle?.name || "Unknown Bundle"}
                          </CardTitle>
                          <Badge variant="secondary" className="mt-1">
                            {purchase.bundle?.discount_percent}% OFF Bundle
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(purchase.purchased_at), "MMM d, yyyy")}
                        </div>
                        <div className="font-medium text-foreground">
                          {Number(purchase.price_paid).toFixed(2)} {symbol}
                        </div>
                      </div>
                    </div>
                    {purchase.bundle?.description && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {purchase.bundle.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm font-medium mb-3">
                      Included Items ({purchase.items.length})
                    </p>
                    <div className="space-y-4">
                      {purchase.items.map((bundleItem, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col sm:flex-row gap-4 p-4 rounded-lg bg-muted/50"
                        >
                          <div className="w-full sm:w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                            {bundleItem.item?.image_url ? (
                              <img
                                src={bundleItem.item.image_url}
                                alt={bundleItem.item.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">
                              {bundleItem.item?.name || "Unknown Item"}
                            </h4>
                            <Badge variant="outline" className="capitalize mt-1">
                              {bundleItem.item?.category?.replace("_", " ")}
                            </Badge>
                            {bundleItem.contents.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-3">
                                {bundleItem.contents.map((content) => (
                                  <Button
                                    key={content.id}
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleDownload(content.file_url, content.name)
                                    }
                                    className="gap-2"
                                  >
                                    <Download className="h-3 w-3" />
                                    {content.name}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {purchase.tx_hash && (
                      <div className="mt-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground gap-1"
                          onClick={() =>
                            window.open(
                              txUrl(purchase.tx_hash!),
                              "_blank"
                            )
                          }
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Transaction
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
