import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SmartImage } from "@/components/ui/smart-image";
import { ipfsToHttp } from "@/lib/ipfs";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";
import { useCuratedCollections, collectionMintPrice } from "@/hooks/useCuratedCollections";
import type { CurationCategoryMeta } from "@/config/curation";
import { getDbChainValues, type SupportedChain } from "@/config/chains";
import { cn } from "@/lib/utils";

type ChainTab = "all" | SupportedChain;

const CHAIN_TABS: { id: ChainTab; label: string }[] = [
    { id: "all", label: "All Chains" },
    { id: "solana", label: "Solana" },
    { id: "xrpl", label: "XRPL" },
    { id: "monad", label: "Monad" },
];

interface CuratedCategoryRailProps {
    meta: CurationCategoryMeta;
    /** Show the chain filter chips */
    showChainFilter?: boolean;
    /** Link target for "View all" */
    viewAllHref?: string;
}

export const CuratedCategoryRail: React.FC<CuratedCategoryRailProps> = ({
    meta,
    showChainFilter = true,
    viewAllHref,
}) => {
    const [chainTab, setChainTab] = useState<ChainTab>("all");
    const { data, isLoading } = useCuratedCollections(meta.id);
    const Icon = meta.icon;

    const items = useMemo(() => {
        const rows = data ?? [];
        if (chainTab === "all") return rows;
        const allowed = getDbChainValues(chainTab);
        return rows.filter((r) => allowed.includes((r.collection.chain || "solana").toLowerCase()));
    }, [data, chainTab]);

    if (!isLoading && (data ?? []).length === 0) return null;

    return (
        <section className="py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <Icon className={cn("h-5 w-5", meta.accent)} />
                    <h2 className="text-xl sm:text-2xl font-bold">{meta.label}</h2>
                    <Badge variant="secondary" className="hidden sm:inline-flex">Team Picked</Badge>
                </div>

                <div className="flex items-center gap-2">
                    {showChainFilter && (
                        <div className="flex items-center gap-1.5 overflow-x-auto">
                            {CHAIN_TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setChainTab(tab.id)}
                                    aria-pressed={chainTab === tab.id}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors",
                                        chainTab === tab.id
                                            ? "bg-primary/15 text-primary border-primary/30"
                                            : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {viewAllHref && (
                        <Link to={viewAllHref}>
                            <Button variant="ghost" size="sm" className="gap-1">
                                View all <ChevronRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            <p className="text-sm text-muted-foreground mb-4">{meta.description}</p>

            {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-56 rounded-xl" />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No picks on this chain yet.</p>
            ) : (
                <Carousel opts={{ align: "start", loop: items.length > 4 }} className="w-full">
                    <CarouselContent className="-ml-2 md:-ml-4">
                        {items.map((featured) => {
                            const c = featured.collection;
                            const price = collectionMintPrice(c.phases);
                            const chainLabel = (c.chain || "solana").split("-")[0];
                            const isLive = c.status === "live";
                            const soldOut = c.total_supply > 0 && c.minted >= c.total_supply;
                            return (
                                <CarouselItem
                                    key={featured.id}
                                    className="pl-2 md:pl-4 basis-1/2 md:basis-1/3 lg:basis-1/4 xl:basis-1/5"
                                >
                                    <Link to={`/collection/${c.id}`} aria-label={`Open ${c.name}`}>
                                        <Card className="group h-full overflow-hidden border-2 border-primary/15 hover:border-primary/40 transition-all duration-300">
                                            <div className="relative aspect-square overflow-hidden">
                                                <SmartImage
                                                    src={ipfsToHttp(c.image_url) || "/placeholder.svg"}
                                                    alt={c.name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    displayWidth={480}
                                                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                                                <div className="absolute top-2 left-2">
                                                    <Badge className="bg-primary/90 text-primary-foreground gap-1">
                                                        <Icon className="h-3 w-3" />
                                                        {meta.short}
                                                    </Badge>
                                                </div>
                                                {isLive && !soldOut && (
                                                    <Badge className="absolute top-2 right-2 bg-emerald-500/90 text-white text-[10px]">
                                                        Live
                                                    </Badge>
                                                )}
                                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                                    <h3 className="font-bold text-primary-foreground truncate">
                                                        {c.name}
                                                    </h3>
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        <Badge variant="secondary" className="text-[10px]">
                                                            {c.minted}/{c.total_supply} minted
                                                        </Badge>
                                                        <Badge variant="outline" className="text-[10px] capitalize bg-background/70">
                                                            {chainLabel}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-3 flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold text-primary truncate">
                                                    {price === null
                                                        ? "Price TBA"
                                                        : price === 0
                                                            ? "Free mint"
                                                            : `${price} ${chainLabel === "solana" ? "SOL" : chainLabel === "xrpl" ? "XRP" : "MON"}`}
                                                </span>
                                                <Button size="sm" variant={soldOut ? "secondary" : "default"} tabIndex={-1}>
                                                    {soldOut ? "Sold out" : isLive ? "Mint now" : "View drop"}
                                                </Button>
                                            </div>
                                        </Card>
                                    </Link>
                                </CarouselItem>
                            );
                        })}

                    </CarouselContent>
                    {items.length > 4 && (
                        <>
                            <CarouselPrevious className="hidden md:flex -left-4" />
                            <CarouselNext className="hidden md:flex -right-4" />
                        </>
                    )}
                </Carousel>
            )}
        </section>
    );
};

export default CuratedCategoryRail;
