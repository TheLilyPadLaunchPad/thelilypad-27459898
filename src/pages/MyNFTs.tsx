import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionHistory } from "@/components/TransactionHistory";
import { NFTTransferModal } from "@/components/NFTTransferModal";
import { ListNFTModal } from "@/components/ListNFTModal";
import { CreateRaffleForNFT } from "@/components/raffles/CreateRaffleForNFT";
import { PortfolioValueChart } from "@/components/PortfolioValueChart";
import { CardStack3D } from "@/components/ui/3d-card-stack";
import { ipfsToHttp } from "@/lib/ipfs";
import { useSEO } from "@/hooks/useSEO";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/providers/WalletProvider";
import { useWalletNFTs, NFT as OnChainNFT } from "@/hooks/useWalletNFTs";
import {
  ExternalLink,
  Image as ImageIcon,
  RefreshCw,
  User,
  Wallet,
  Grid3X3,
  List,
  ArrowUpRight,
  Send,
  Tag,
  XCircle,
  Loader2,
  Search,
  X,
  Sparkles,
  Diamond,
  Star,
  Gem,
  Ticket,
  Globe
} from "lucide-react";
import { LilyPadLogo } from "@/components/LilyPadLogo";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

// Rarity tier configuration
type RarityTier = 'legendary' | 'epic' | 'rare' | 'uncommon' | 'common';

const RARITY_CONFIG: Record<RarityTier, { label: string; color: string; bgColor: string; icon: typeof Sparkles }> = {
  legendary: { label: 'Legendary', color: 'text-amber-400', bgColor: 'bg-amber-500/20', icon: Diamond },
  epic: { label: 'Epic', color: 'text-purple-400', bgColor: 'bg-purple-500/20', icon: Gem },
  rare: { label: 'Rare', color: 'text-blue-400', bgColor: 'bg-blue-500/20', icon: Sparkles },
  uncommon: { label: 'Uncommon', color: 'text-green-400', bgColor: 'bg-green-500/20', icon: Star },
  common: { label: 'Common', color: 'text-muted-foreground', bgColor: 'bg-muted', icon: Star },
};

const getRarityTier = (score: number): RarityTier => {
  if (score >= 90) return 'legendary';
  if (score >= 75) return 'epic';
  if (score >= 50) return 'rare';
  if (score >= 25) return 'uncommon';
  return 'common';
};

interface NFT {
  id: string;
  token_id: number;
  name: string | null;
  description: string | null;
  image_url: string | null;
  attributes: { trait_type: string; value: string }[];
  owner_address: string;
  tx_hash: string;
  minted_at: string;
  collection_id: string;
  collection: {
    id: string;
    name: string;
    image_url: string | null;
    contract_address: string | null;
    chain?: string | null;
  } | null;
  source?: 'database' | 'onchain';
  onChainAddress?: string;
}

interface CollectionStats {
  id: string;
  name: string;
  image_url: string | null;
  count: number;
  floorPrice: number | null;
}

export default function MyNFTs() {
  const navigate = useNavigate();
  const { address, isConnected, chainType } = useWallet();
  // Derive currency symbol from connected chain (not hardcoded SOL)
  const chainSymbol = chainType === 'monad' ? 'MON' : 'SOL';

  // Fetch on-chain NFTs via DAS API
  const solanaNetwork = `solana-${localStorage.getItem("solanaNetwork") || "devnet"}`;
  const {
    nfts: onChainNfts,
    isLoading: onChainLoading,
    refresh: refreshOnChain,
  } = useWalletNFTs(address, solanaNetwork);

  const [nfts, setNfts] = useState<NFT[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNft, setSelectedNft] = useState<NFT | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [collectionStats, setCollectionStats] = useState<CollectionStats[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [transferNft, setTransferNft] = useState<NFT | null>(null);
  const [listNft, setListNft] = useState<NFT | null>(null);
  const [raffleNft, setRaffleNft] = useState<NFT | null>(null);
  const [listedNftIds, setListedNftIds] = useState<Set<string>>(new Set());
  const [listingsMap, setListingsMap] = useState<Map<string, { id: string; price: number }>>(new Map());
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useSEO({
    title: "My NFTs | The Lily Pad",
    description: "View your NFT portfolio across all collections on The Lily Pad"
  });

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
    // Require either wallet connection OR user login
    if (!address && !currentUserId) {
      setIsLoading(false);
      setNfts([]);
      return;
    }

    setIsLoading(true);

    // Build query based on available identifiers
    let query = supabase
      .from("minted_nfts")
      .select(`
        *,
        collection:collections(id, name, image_url, contract_address, chain)
      `)
      .order("minted_at", { ascending: false });

    // Prioritize wallet address for fetching NFTs
    if (address) {
      // Fetch by wallet address (case-insensitive)
      query = query.ilike("owner_address", address);
    } else if (currentUserId) {
      // Fallback to user ID if no wallet connected
      query = query.eq("owner_id", currentUserId);
    }

    const { data, error } = await query;

    if (!error && data) {
      const nftData: NFT[] = data.map(nft => ({
        ...nft,
        attributes: (nft.attributes as { trait_type: string; value: string }[]) || [],
        collection: nft.collection as NFT["collection"],
        source: 'database' as const,
      }));

      // Merge on-chain NFTs that aren't already in the database
      // Build a set of known DB identifiers for deduplication
      const dbTxHashes = new Set(
        nftData.map(n => n.tx_hash?.toLowerCase()).filter(Boolean)
      );
      const dbContractAddresses = new Set(
        nftData
          .map(n => n.collection?.contract_address?.toLowerCase())
          .filter(Boolean)
      );
      const dbNames = new Set(
        nftData.map(n => n.name?.toLowerCase()).filter(Boolean)
      );

      const onChainOnly: NFT[] = onChainNfts
        .filter(ocNft => {
          const addr = ocNft.tokenId?.toLowerCase();
          if (!addr) return false;
          // Skip if this on-chain asset matches a DB tx_hash or contract_address
          if (dbTxHashes.has(addr)) return false;
          if (dbContractAddresses.has(addr)) return false;
          // Also skip if name + collection match exactly (compressed NFTs may have different addresses)
          const ocName = ocNft.name?.toLowerCase();
          if (ocName && dbNames.has(ocName)) return false;
          return true;
        })
        .map((ocNft, idx): NFT => ({
          id: `onchain-${ocNft.tokenId}`,
          token_id: idx,
          name: ocNft.name || null,
          description: ocNft.description || null,
          image_url: ocNft.image || null,
          attributes: ocNft.attributes || [],
          owner_address: address || '',
          tx_hash: '',
          minted_at: new Date().toISOString(),
          collection_id: '',
          collection: ocNft.collection ? {
            id: `onchain-col-${ocNft.collection}`,
            name: ocNft.collection,
            image_url: null,
            contract_address: ocNft.contractAddress || null,
          } : null,
          source: 'onchain',
          onChainAddress: ocNft.tokenId,
        }));

      const mergedNfts = [...nftData, ...onChainOnly];
      setNfts(mergedNfts);

      // Calculate collection stats (initial without floor prices)
      const stats: Record<string, CollectionStats> = {};
      nftData.forEach(nft => {
        if (nft.collection) {
          if (!stats[nft.collection.id]) {
            stats[nft.collection.id] = {
              id: nft.collection.id,
              name: nft.collection.name,
              image_url: nft.collection.image_url,
              count: 0,
              floorPrice: null
            };
          }
          stats[nft.collection.id].count++;
        }
      });

      // Fetch active listings for user's NFTs
      const nftIds = nftData.map(nft => nft.id);
      if (nftIds.length > 0) {
        const { data: listings } = await supabase
          .from("nft_listings")
          .select("id, nft_id, price")
          .in("nft_id", nftIds)
          .eq("status", "active");

        if (listings) {
          setListedNftIds(new Set(listings.map(l => l.nft_id)));
          const newListingsMap = new Map<string, { id: string; price: number }>();
          listings.forEach(l => {
            newListingsMap.set(l.nft_id, { id: l.id, price: Number(l.price) });
          });
          setListingsMap(newListingsMap);
        }
      }

      // Fetch floor prices for each collection the user owns NFTs from
      const collectionIds = Object.keys(stats);
      if (collectionIds.length > 0) {
        // Get all NFTs in these collections to find floor prices
        const { data: collectionNfts } = await supabase
          .from("minted_nfts")
          .select("id, collection_id")
          .in("collection_id", collectionIds);

        if (collectionNfts && collectionNfts.length > 0) {
          const allCollectionNftIds = collectionNfts.map(n => n.id);

          // Get all active listings for these NFTs
          const { data: allListings } = await supabase
            .from("nft_listings")
            .select("nft_id, price")
            .in("nft_id", allCollectionNftIds)
            .eq("status", "active")
            .order("price", { ascending: true });

          if (allListings) {
            // Map NFT ID to collection ID
            const nftToCollection = new Map<string, string>();
            collectionNfts.forEach(n => {
              if (n.collection_id) nftToCollection.set(n.id, n.collection_id);
            });

            // Find floor price per collection (lowest listing)
            const floorPrices: Record<string, number> = {};
            allListings.forEach(listing => {
              const collId = nftToCollection.get(listing.nft_id);
              if (collId && floorPrices[collId] === undefined) {
                floorPrices[collId] = Number(listing.price);
              }
            });

            // Update stats with floor prices
            Object.keys(stats).forEach(collId => {
              stats[collId].floorPrice = floorPrices[collId] ?? null;
            });
          }
        }
      }

      setCollectionStats(Object.values(stats));
    } else {
      console.error("Error fetching NFTs:", error);
    }
    setIsLoading(false);
  };

  // Re-fetch when wallet address, user ID, or on-chain NFTs change
  useEffect(() => {
    fetchNFTs();
  }, [address, currentUserId, onChainNfts]);

  // Calculate portfolio value based on floor prices
  const portfolioValue = collectionStats.reduce((total, collection) => {
    if (collection.floorPrice !== null) {
      return total + (collection.floorPrice * collection.count);
    }
    return total;
  }, 0);

  // Real-time subscription for listing updates
  useEffect(() => {
    const channel = supabase
      .channel('portfolio-listings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'nft_listings'
        },
        () => {
          // Refetch when listings change to update floor prices
          fetchNFTs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [address, currentUserId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchNFTs(), refreshOnChain()]);
    setIsRefreshing(false);
  };

  const handleCancelListing = async (nftId: string) => {
    const listing = listingsMap.get(nftId);
    if (!listing) return;

    setIsCancelling(nftId);
    try {
      const { error } = await supabase
        .from("nft_listings")
        .delete()
        .eq("id", listing.id);

      if (error) throw error;

      toast.success("Listing cancelled successfully");

      // Update local state
      setListedNftIds(prev => {
        const updated = new Set(prev);
        updated.delete(nftId);
        return updated;
      });
      setListingsMap(prev => {
        const updated = new Map(prev);
        updated.delete(nftId);
        return updated;
      });
    } catch (error) {
      console.error("Error cancelling listing:", error);
      toast.error("Failed to cancel listing");
    } finally {
      setIsCancelling(null);
    }
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Chain-aware explorer URLs
  const explorerUrl = (hash: string) => {
    return `https://explorer.solana.com/tx/${hash}?cluster=devnet`;
  };

  const tokenExplorerUrl = (contractAddress: string | null, tokenId: number) => {
    if (!contractAddress) return null;
    return `https://explorer.solana.com/address/${contractAddress}?cluster=devnet`;
  };

  // Calculate rarity scores and trait data for NFTs based on trait occurrence
  const { rarityScores, traitRarityData } = useMemo(() => {
    const scores = new Map<string, number>();
    const traitData = new Map<string, Map<string, { count: number; total: number; percent: number }>>();

    // Group NFTs by collection
    const collectionNfts = new Map<string, NFT[]>();
    nfts.forEach(nft => {
      if (nft.collection_id) {
        const existing = collectionNfts.get(nft.collection_id) || [];
        existing.push(nft);
        collectionNfts.set(nft.collection_id, existing);
      }
    });

    // Calculate trait frequency per collection
    collectionNfts.forEach((collNfts, collectionId) => {
      const traitCounts = new Map<string, number>();
      const totalNfts = collNfts.length;

      // Count trait occurrences
      collNfts.forEach(nft => {
        nft.attributes.forEach(attr => {
          const key = `${attr.trait_type}:${attr.value}`;
          traitCounts.set(key, (traitCounts.get(key) || 0) + 1);
        });
      });

      // Store trait rarity data for each NFT
      collNfts.forEach(nft => {
        const nftTraitData = new Map<string, { count: number; total: number; percent: number }>();

        if (nft.attributes.length === 0) {
          scores.set(nft.id, 50);
          traitData.set(nft.id, nftTraitData);
          return;
        }

        let totalRarity = 0;
        nft.attributes.forEach(attr => {
          const key = `${attr.trait_type}:${attr.value}`;
          const count = traitCounts.get(key) || 1;
          const percent = (count / totalNfts) * 100;
          const traitRarity = (1 - count / totalNfts) * 100;
          totalRarity += traitRarity;

          nftTraitData.set(key, { count, total: totalNfts, percent });
        });

        const avgRarity = totalRarity / nft.attributes.length;
        scores.set(nft.id, avgRarity);
        traitData.set(nft.id, nftTraitData);
      });
    });

    return { rarityScores: scores, traitRarityData: traitData };
  }, [nfts]);

  // Get trait rarity tier based on percentage
  const getTraitRarityTier = (percent: number): RarityTier => {
    if (percent <= 5) return 'legendary';
    if (percent <= 15) return 'epic';
    if (percent <= 30) return 'rare';
    if (percent <= 50) return 'uncommon';
    return 'common';
  };

  // Filter NFTs by collection and search query
  const filteredNfts = nfts.filter(nft => {
    // Collection filter
    if (selectedCollection && nft.collection?.id !== selectedCollection) {
      return false;
    }
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const name = (nft.name || `${nft.collection?.name} #${nft.token_id}`).toLowerCase();
      const collectionName = nft.collection?.name?.toLowerCase() || "";
      return name.includes(query) || collectionName.includes(query) || nft.token_id.toString().includes(query);
    }
    return true;
  });

  // Not connected state - require wallet OR login
  if (!isConnected && !currentUserId) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="max-w-md mx-auto text-center py-16">
            <Wallet className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold mb-2">Connect Your Wallet</h1>
            <p className="text-muted-foreground mb-6">
              Connect your wallet to view NFTs in your portfolio
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 pt-24 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <LilyPadLogo size={48} />
            <div>
              <h1 className="text-3xl font-bold">My NFTs</h1>
              <p className="text-muted-foreground">
                {isConnected && address ? (
                  <span className="flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    {formatAddress(address)}
                  </span>
                ) : currentUserId ? (
                  <span className="text-sm">Showing NFTs linked to your account</span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-lg p-1">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode("grid")}
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode("list")}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Portfolio Stats */}
        {!isLoading && nfts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <ImageIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total NFTs</p>
                    <p className="text-2xl font-bold">{nfts.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-secondary/50 to-secondary/20 border-secondary/30">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-secondary rounded-lg">
                    <Grid3X3 className="w-5 h-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Collections</p>
                    <p className="text-2xl font-bold">{collectionStats.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-accent/50 to-accent/20 border-accent/30">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent rounded-lg">
                    <Tag className="w-5 h-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Est. Portfolio Value</p>
                    <p className="text-2xl font-bold">
                      {portfolioValue > 0 ? `${portfolioValue.toFixed(2)} ${chainSymbol}` : "—"}
                    </p>
                    {portfolioValue > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Based on floor prices
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Portfolio Value Chart */}
        {!isLoading && nfts.length > 0 && (
          <PortfolioValueChart
            nfts={nfts.map(n => ({ id: n.id, minted_at: n.minted_at, collection_id: n.collection_id }))}
            collectionStats={collectionStats}
            currency={chainSymbol}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar - Collection Filter */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Collections</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant={selectedCollection === null ? "secondary" : "ghost"}
                  className="w-full justify-between"
                  onClick={() => setSelectedCollection(null)}
                >
                  <span>All NFTs</span>
                  <Badge variant="outline">{nfts.length}</Badge>
                </Button>
                {collectionStats.map((collection) => (
                  <Button
                    key={collection.id}
                    variant={selectedCollection === collection.id ? "secondary" : "ghost"}
                    className="w-full justify-between h-auto py-2"
                    onClick={() => setSelectedCollection(collection.id)}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {collection.image_url ? (
                        <img
                          src={ipfsToHttp(collection.image_url)}
                          alt={collection.name}
                          className="w-5 h-5 rounded object-cover"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded bg-muted flex items-center justify-center">
                          <ImageIcon className="w-3 h-3" />
                        </div>
                      )}
                      <span className="truncate">{collection.name}</span>
                    </span>
                    <div className="flex flex-col items-end gap-0.5">
                      <Badge variant="outline" className="text-xs">{collection.count}</Badge>
                      {collection.floorPrice !== null && (
                        <span className="text-[10px] text-muted-foreground">
                          {collection.floorPrice.toFixed(2)} {chainSymbol}
                        </span>
                      )}
                    </div>
                  </Button>
                ))}
              </CardContent>
            </Card>

            {/* Rarity Leaderboard */}
            {nfts.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Diamond className="w-4 h-4 text-amber-400" />
                    Rarest NFTs
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(() => {
                    // Get top 5 rarest NFTs
                    const sortedByRarity = [...nfts]
                      .filter(nft => nft.attributes.length > 0)
                      .sort((a, b) => {
                        const scoreA = rarityScores.get(a.id) ?? 0;
                        const scoreB = rarityScores.get(b.id) ?? 0;
                        return scoreB - scoreA;
                      })
                      .slice(0, 5);

                    if (sortedByRarity.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          No NFTs with traits found
                        </p>
                      );
                    }

                    return sortedByRarity.map((nft, index) => {
                      const score = rarityScores.get(nft.id) ?? 50;
                      const tier = getRarityTier(score);
                      const rarity = RARITY_CONFIG[tier];
                      const RarityIcon = rarity.icon;

                      return (
                        <div
                          key={nft.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                          onClick={() => setSelectedNft(nft)}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-amber-500/20 text-amber-400' :
                            index === 1 ? 'bg-slate-300/20 text-slate-300' :
                              index === 2 ? 'bg-orange-600/20 text-orange-500' :
                                'bg-muted text-muted-foreground'
                            }`}>
                            {index + 1}
                          </div>
                          <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                            {nft.image_url ? (
                              <img
                                src={ipfsToHttp(nft.image_url)}
                                alt={nft.name || `#${nft.token_id}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {nft.name || `#${nft.token_id}`}
                            </p>
                            <div className="flex items-center gap-1">
                              <RarityIcon className={`w-3 h-3 ${rarity.color}`} />
                              <span className={`text-[10px] font-medium ${rarity.color}`}>
                                {rarity.label}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-semibold text-muted-foreground">
                              {score.toFixed(0)}
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Transaction History */}
            <TransactionHistory userId={currentUserId} limit={5} />
          </div>

          {/* Main Content - NFT Grid/List */}
          <div className="lg:col-span-3">
            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, collection, or token ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* 3D Card Stack Preview - Shows when collection is selected */}
            {selectedCollection && filteredNfts.length >= 2 && !isLoading && (
              <div className="mb-8">
                <CardStack3D
                  images={filteredNfts.slice(0, 5).map(nft => ({
                    src: ipfsToHttp(nft.image_url || nft.collection?.image_url || 'https://images.unsplash.com/photo-1634973357973-f2ed2657db3c?w=400'),
                    alt: nft.name || `NFT #${nft.token_id}`
                  }))}
                  cardWidth={280}
                  cardHeight={280}
                  spacing={{ x: 40, y: 40 }}
                  className="py-16"
                />
              </div>
            )}

            {isLoading ? (
              <div className={viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4"
                : "space-y-3"
              }>
                {[...Array(8)].map((_, i) => (
                  <Skeleton
                    key={i}
                    className={viewMode === "grid" ? "aspect-square rounded-lg" : "h-20 rounded-lg"}
                  />
                ))}
              </div>
            ) : filteredNfts.length === 0 ? (
              <div className="text-center py-16">
                <ImageIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">No NFTs Found</h2>
                <p className="text-muted-foreground mb-6">
                  {selectedCollection
                    ? "You don't have any NFTs from this collection"
                    : "Start minting NFTs to build your collection"
                  }
                </p>
                <Button onClick={() => navigate("/launchpad")}>
                  Explore Collections
                </Button>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {filteredNfts.map((nft) => {
                  const score = rarityScores.get(nft.id) ?? 50;
                  const tier = getRarityTier(score);
                  const rarity = RARITY_CONFIG[tier];
                  const RarityIcon = rarity.icon;

                  return (
                    <div
                      key={nft.id}
                      className="group relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                      onClick={() => setSelectedNft(nft)}
                    >
                      {nft.image_url ? (
                        <img
                          src={ipfsToHttp(nft.image_url)}
                          alt={nft.name || `#${nft.token_id}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : nft.collection?.image_url ? (
                        <img
                          src={ipfsToHttp(nft.collection.image_url)}
                          alt={nft.name || `#${nft.token_id}`}
                          className="w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      {/* On-Chain Badge */}
                      {nft.source === 'onchain' && (
                        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/20 backdrop-blur-sm">
                          <Globe className="w-3 h-3 text-blue-400" />
                          <span className="text-[10px] font-medium text-blue-400">On-Chain</span>
                        </div>
                      )}
                      {/* Rarity Badge */}
                      {nft.attributes.length > 0 && tier !== 'common' && (
                        <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full ${rarity.bgColor} backdrop-blur-sm`}>
                          <RarityIcon className={`w-3 h-3 ${rarity.color}`} />
                          <span className={`text-[10px] font-medium ${rarity.color}`}>{rarity.label}</span>
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                        <p className="text-white font-medium text-sm truncate">
                          {nft.name || `${nft.collection?.name} #${nft.token_id}`}
                        </p>
                        <p className="text-white/70 text-xs">
                          {nft.collection?.name}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredNfts.map((nft) => {
                  const score = rarityScores.get(nft.id) ?? 50;
                  const tier = getRarityTier(score);
                  const rarity = RARITY_CONFIG[tier];
                  const RarityIcon = rarity.icon;

                  return (
                    <div
                      key={nft.id}
                      className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => setSelectedNft(nft)}
                    >
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {nft.image_url ? (
                          <img
                            src={nft.image_url}
                            alt={nft.name || `#${nft.token_id}`}
                            className="w-full h-full object-cover"
                          />
                        ) : nft.collection?.image_url ? (
                          <img
                            src={nft.collection.image_url}
                            alt={nft.name || `#${nft.token_id}`}
                            className="w-full h-full object-cover opacity-50"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">
                            {nft.name || `${nft.collection?.name} #${nft.token_id}`}
                          </p>
                          {nft.source === 'onchain' && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/20">
                              <Globe className="w-3 h-3 text-blue-400" />
                              <span className="text-[10px] font-medium text-blue-400">On-Chain</span>
                            </div>
                          )}
                          {nft.attributes.length > 0 && tier !== 'common' && (
                            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${rarity.bgColor}`}>
                              <RarityIcon className={`w-3 h-3 ${rarity.color}`} />
                              <span className={`text-[10px] font-medium ${rarity.color}`}>{rarity.label}</span>
                            </div>
                          )}

                        </div>
                        <p className="text-sm text-muted-foreground">
                          {nft.collection?.name}{nft.source !== 'onchain' ? ` · Token #${nft.token_id}` : ''}
                        </p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(nft.minted_at), { addSuffix: true })}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/launchpad/${nft.collection_id}`);
                        }}
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* NFT Detail Modal */}
      <Dialog open={!!selectedNft} onOpenChange={() => setSelectedNft(null)}>
        <DialogContent className="max-w-2xl">
          {selectedNft && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selectedNft.name || `${selectedNft.collection?.name} #${selectedNft.token_id}`}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                  {selectedNft.image_url ? (
                    <img
                      src={selectedNft.image_url}
                      alt={selectedNft.name || `#${selectedNft.token_id}`}
                      className="w-full h-full object-cover"
                    />
                  ) : selectedNft.collection?.image_url ? (
                    <img
                      src={selectedNft.collection.image_url}
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
                  <div>
                    <Badge variant="outline" className="mb-2">
                      Token #{selectedNft.token_id}
                    </Badge>
                    {selectedNft.collection && (
                      <Button
                        variant="link"
                        className="p-0 h-auto text-primary"
                        onClick={() => {
                          setSelectedNft(null);
                          navigate(`/launchpad/${selectedNft.collection_id}`);
                        }}
                      >
                        {selectedNft.collection.name}
                        <ArrowUpRight className="w-3 h-3 ml-1" />
                      </Button>
                    )}
                    {selectedNft.description && (
                      <p className="text-muted-foreground text-sm mt-2">
                        {selectedNft.description}
                      </p>
                    )}
                  </div>

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
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">Attributes</h4>
                        {(() => {
                          const score = rarityScores.get(selectedNft.id) ?? 50;
                          const tier = getRarityTier(score);
                          const rarity = RARITY_CONFIG[tier];
                          const RarityIcon = rarity.icon;
                          return (
                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${rarity.bgColor}`}>
                              <RarityIcon className={`w-3.5 h-3.5 ${rarity.color}`} />
                              <span className={`text-xs font-medium ${rarity.color}`}>{rarity.label}</span>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {selectedNft.attributes.map((attr, i) => {
                          const key = `${attr.trait_type}:${attr.value}`;
                          const traitInfo = traitRarityData.get(selectedNft.id)?.get(key);
                          const percent = traitInfo?.percent ?? 50;
                          const traitTier = getTraitRarityTier(percent);
                          const traitRarity = RARITY_CONFIG[traitTier];

                          return (
                            <div
                              key={i}
                              className={`relative overflow-hidden rounded-lg p-2 border ${traitTier !== 'common'
                                ? `${traitRarity.bgColor} border-${traitTier === 'legendary' ? 'amber' : traitTier === 'epic' ? 'purple' : traitTier === 'rare' ? 'blue' : 'green'}-500/30`
                                : 'bg-muted/50 border-transparent'
                                }`}
                            >
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                {attr.trait_type}
                              </p>
                              <p className="font-medium text-sm truncate">
                                {attr.value}
                              </p>
                              <div className="flex items-center justify-between mt-1">
                                <span className={`text-[10px] font-medium ${traitRarity.color}`}>
                                  {traitInfo ? `${traitInfo.count}/${traitInfo.total}` : '—'}
                                </span>
                                <span className={`text-[10px] font-semibold ${traitRarity.color}`}>
                                  {percent.toFixed(1)}%
                                </span>
                              </div>
                              {/* Rarity bar */}
                              <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${traitTier === 'legendary' ? 'bg-amber-400' :
                                    traitTier === 'epic' ? 'bg-purple-400' :
                                      traitTier === 'rare' ? 'bg-blue-400' :
                                        traitTier === 'uncommon' ? 'bg-green-400' :
                                          'bg-muted-foreground'
                                    }`}
                                  style={{ width: `${Math.max(5, 100 - percent)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-2">
                    {/* On-chain-only info badge */}
                    {selectedNft.source === 'onchain' && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <span className="text-xs text-blue-400">
                          This NFT was found on-chain in your wallet
                        </span>
                      </div>
                    )}

                    {/* List for Sale Button — only for DB-backed NFTs */}
                    {selectedNft.source !== 'onchain' && (
                      <>
                        {!listedNftIds.has(selectedNft.id) ? (
                          <Button
                            variant="default"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setSelectedNft(null);
                              setListNft(selectedNft);
                            }}
                          >
                            <Tag className="w-4 h-4 mr-2" />
                            List for Sale
                          </Button>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <Badge variant="secondary" className="w-full justify-center py-2">
                              Listed for {listingsMap.get(selectedNft.id)?.price.toFixed(2)} {chainSymbol}
                            </Badge>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="w-full"
                              onClick={() => handleCancelListing(selectedNft.id)}
                              disabled={isCancelling === selectedNft.id}
                            >
                              {isCancelling === selectedNft.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <XCircle className="w-4 h-4 mr-2" />
                              )}
                              Cancel Listing
                            </Button>
                          </div>
                        )}
                      </>
                    )}

                    {/* Create Raffle Button - Only for DB-backed 1-of-1s not listed */}
                    {selectedNft.source !== 'onchain' && !listedNftIds.has(selectedNft.id) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setSelectedNft(null);
                          setRaffleNft(selectedNft);
                        }}
                      >
                        <Ticket className="w-4 h-4 mr-2" />
                        Create Raffle
                      </Button>
                    )}

                    {/* Transfer Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setSelectedNft(null);
                        setTransferNft(selectedNft);
                      }}
                      disabled={listedNftIds.has(selectedNft.id)}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Transfer NFT
                    </Button>

                    <div className="flex gap-2">
                      {/* On-chain NFTs: view asset on explorer; DB NFTs: view TX */}
                      {selectedNft.source === 'onchain' && selectedNft.onChainAddress ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => window.open(`https://explorer.solana.com/address/${selectedNft.onChainAddress}?cluster=devnet`, "_blank")}
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          View on Explorer
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => window.open(explorerUrl(selectedNft.tx_hash), "_blank")}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View TX
                          </Button>
                          {tokenExplorerUrl(selectedNft.collection?.contract_address || null, selectedNft.token_id) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => window.open(tokenExplorerUrl(selectedNft.collection?.contract_address || null, selectedNft.token_id)!, "_blank")}
                            >
                              <ExternalLink className="w-4 h-4 mr-2" />
                              View Token
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Transfer Modal */}
      <NFTTransferModal
        open={!!transferNft}
        onOpenChange={(open) => !open && setTransferNft(null)}
        nft={transferNft}
        onTransferSuccess={() => {
          toast.success("NFT transferred successfully!");
          setTransferNft(null);
          fetchNFTs();
        }}
      />

      {/* List Modal */}
      <ListNFTModal
        nft={listNft ? {
          id: listNft.id,
          token_id: listNft.token_id,
          name: listNft.name,
          image_url: listNft.image_url,
          collection_id: listNft.collection_id,
          owner_address: listNft.owner_address,
          owner_id: currentUserId || "",
          collection: listNft.collection ? {
            contract_address: listNft.collection.contract_address,
            chain: listNft.collection.chain || null,
          } : undefined,
        } : null}
        open={!!listNft}
        onOpenChange={(open) => !open && setListNft(null)}
        onSuccess={() => {
          setListNft(null);
          fetchNFTs();
        }}
      />

      {/* Create Raffle Modal */}
      <CreateRaffleForNFT
        nft={raffleNft ? {
          id: raffleNft.id,
          token_id: raffleNft.token_id,
          name: raffleNft.name,
          description: raffleNft.description,
          image_url: raffleNft.image_url,
          collection_id: raffleNft.collection_id,
          collection: raffleNft.collection
        } : null}
        open={!!raffleNft}
        onOpenChange={(open) => !open && setRaffleNft(null)}
        onSuccess={() => {
          setRaffleNft(null);
          fetchNFTs();
          toast.success("Raffle created! Check the Raffles page.");
        }}
      />
    </div>
  );
}
