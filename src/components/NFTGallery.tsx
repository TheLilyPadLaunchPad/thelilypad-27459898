import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { TraitRarityFilter, SelectedTraitsBar } from "@/components/TraitRarityFilter";
import { MakeOfferModal } from "@/components/MakeOfferModal";
import { NFTOffersList } from "@/components/NFTOffersList";
import { ExternalLink, Image as ImageIcon, RefreshCw, User, Search, Grid3X3, List, SlidersHorizontal, Tag, MessageSquare, EyeOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ipfsToHttp } from "@/lib/ipfs";

interface NFT {
  id: string;
  token_id: number;
  name: string | null;
  description: string | null;
  image_url: string | null;
  attributes: { trait_type: string; value: string }[];
  owner_address: string;
  owner_id: string;
  tx_hash: string;
  minted_at: string;
  is_revealed: boolean;
  revealed_at: string | null;
}

interface NFTGalleryProps {
  collectionId: string;
  collectionName?: string;
  collectionImage?: string | null;
  unrevealedImage?: string | null;
  contractAddress?: string | null;
  limit?: number;
  showFilters?: boolean;
  explorerUrl?: string;
  chain?: string;
  isTestnet?: boolean;
}

export function NFTGallery({
  collectionId,
  collectionName,
  collectionImage,
  unrevealedImage,
  contractAddress,
  limit = 100,
  showFilters = true,
  explorerUrl: propExplorerUrl,
  chain = 'solana',
  isTestnet = false
}: NFTGalleryProps) {
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNft, setSelectedNft] = useState<NFT | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"token_id" | "minted_at" | "rarity">("token_id");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedTraits, setSelectedTraits] = useState<Map<string, Set<string>>>(new Map());
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [offerCounts, setOfferCounts] = useState<Record<string, number>>({});

  // Get current user
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchNFTs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("minted_nfts")
      .select("*")
      .eq("collection_id", collectionId)
      .order("token_id", { ascending: true })
      .limit(limit);

    if (!error && data) {
      setNfts(data.map(nft => ({
        ...nft,
        attributes: (nft.attributes as { trait_type: string; value: string }[]) || []
      })));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchNFTs();
  }, [collectionId, limit]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchNFTs();
    setIsRefreshing(false);
  };

  const handleTraitSelect = (traitType: string, value: string) => {
    setSelectedTraits(prev => {
      const updated = new Map(prev);
      if (!updated.has(traitType)) {
        updated.set(traitType, new Set());
      }
      const values = updated.get(traitType)!;
      if (values.has(value)) {
        values.delete(value);
        if (values.size === 0) {
          updated.delete(traitType);
        }
      } else {
        values.add(value);
      }
      return updated;
    });
  };

  const handleRemoveTrait = (traitType: string, value: string) => {
    setSelectedTraits(prev => {
      const updated = new Map(prev);
      const values = updated.get(traitType);
      if (values) {
        values.delete(value);
        if (values.size === 0) {
          updated.delete(traitType);
        }
      }
      return updated;
    });
  };

  const handleClearAllTraits = () => {
    setSelectedTraits(new Map());
  };

  // Calculate rarity score for each NFT
  const nftsWithRarity = useMemo(() => {
    // First calculate trait frequencies
    const traitFrequencies = new Map<string, Map<string, number>>();
    nfts.forEach(nft => {
      nft.attributes.forEach(attr => {
        if (!traitFrequencies.has(attr.trait_type)) {
          traitFrequencies.set(attr.trait_type, new Map());
        }
        const valueMap = traitFrequencies.get(attr.trait_type)!;
        valueMap.set(attr.value, (valueMap.get(attr.value) || 0) + 1);
      });
    });

    // Calculate rarity score for each NFT
    return nfts.map(nft => {
      let rarityScore = 0;
      nft.attributes.forEach(attr => {
        const frequency = traitFrequencies.get(attr.trait_type)?.get(attr.value) || 0;
        if (frequency > 0 && nfts.length > 0) {
          // Lower frequency = higher rarity score
          rarityScore += (1 - frequency / nfts.length);
        }
      });
      return { ...nft, rarityScore };
    });
  }, [nfts]);

  // Filter and sort NFTs
  const filteredNfts = useMemo(() => {
    let result = nftsWithRarity;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(nft =>
        nft.name?.toLowerCase().includes(query) ||
        nft.token_id.toString().includes(query)
      );
    }

    // Filter by selected traits (AND logic between trait types, OR logic within trait type)
    if (selectedTraits.size > 0) {
      result = result.filter(nft => {
        for (const [traitType, values] of selectedTraits) {
          const nftHasTrait = nft.attributes.some(
            attr => attr.trait_type === traitType && values.has(attr.value)
          );
          if (!nftHasTrait) return false;
        }
        return true;
      });
    }

    // Sort
    switch (sortBy) {
      case "minted_at":
        result = [...result].sort((a, b) =>
          new Date(b.minted_at).getTime() - new Date(a.minted_at).getTime()
        );
        break;
      case "rarity":
        result = [...result].sort((a, b) => b.rarityScore - a.rarityScore);
        break;
      case "token_id":
      default:
        result = [...result].sort((a, b) => a.token_id - b.token_id);
    }

    return result;
  }, [nftsWithRarity, searchQuery, selectedTraits, sortBy]);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getExplorerUrl = (hash: string) => {
    if (propExplorerUrl) return `${propExplorerUrl}/tx/${hash}`;

    // Fallback if not provided
    if (chain === 'monad') {
      return `https://monad-explorer.io/tx/${hash}`;
    }
    return `https://explorer.solana.com/tx/${hash}${isTestnet ? '?cluster=devnet' : ''}`;
  };

  const tokenExplorerUrl = (tokenId: number | string) => {
    if (!contractAddress) return null;
    if (propExplorerUrl) return `${propExplorerUrl}/address/${contractAddress}`;

    if (chain === 'monad') {
      return `https://monad-explorer.io/address/${contractAddress}`;
    }
    return `https://explorer.solana.com/address/${contractAddress}${isTestnet ? '?cluster=devnet' : ''}`;
  };

  const getRarityBadge = (score: number) => {
    const maxScore = nfts.length > 0 ? nfts[0]?.attributes?.length || 1 : 1;
    const percentage = (score / maxScore) * 100;

    if (percentage >= 80) return { label: "Legendary", color: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10" };
    if (percentage >= 60) return { label: "Epic", color: "text-purple-500 border-purple-500/30 bg-purple-500/10" };
    if (percentage >= 40) return { label: "Rare", color: "text-blue-500 border-blue-500/30 bg-blue-500/10" };
    if (percentage >= 20) return { label: "Uncommon", color: "text-green-500 border-green-500/30 bg-green-500/10" };
    return { label: "Common", color: "text-muted-foreground border-border bg-muted" };
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">NFT Gallery</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (nfts.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">NFT Gallery</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No NFTs minted yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Be the first to mint from this collection!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Filter Sidebar - Desktop */}
        {showFilters && (
          <div className="hidden lg:block">
            <TraitRarityFilter
              collectionId={collectionId}
              selectedTraits={selectedTraits}
              onTraitSelect={handleTraitSelect}
              onClearAll={handleClearAllTraits}
              totalNfts={nfts.length}
            />
          </div>
        )}

        {/* Main Gallery */}
        <div className={showFilters ? "lg:col-span-3" : "lg:col-span-4"}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <CardTitle className="text-lg">
                  NFT Gallery ({filteredNfts.length}{filteredNfts.length !== nfts.length ? ` of ${nfts.length}` : ""})
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Mobile Filter Toggle */}
                  {showFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="lg:hidden"
                      onClick={() => setShowFilterPanel(!showFilterPanel)}
                    >
                      <SlidersHorizontal className="w-4 h-4 mr-2" />
                      Filters
                      {selectedTraits.size > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {Array.from(selectedTraits.values()).reduce((acc, set) => acc + set.size, 0)}
                        </Badge>
                      )}
                    </Button>
                  )}

                  {/* View Toggle */}
                  <div className="flex items-center border rounded-lg p-0.5">
                    <Button
                      variant={viewMode === "grid" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setViewMode("grid")}
                    >
                      <Grid3X3 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant={viewMode === "list" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setViewMode("list")}
                    >
                      <List className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              {/* Search and Sort */}
              <div className="flex flex-col sm:flex-row gap-2 pt-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or token ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="token_id">Token ID</SelectItem>
                    <SelectItem value="minted_at">Recently Minted</SelectItem>
                    <SelectItem value="rarity">Rarity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent>
              {/* Mobile Filter Panel */}
              {showFilters && showFilterPanel && (
                <div className="lg:hidden mb-4">
                  <TraitRarityFilter
                    collectionId={collectionId}
                    selectedTraits={selectedTraits}
                    onTraitSelect={handleTraitSelect}
                    onClearAll={handleClearAllTraits}
                    totalNfts={nfts.length}
                  />
                </div>
              )}

              {/* Selected Traits Bar */}
              <SelectedTraitsBar
                selectedTraits={selectedTraits}
                onRemoveTrait={handleRemoveTrait}
                onClearAll={handleClearAllTraits}
                filteredCount={filteredNfts.length}
                totalCount={nfts.length}
              />

              {filteredNfts.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No NFTs match your filters</p>
                  <Button
                    variant="link"
                    onClick={() => {
                      setSearchQuery("");
                      handleClearAllTraits();
                    }}
                  >
                    Clear all filters
                  </Button>
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {filteredNfts.map((nft) => {
                    const rarity = getRarityBadge(nft.rarityScore);
                    return (
                      <div
                        key={nft.id}
                        className="group relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                        onClick={() => setSelectedNft(nft)}
                      >
                        {/* Show unrevealed image if not revealed, otherwise show actual image */}
                        {!nft.is_revealed && unrevealedImage ? (
                          <>
                            <img
                              src={ipfsToHttp(unrevealedImage)}
                              alt="Unrevealed NFT"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute top-2 left-2">
                              <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-500 border-amber-500/30">
                                <EyeOff className="w-3 h-3 mr-1" />
                                Unrevealed
                              </Badge>
                            </div>
                          </>
                        ) : nft.image_url ? (
                          <img
                            src={ipfsToHttp(nft.image_url)}
                            alt={nft.name || `#${nft.token_id}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : collectionImage ? (
                          <img
                            src={ipfsToHttp(collectionImage)}
                            alt={nft.name || `#${nft.token_id}`}
                            className="w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                        {/* Rarity Badge - only show if revealed */}
                        {nft.is_revealed && nft.attributes.length > 0 && (
                          <Badge
                            variant="outline"
                            className={`absolute top-2 right-2 text-[10px] ${rarity.color}`}
                          >
                            {rarity.label}
                          </Badge>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                          <p className="text-white font-medium text-sm truncate">
                            {nft.is_revealed ? (nft.name || `${collectionName} #${nft.token_id}`) : `${collectionName} #${nft.token_id}`}
                          </p>
                          <p className="text-white/70 text-xs">
                            #{nft.token_id}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredNfts.map((nft) => {
                    const rarity = getRarityBadge(nft.rarityScore);
                    return (
                      <div
                        key={nft.id}
                        className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => setSelectedNft(nft)}
                      >
                        <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                          {nft.image_url ? (
                            <img
                              src={ipfsToHttp(nft.image_url)}
                              alt={nft.name || `#${nft.token_id}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {nft.name || `${collectionName} #${nft.token_id}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Token #{nft.token_id}
                          </p>
                        </div>
                        {nft.attributes.length > 0 && (
                          <Badge variant="outline" className={`text-xs ${rarity.color}`}>
                            {rarity.label}
                          </Badge>
                        )}
                        <div className="text-xs text-muted-foreground text-right">
                          {formatDistanceToNow(new Date(nft.minted_at), { addSuffix: true })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* NFT Detail Modal */}
      <Dialog open={!!selectedNft} onOpenChange={() => setSelectedNft(null)}>
        <DialogContent className="max-w-2xl">
          {selectedNft && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selectedNft.name || `${collectionName} #${selectedNft.token_id}`}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                  {selectedNft.image_url ? (
                    <img
                      src={ipfsToHttp(selectedNft.image_url)}
                      alt={selectedNft.name || `#${selectedNft.token_id}`}
                      className="w-full h-full object-cover"
                    />
                  ) : collectionImage ? (
                    <img
                      src={ipfsToHttp(collectionImage)}
                      alt={selectedNft.name || `#${selectedNft.token_id}`}
                      className="w-full h-full object-cover opacity-50"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-16 h-16 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="mb-2">
                      Token #{selectedNft.token_id}
                    </Badge>
                    {selectedNft.attributes.length > 0 && (
                      <Badge
                        variant="outline"
                        className={`mb-2 ${getRarityBadge((selectedNft as any).rarityScore || 0).color}`}
                      >
                        {getRarityBadge((selectedNft as any).rarityScore || 0).label}
                      </Badge>
                    )}
                  </div>
                  {selectedNft.description && (
                    <p className="text-muted-foreground text-sm">
                      {selectedNft.description}
                    </p>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Owner:</span>
                      <code className="bg-muted px-2 py-0.5 rounded text-xs">
                        {formatAddress(selectedNft.owner_address)}
                      </code>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Minted {formatDistanceToNow(new Date(selectedNft.minted_at), { addSuffix: true })}
                    </div>
                  </div>

                  {selectedNft.attributes.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Attributes</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {selectedNft.attributes.map((attr, i) => (
                          <div
                            key={i}
                            className="bg-muted/50 rounded-lg p-2 text-center cursor-pointer hover:bg-muted transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTraitSelect(attr.trait_type, attr.value);
                              setSelectedNft(null);
                            }}
                          >
                            <p className="text-xs text-muted-foreground uppercase">
                              {attr.trait_type}
                            </p>
                            <p className="font-medium text-sm truncate">
                              {attr.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator className="my-4" />

                  {/* Make Offer / Offers Section */}
                  <div className="space-y-3">
                    {/* Make Offer Button - only show if not owner */}
                    {currentUserId && currentUserId !== selectedNft.owner_id && (
                      <Button
                        className="w-full gap-2"
                        onClick={() => setShowOfferModal(true)}
                      >
                        <Tag className="w-4 h-4" />
                        Make an Offer
                      </Button>
                    )}

                    {/* Offers List */}
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Offers
                      </h4>
                      <NFTOffersList
                        nftId={selectedNft.id}
                        isOwner={currentUserId === selectedNft.owner_id}
                        onOfferAccepted={(offer) => {
                          // Handle offer accepted - could trigger transfer flow
                          setSelectedNft(null);
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.open(getExplorerUrl(selectedNft.tx_hash), "_blank")}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View TX
                    </Button>
                    {tokenExplorerUrl(selectedNft.token_id) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => window.open(tokenExplorerUrl(selectedNft.token_id)!, "_blank")}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View Token
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog >

      {/* Make Offer Modal */}
      {
        selectedNft && (
          <MakeOfferModal
            open={showOfferModal}
            onOpenChange={setShowOfferModal}
            nft={{
              id: selectedNft.id,
              name: selectedNft.name,
              image_url: selectedNft.image_url,
              owner_id: selectedNft.owner_id,
              owner_address: selectedNft.owner_address,
              token_id: selectedNft.token_id,
            }}
            onOfferMade={() => {
              // Refresh offers list
            }}
          />
        )
      }
    </>
  );
}
