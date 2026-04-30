import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sticker, Image as ImageIcon } from "lucide-react";
import { MarketplaceCardSkeleton } from "@/components/LoadingSkeletons";
import { EmptyState } from "@/components/common";
import { type ShopItem } from "@/hooks/useMarketplaceData";
import { ipfsToHttp, resolveNftImageUrl } from "@/lib/ipfs";

interface StickerPacksGridProps {
  stickerPacks: ShopItem[];
  isLoading: boolean;
}

export const StickerPacksGrid: React.FC<StickerPacksGridProps> = ({
  stickerPacks,
  isLoading,
}) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Sticker className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Sticker Packs</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <MarketplaceCardSkeleton key={`sticker-skeleton-${i}`} />
          ))}
        </div>
      </section>
    );
  }

  if (stickerPacks.length === 0) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Sticker className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Sticker Packs</h2>
        </div>
        <EmptyState
          icon={Sticker}
          title="No sticker packs available"
          description="Check back later for new sticker packs from creators."
        />
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Sticker className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">Sticker Packs</h2>
        <Badge variant="secondary">{stickerPacks.length}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {stickerPacks.map((pack, index) => (
          <Card
            key={pack.id}
            className="overflow-hidden hover:border-primary/50 transition-colors cursor-pointer group animate-fade-in"
            style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'backwards' }}
            onClick={() => navigate(`/marketplace/sticker/${pack.id}`)}
          >
            <div className="aspect-square relative overflow-hidden bg-muted">
              {pack.image_url ? (
                <img
                  src={resolveNftImageUrl(pack.image_url)}
                  alt={pack.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Sticker className="w-12 h-12 text-muted-foreground" />
                </div>
              )}

              <Badge
                variant="outline"
                className="absolute top-3 right-3 bg-primary/20 text-primary border-primary/30"
              >
                <Sticker className="w-3 h-3 mr-1" />
                Sticker Pack
              </Badge>

              {pack.tier !== "standard" && (
                <Badge
                  className="absolute top-3 left-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0"
                >
                  {pack.tier.charAt(0).toUpperCase() + pack.tier.slice(1)}
                </Badge>
              )}
            </div>

            <CardHeader className="pb-2">
              <CardTitle className="text-lg truncate">{pack.name}</CardTitle>
              {pack.description && (
                <CardDescription className="line-clamp-2">{pack.description}</CardDescription>
              )}
            </CardHeader>

            <CardContent>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Price</span>
                <span className="font-bold text-lg">{pack.price_mon} USDC</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sales</span>
                <span className="font-medium">{pack.total_sales}</span>
              </div>
              <Button className="w-full mt-3" size="sm" variant="secondary">
                View Pack
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};
