import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { BuyNFTModal } from "@/components/BuyNFTModal";
import { BidAuctionModal } from "@/components/BidAuctionModal";
import { NFTSalesAnalytics } from "@/components/NFTSalesAnalytics";
import BuybackStats from "@/components/BuybackStats";
import { Sparkles } from "lucide-react";
import { LilyPadLogo } from "@/components/LilyPadLogo";
import { TopCollectionsHighlights } from "@/components/sections/TopCollectionsHighlights";
import { BackToTop } from "@/components/BackToTop";
import { FeaturedCardStack } from "@/components/sections/FeaturedCardStack";
import { useWallet, ChainType } from "@/providers/WalletProvider";
import { useChain } from "@/providers/ChainProvider";
import { useSEO } from "@/hooks/useSEO";
import { supabase } from "@/integrations/supabase/client";
import {
  useMarketplaceData,
  isCollectionNew,
  type NFTListing,
  type ChainFilter,
} from "@/hooks/useMarketplaceData";
import {
  PageHeader,
  StatsGrid,
  type StatItem
} from "@/components/common";
import {
  MarketplaceFilters,
  CollectionsGrid,
  ListingsGrid,
  AuctionsGrid,
  type AuctionRow,
  StickerPacksGrid,
} from "@/components/marketplace";
import { CollectionApplicationModal } from "@/components/marketplace/CollectionApplicationModal";
import { MarketPulseWidget } from "@/components/marketplace/MarketPulseWidget";
import { CuratedCategoryRail } from "@/components/sections/CuratedCategoryRail";
import { useCuratedCollections } from "@/hooks/useCuratedCollections";
import { CURATION_CATEGORIES, isCurationCategory, type CurationCategory } from "@/config/curation";
import { useSearchParams } from "react-router-dom";



export default function Marketplace() {
  const { chainType } = useWallet();
  const { chain } = useChain();
  const [activeFilter, setActiveFilter] = useState("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showHotOnly, setShowHotOnly] = useState(false);
  const [showNewOnly, setShowNewOnly] = useState(false);
  const [selectedListing, setSelectedListing] = useState<NFTListing | null>(null);
  const [selectedAuction, setSelectedAuction] = useState<AuctionRow | null>(null);
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [auctionsLoading, setAuctionsLoading] = useState(true);
  // Default to connected chain, or 'all' if none
  const [selectedChain, setSelectedChain] = useState<ChainFilter>(() => {
    return (chain?.id as ChainFilter) || 'all';
  });

  // Curated category filter (?category=featured_nft|utility_nft|memecoin_nft)
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get("category");
  const category: CurationCategory | null = isCurationCategory(categoryParam) ? categoryParam : null;
  const setCategory = (next: CurationCategory | null) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set("category", next);
    else params.delete("category");
    setSearchParams(params, { replace: true });
  };
  const { data: curatedForCategory } = useCuratedCollections(category ?? "featured_nft");
  const curatedIds = useMemo(
    () => new Set((category ? curatedForCategory ?? [] : []).map((c) => c.collection_id)),
    [category, curatedForCategory]
  );

  // Use the custom hook for data fetching with infinite scroll and chain filter
  const {
    collections,
    stickerPacks,
    nftListings,
    hotCollectionMints,
    totalCollections,
    isLoading,
    isFetchingMore,
    hasMore,
    loadMoreRef,
  } = useMarketplaceData(selectedChain);

  const chainLabel = selectedChain === 'all' ? 'All Chains' : selectedChain === 'monad' ? 'Monad' : 'Solana';

  useSEO({
    title: "Lily Marketplace | The Lily Pad",
    description: `Browse NFT collections, listings, and sticker packs on Lily Marketplace. Discover unique digital collectibles on ${chainLabel}.`
  });

  // Load active on-chain auctions (filtered by chain)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setAuctionsLoading(true);
      let q = supabase
        .from("onchain_nft_auctions")
        .select("id,asset_address,name,image_url,collection_name,reserve_price,min_bid_increment,highest_bid,highest_bidder_address,seller_address,currency,chain,ends_at,status")
        .eq("status", "active")
        .gt("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: true })
        .limit(60);
      if (selectedChain !== "all") q = q.eq("chain", selectedChain);
      const { data } = await q;
      if (!cancelled) {
        setAuctions((data ?? []) as AuctionRow[]);
        setAuctionsLoading(false);
      }
    };
    load();

    const ch = supabase
      .channel("marketplace-auctions")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "onchain_nft_auctions" },
        () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [selectedChain]);


  // Filter collections
  const filteredCollections = useMemo(() => {
    return collections.filter(c => {
      if (category && !curatedIds.has(c.id)) return false;
      if (verifiedOnly && !c.contract_address) return false;
      if (showHotOnly && !hotCollectionMints.has(c.id)) return false;
      if (showNewOnly && !isCollectionNew(c)) return false;
      return true;
    });
  }, [collections, category, curatedIds, verifiedOnly, showHotOnly, showNewOnly, hotCollectionMints]);

  // Filter listings
  const filteredListings = useMemo(() => {
    return verifiedOnly
      ? nftListings.filter(l => l.nft.collection?.contract_address)
      : nftListings;
  }, [nftListings, verifiedOnly]);

  // Show flags
  const showAnalytics = activeFilter === "analytics";
  const showListings = activeFilter === "all" || activeFilter === "listings";
  const showCollections = activeFilter === "all" || activeFilter === "collections";
  const showStickers = activeFilter === "all" || activeFilter === "stickers";

  // Stats
  const stats: StatItem[] = useMemo(() => [
    { label: "NFT Listings", value: nftListings.length, loading: isLoading },
    { label: "Collections", value: totalCollections || collections.length, loading: isLoading },
    { label: "Sticker Packs", value: stickerPacks.length, loading: isLoading },
    { label: "Live Mints", value: collections.filter(c => c.status === "live").length, loading: isLoading },
    { label: "Stickers Sold", value: stickerPacks.reduce((sum, s) => sum + s.total_sales, 0), loading: isLoading },
  ], [nftListings.length, totalCollections, collections, stickerPacks, isLoading]);

  // Handlers
  const handleHotToggle = useCallback(() => {
    setShowHotOnly(prev => {
      if (!prev) setShowNewOnly(false);
      return !prev;
    });
  }, []);

  const handleNewToggle = useCallback(() => {
    setShowNewOnly(prev => {
      if (!prev) setShowHotOnly(false);
      return !prev;
    });
  }, []);

  // Only enable infinite scroll when no filters are applied
  const canLoadMore = hasMore && !category && !verifiedOnly && !showHotOnly && !showNewOnly;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Navbar />

      <main className="container mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-24 md:pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <PageHeader
            logo={<LilyPadLogo size={56} />}
            title="Lily Marketplace — Discover NFTs and Sticker Packs"
            subtitle={`Browse collections and digital assets on ${chainLabel}`}
          />
          <CollectionApplicationModal />
        </div>

        {/* Chain Selector Tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {([
            { id: 'all' as ChainFilter, label: 'All Chains', icon: <span>🌐</span> },
            { id: 'solana' as ChainFilter, label: 'Solana', icon: <span>◎</span> },
            { id: 'monad' as ChainFilter, label: 'Monad', icon: <span>◈</span> },
          ] as { id: ChainFilter; label: string; icon: React.ReactNode }[]).map((tab) => (
            <button
              aria-label={`Filter marketplace by ${tab.label}`}
              aria-pressed={selectedChain === tab.id}
              key={tab.id}
              onClick={() => setSelectedChain(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-full text-sm font-medium transition-all whitespace-nowrap ${selectedChain === tab.id
                ? tab.id === 'solana' ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                  : tab.id === 'monad' ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                  : 'bg-primary/15 text-primary border border-primary/30'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent'
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Curated category tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {[{ id: 'all', short: 'All Launches' }, ...CURATION_CATEGORIES].map((cat: any) => (
            <button
              key={cat.id}
              aria-pressed={category === cat.id}
              onClick={() => setCategory(cat.id === 'all' ? null : cat.id)}
              className={`px-4 py-2.5 min-h-[44px] rounded-full text-sm font-medium whitespace-nowrap border transition-all ${
                (category ?? 'all') === cat.id
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
              }`}
            >
              {cat.short}
            </button>
          ))}
        </div>

        {/* Curated rails (only on the "All" view) */}
        {!category && (
          <div className="mb-8 divide-y divide-border/60">
            {CURATION_CATEGORIES.map((meta) => (
              <CuratedCategoryRail key={meta.id} meta={meta} showChainFilter={false} />
            ))}
          </div>
        )}


        {/* Featured Card Stack */}
        <FeaturedCardStack />

        {/* Stats */}
        <StatsGrid stats={stats} columns={5} className="mb-8" />

        {/* Buyback Stats and Top Collections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <TopCollectionsHighlights />
          </div>
          <div>
            <BuybackStats chain={selectedChain !== 'all' ? selectedChain as any : 'solana'} />
          </div>
        </div>

        {/* Filters */}
        <MarketplaceFilters
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          verifiedOnly={verifiedOnly}
          onVerifiedChange={setVerifiedOnly}
          showHotOnly={showHotOnly}
          onHotChange={handleHotToggle}
          showNewOnly={showNewOnly}
          onNewChange={handleNewToggle}
          hotCount={hotCollectionMints.size}
          newCount={collections.filter(c => isCollectionNew(c)).length}
          verifiedCount={filteredCollections.length}
        />

        {/* Content Sections */}
        <div className="space-y-10">
          {/* Market Pulse — cross-marketplace top collections */}
          <section>
            <MarketPulseWidget />
          </section>

          {/* Analytics Section */}
          {showAnalytics && (
            <section>
              <NFTSalesAnalytics />
            </section>
          )}

          {/* NFT Listings Section */}
          {showListings && (
            <ListingsGrid
              listings={filteredListings}
              verifiedOnly={verifiedOnly}
              isLoading={isLoading}
              onSelectListing={setSelectedListing}
            />
          )}

          {/* Live Auctions Section */}
          {showListings && (
            <AuctionsGrid
              auctions={auctions}
              isLoading={auctionsLoading}
              onSelect={setSelectedAuction}
            />
          )}

          {/* Collections Section with Infinite Scroll */}
          {showCollections && (
            <CollectionsGrid
              collections={filteredCollections}
              hotCollectionMints={hotCollectionMints}
              hasMore={canLoadMore}
              verifiedOnly={verifiedOnly}
              isLoading={isLoading}
              isFetchingMore={isFetchingMore}
              loadMoreRef={loadMoreRef}
            />
          )}

          {/* Sticker Packs Section */}
          {showStickers && (
            <StickerPacksGrid
              stickerPacks={stickerPacks}
              isLoading={isLoading}
            />
          )}
        </div>

        {/* Buy NFT Modal */}
        {selectedListing && (
          <BuyNFTModal
            open={!!selectedListing}
            onOpenChange={(open) => !open && setSelectedListing(null)}
            listing={selectedListing}
            onSuccess={() => setSelectedListing(null)}
          />
        )}

        {/* Bid Auction Modal */}
        <BidAuctionModal
          open={!!selectedAuction}
          auction={selectedAuction}
          onOpenChange={(open) => !open && setSelectedAuction(null)}
        />

      </main>

      <BackToTop />
    </div>
  );
}
