import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gavel, Image as ImageIcon, Clock } from "lucide-react";
import { MarketplaceCardSkeleton } from "@/components/LoadingSkeletons";
import { resolveNftImageUrl } from "@/lib/ipfs";
import { SmartImage } from "@/components/ui/smart-image";

export interface AuctionRow {
  id: string;
  asset_address: string;
  name: string | null;
  image_url: string | null;
  collection_name: string | null;
  reserve_price: number;
  min_bid_increment: number;
  highest_bid: number | null;
  highest_bidder_address: string | null;
  seller_address: string;
  currency: string;
  chain: string;
  ends_at: string;
  status: string;
}

interface Props {
  auctions: AuctionRow[];
  isLoading: boolean;
  onSelect: (a: AuctionRow) => void;
}

function formatTimeLeft(ends: string): string {
  const ms = new Date(ends).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const AuctionsGrid: React.FC<Props> = ({ auctions, isLoading, onSelect }) => {
  if (isLoading) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Gavel className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Live Auctions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <MarketplaceCardSkeleton key={`a-skel-${i}`} />
          ))}
        </div>
      </section>
    );
  }

  if (auctions.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Gavel className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">Live Auctions</h2>
        <Badge variant="secondary">{auctions.length}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {auctions.map((a, idx) => {
          const current = a.highest_bid ?? a.reserve_price;
          return (
            <Card
              key={a.id}
              className="overflow-hidden hover:border-primary/50 transition-colors cursor-pointer group animate-fade-in"
              style={{ animationDelay: `${idx * 75}ms`, animationFillMode: "backwards" }}
              onClick={() => onSelect(a)}
            >
              <div className="aspect-square relative overflow-hidden bg-muted">
                {a.image_url ? (
                  <SmartImage
                    src={resolveNftImageUrl(a.image_url)}
                    alt={a.name ?? "Auction NFT"}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    displayWidth={400}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    width={199}
                    height={199}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
                <Badge
                  variant="outline"
                  className="absolute top-3 right-3 bg-purple-500/20 text-purple-300 border-purple-500/30"
                >
                  <Gavel className="w-3 h-3 mr-1" /> Auction
                </Badge>
                <Badge
                  variant="outline"
                  className="absolute top-3 left-3 bg-background/70 backdrop-blur border-border"
                >
                  <Clock className="w-3 h-3 mr-1" /> {formatTimeLeft(a.ends_at)}
                </Badge>
              </div>

              <CardHeader className="pb-2">
                <CardTitle className="text-lg truncate">{a.name ?? "Unnamed NFT"}</CardTitle>
                {a.collection_name && (
                  <CardDescription className="truncate">{a.collection_name}</CardDescription>
                )}
              </CardHeader>

              <CardContent>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">
                    {a.highest_bid ? "Top bid" : "Reserve"}
                  </span>
                  <span className="font-bold text-lg">
                    {current} {a.currency}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Seller</span>
                  <span className="font-mono text-xs">
                    {a.seller_address.slice(0, 6)}…{a.seller_address.slice(-4)}
                  </span>
                </div>
                <Button className="w-full mt-3" size="sm">
                  <Gavel className="w-4 h-4 mr-2" /> Place Bid
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
};

export default AuctionsGrid;
