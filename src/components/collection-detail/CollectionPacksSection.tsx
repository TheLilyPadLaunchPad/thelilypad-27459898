import React from "react";
import { Link } from "react-router-dom";
import { Sticker, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SmartImage } from "@/components/ui/smart-image";
import { ipfsToHttp } from "@/lib/ipfs";
import { useCollectionPacks, packPrice } from "@/hooks/useCollectionPacks";

interface CollectionPacksSectionProps {
    collectionId: string;
    collectionName: string;
}

/**
 * Final step of the launch funnel: packs that belong to this collection.
 * Each card deep-links to the pack page where the buyer pays on-chain.
 */
export const CollectionPacksSection: React.FC<CollectionPacksSectionProps> = ({
    collectionId,
    collectionName,
}) => {
    const { data, isLoading } = useCollectionPacks(collectionId);
    const packs = data ?? [];

    if (!isLoading && packs.length === 0) return null;

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2">
                <Sticker className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold">Packs from {collectionName}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
                Sticker and emote packs released alongside this drop. Paid on-chain at checkout.
            </p>

            {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-56 rounded-xl" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {packs.map((pack) => {
                        const { amount, currency } = packPrice(pack);
                        return (
                            <Link key={pack.id} to={`/marketplace/sticker/${pack.id}`}>
                                <Card className="group h-full overflow-hidden border-2 border-primary/15 hover:border-primary/40 transition-colors">
                                    <div className="relative aspect-square overflow-hidden bg-muted">
                                        {pack.image_url ? (
                                            <SmartImage
                                                src={ipfsToHttp(pack.image_url) || "/placeholder.svg"}
                                                alt={pack.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                displayWidth={400}
                                                sizes="(max-width: 768px) 45vw, 22vw"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Sticker className="h-10 w-10 text-primary/60" />
                                            </div>
                                        )}
                                        {pack.required_collection_id && (
                                            <Badge
                                                variant="outline"
                                                className="absolute top-2 left-2 gap-1 bg-background/80 text-[10px]"
                                            >
                                                <Lock className="h-3 w-3" />
                                                Holders
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="p-3 space-y-2">
                                        <h3 className="font-semibold text-sm truncate">{pack.name}</h3>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-bold text-primary">
                                                {amount > 0 ? `${amount} ${currency}` : "Free"}
                                            </span>
                                            <Badge variant="secondary" className="text-[10px]">
                                                {pack.total_sales} sold
                                            </Badge>
                                        </div>
                                        <Button size="sm" variant="secondary" className="w-full" tabIndex={-1}>
                                            View pack
                                        </Button>
                                    </div>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

export default CollectionPacksSection;
