import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Tag, ShoppingCart, Shield, Image as ImageIcon } from "lucide-react";
import { MarketplaceCardSkeleton } from "@/components/LoadingSkeletons";
import { EmptyState } from "@/components/common";
import { type NFTListing } from "@/hooks/useMarketplaceData";
import { ipfsToHttp, resolveNftImageUrl } from "@/lib/ipfs";

interface ListingsGridProps {
  listings: NFTListing[];
  verifiedOnly: boolean;
  isLoading: boolean;
  onSelectListing: (listing: NFTListing) => void;
}

export const ListingsGrid: React.FC<ListingsGridProps> = ({
  listings,
  verifiedOnly,
  isLoading,
  onSelectListing,
}) => {
  if (isLoading) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Tag className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">NFT Listings</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MarketplaceCardSkeleton key={`listing-skeleton-${i}`} />
          ))}
        </div>
      </section>
    );
  }

  if (listings.length === 0) {
    return null; // Don't show section if no listings
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Tag className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">NFT Listings</h2>
        <Badge variant="secondary">{listings.length}</Badge>
        {verifiedOnly && (
          <Badge variant="outline" className="gap-1 bg-primary/10 text-primary border-primary/30">
            <Shield className="w-3 h-3" />
            Verified
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {listings.map((listing, index) => (
          <Card
            key={listing.id}
            className="nft-frame overflow-hidden cursor-pointer group animate-fade-in"
            style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'backwards' }}
            onClick={() => onSelectListing(listing)}
          >
            <div className="aspect-square relative overflow-hidden bg-muted">
              {listing.nft.image_url ? (
                <img
                  src={resolveNftImageUrl(listing.nft.image_url || "")}
                  alt={listing.nft.name || `Token #${listing.nft.token_id}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                  width="199"
                  height="199"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="w-10 h-10 text-muted-foreground" />
                </div>
              )}

              <Badge
                variant="outline"
                className="absolute top-2 right-2 bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0.5"
              >
                <Tag className="w-2.5 h-2.5 mr-0.5" />
                Sale
              </Badge>
            </div>

            <CardHeader className="pb-1 px-3 pt-2">
              <CardTitle className="text-sm truncate">
                {listing.nft.name || `Token #${listing.nft.token_id}`}
              </CardTitle>
              {listing.nft.collection && (
                <CardDescription className="text-[10px] truncate">{listing.nft.collection.name}</CardDescription>
              )}
            </CardHeader>

            <CardContent className="px-3 pb-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Price</span>
                <span className="font-bold text-sm">{listing.price} {listing.currency}</span>
              </div>
              <Button className="w-full mt-2 h-7 text-xs" size="sm">
                <ShoppingCart className="w-3 h-3 mr-1" />
                Buy
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};
