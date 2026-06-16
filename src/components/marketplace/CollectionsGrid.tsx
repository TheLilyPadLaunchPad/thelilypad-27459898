import React from "react";
import { Badge } from "@/components/ui/badge";
import { Rocket, Shield, Loader2 } from "lucide-react";
import { CollectionCard } from "./CollectionCard";
import { MarketplaceCardSkeleton } from "@/components/LoadingSkeletons";
import { EmptyState } from "@/components/common";
import { type Collection } from "@/hooks/useMarketplaceData";

interface CollectionsGridProps {
  collections: Collection[];
  hotCollectionMints: Map<string, number>;
  hasMore: boolean;
  verifiedOnly: boolean;
  isLoading: boolean;
  isFetchingMore?: boolean;
  loadMoreRef?: React.RefObject<HTMLDivElement | null>;
}

export const CollectionsGrid: React.FC<CollectionsGridProps> = ({
  collections,
  hotCollectionMints,
  hasMore,
  verifiedOnly,
  isLoading,
  isFetchingMore = false,
  loadMoreRef,
}) => {
  if (isLoading) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Rocket className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Collections</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <MarketplaceCardSkeleton key={`collection-skeleton-${i}`} />
          ))}
        </div>
      </section>
    );
  }

  if (collections.length === 0) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Rocket className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Collections</h2>
        </div>
        <EmptyState
          icon={Rocket}
          title="No collections found"
          description={verifiedOnly ? "No verified collections match your filters." : "No collections available at the moment."}
        />
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Rocket className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">Collections</h2>
        <Badge variant="secondary">
          {collections.length}{hasMore ? '+' : ''}
        </Badge>
        {verifiedOnly && (
          <Badge variant="outline" className="gap-1 bg-primary/10 text-primary border-primary/30">
            <Shield className="w-3 h-3" />
            Verified
          </Badge>
        )}
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {collections.map((collection, index) => (
          <CollectionCard
            key={collection.id}
            collection={collection}
            index={index}
            hotMintCount={hotCollectionMints.get(collection.id)}
          />
        ))}
      </div>
      
      {/* Load more trigger */}
      {loadMoreRef && hasMore && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {isFetchingMore && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading more collections...</span>
            </div>
          )}
        </div>
      )}
      
      {/* End of list indicator */}
      {!hasMore && collections.length > 12 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          You've reached the end of the collections
        </div>
      )}
    </section>
  );
};
