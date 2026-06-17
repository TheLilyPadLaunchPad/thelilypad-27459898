import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { BuybackProgramBadge } from "@/components/BuybackProgramBadge";
import { useBuybackProgram } from "@/hooks/useBuybackProgram";
import { Rocket, Clock, CheckCircle, Sparkles, TrendingUp, Flame, Ban, Image as ImageIcon } from "lucide-react";
import { type Collection, getCollectionPrice, isCollectionNew } from "@/hooks/useMarketplaceData";
import { ipfsToHttp, resolveNftImageUrl } from "@/lib/ipfs";

const statusColors = {
  live: "bg-green-500/20 text-green-400 border-green-500/30",
  minted: "bg-green-500/20 text-green-400 border-green-500/30",
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  upcoming: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ended: "bg-muted text-muted-foreground border-border",
};

const statusIcons = {
  live: Sparkles,
  upcoming: Clock,
  ended: CheckCircle,
};

interface CollectionCardProps {
  collection: Collection;
  index: number;
  hotMintCount?: number;
}

export const CollectionCard: React.FC<CollectionCardProps> = ({
  collection,
  index,
  hotMintCount
}) => {
  const navigate = useNavigate();
  const { isInProgram } = useBuybackProgram();

  const StatusIcon = statusIcons[collection.status as keyof typeof statusIcons] || Sparkles;
  const isNew = isCollectionNew(collection);
  const isHot = !!hotMintCount;
  const isSoldOut = collection.total_supply > 0 && collection.minted >= collection.total_supply;
  const inBuybackProgram = isInProgram(collection.id);

  const showSoldOutBadge = isSoldOut;
  const showHotBadge = isHot && !isSoldOut;
  const showNewBadge = isNew && !isHot && !isSoldOut;
  const hasSpecialBadge = showSoldOutBadge || showHotBadge || showNewBadge;

  const ringClass = showSoldOutBadge
    ? 'ring-2 ring-gray-500/50'
    : showHotBadge
      ? 'ring-2 ring-pink-500/50'
      : isNew
        ? 'ring-2 ring-orange-500/50'
        : inBuybackProgram
          ? 'ring-2 ring-primary/50'
          : '';

  return (
    <Card
      className={`nft-frame overflow-hidden cursor-pointer group animate-fade-in ${ringClass}`}
      style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'backwards' }}
      onClick={() => navigate(`/launchpad/${collection.id}`)}
    >
      <div className="aspect-square relative overflow-hidden bg-muted">
        {collection.image_url ? (
          <img
            src={resolveNftImageUrl(collection.image_url) || "/placeholder.svg"}
            alt={collection.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            width="199"
            height="199"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/placeholder.svg'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Rocket className="w-12 h-12 text-muted-foreground" />
          </div>
        )}

        {/* Sold Out badge */}
        {showSoldOutBadge && (
          <Badge className="absolute top-3 left-3 bg-gradient-to-r from-gray-600 to-gray-800 text-white border-0 shadow-lg">
            <Ban className="w-3 h-3 mr-1" />
            Sold Out
          </Badge>
        )}

        {/* Hot badge */}
        {showHotBadge && (
          <Badge className="absolute top-3 left-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white border-0 animate-pulse shadow-lg">
            <TrendingUp className="w-3 h-3 mr-1" />
            Hot 🔥 {hotMintCount} mints
          </Badge>
        )}

        {/* New badge */}
        {showNewBadge && (
          <Badge className="absolute top-3 left-3 bg-gradient-to-r from-orange-500 to-red-500 text-white border-0 animate-pulse shadow-lg">
            <Flame className="w-3 h-3 mr-1" />
            New
          </Badge>
        )}

        {/* LilyPad Verification */}
        {collection.contract_address && (
          <div className={`absolute ${hasSpecialBadge ? 'bottom-3 left-3' : 'top-3 left-3'}`}>

          </div>
        )}

        {/* Buyback Program Badge */}
        {inBuybackProgram && (
          <div className="absolute bottom-3 right-3">
            <BuybackProgramBadge className="shadow-lg" />
          </div>
        )}

        {/* Status badge */}
        <Badge
          variant="outline"
          className={`absolute top-3 right-3 ${statusColors[collection.status as keyof typeof statusColors] || statusColors.upcoming}`}
        >
          <StatusIcon className="w-3 h-3 mr-1" />
          {(collection.status || 'upcoming').charAt(0).toUpperCase() + (collection.status || 'upcoming').slice(1)}
        </Badge>
      </div>

      <CardHeader className="pb-1 px-3 pt-2">
        <CardTitle className="text-sm truncate">{collection.name}</CardTitle>
        <CardDescription className="text-[10px]">
          by {collection.creator_address.slice(0, 4)}...{collection.creator_address.slice(-4)}
        </CardDescription>
      </CardHeader>

      <CardContent className="px-3 pb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Price</span>
          <span className="font-medium">{getCollectionPrice(collection)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Supply</span>
          <span className="font-medium">{collection.minted}/{collection.total_supply}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1 mt-2">
          <div
            className="bg-primary h-1 rounded-full transition-all"
            style={{ width: `${collection.total_supply > 0 ? (collection.minted / collection.total_supply) * 100 : 0}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
};
