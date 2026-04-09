import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LiveBuybackStats from "@/components/LiveBuybackStats";
import { BuybackProgramBadge } from "@/components/BuybackProgramBadge";
import { VolumeLeaderboard } from "@/components/VolumeLeaderboard";
import { RewardCalculator } from "@/components/RewardCalculator";
import { RewardHistory } from "@/components/RewardHistory";
import { VolumeSimulator } from "@/components/VolumeSimulator";
import { VolumeChart } from "@/components/VolumeChart";
import { PersonalVolumeStats } from "@/components/PersonalVolumeStats";
import { VolumeAchievements } from "@/components/VolumeAchievements";
import { TradingStreak } from "@/components/TradingStreak";
import { StreakLeaderboard } from "@/components/StreakLeaderboard";
import { StreakChallenge } from "@/components/StreakChallenge";
import { ChallengeBadges } from "@/components/ChallengeBadges";
import { RewardsClaimCard } from "@/components/RewardsClaimCard";
import { TokenLaunchMechanics } from "@/components/TokenLaunchMechanics";
import { useBuybackProgram } from "@/hooks/useBuybackProgram";
import { useSEO } from "@/hooks/useSEO";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp,
  Gift,
  Coins,
  Trophy,
  Sparkles,
  ArrowRight,
  Rocket,
  Shield,
  Users,
  Zap,
  ChevronRight
} from "lucide-react";

interface Collection {
  id: string;
  name: string;
  image_url: string | null;
  creator_address: string;
  total_supply: number;
  minted: number;
  status: string;
}

export default function BuybackProgram() {
  const navigate = useNavigate();
  const [selectedChain, setSelectedChain] = useState<'solana' | 'monad'>('solana');
  const { programCollections, isLoading: isProgramLoading } = useBuybackProgram(selectedChain);

  useSEO({
    title: "Buyback Program | The Lily Pad",
    description: "Learn about The Lily Pad Buyback Program. Trade NFTs from enrolled collections and earn rewards as a top volume mover."
  });

  // Fetch collection details for enrolled collections
  const { data: collections, isLoading: isCollectionsLoading } = useQuery({
    queryKey: ['buyback-program-collection-details', programCollections, selectedChain],
    queryFn: async () => {
      if (!programCollections || programCollections.length === 0) return [];

      const collectionIds = programCollections.map(p => p.collection_id);
      const { data, error } = await supabase
        .from('collections')
        .select('id, name, image_url, creator_address, total_supply, minted, status')
        .in('id', collectionIds)
        .is('deleted_at', null);

      if (error) throw error;
      return data as Collection[];
    },
    enabled: !!programCollections && programCollections.length > 0,
  });

  const isLoading = isProgramLoading || isCollectionsLoading;

  const getCurrencyName = () => {
    switch (selectedChain) {
      case 'monad': return 'MON';
      default: return 'SOL';
    }
  };

  const benefits = [
    {
      icon: Coins,
      title: "Volume Rewards",
      description: `Top volume movers receive ${getCurrencyName()} token rewards distributed from the buyback pool.`,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      icon: Trophy,
      title: "Leaderboard Rankings",
      description: "Compete with other traders for top positions on the volume leaderboard.",
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      icon: Gift,
      title: "Creator Benefits",
      description: "Enrolled collections receive featured status and increased visibility.",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      icon: Shield,
      title: "Verified Collections",
      description: "All program collections are verified and deployed on The Lily Pad.",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
  ];

  const howItWorks = [
    {
      step: 1,
      title: "Collections are Selected",
      description: "The Lily Pad team selects high-quality collections to join the buyback program.",
    },
    {
      step: 2,
      title: "Trade NFTs",
      description: "Buy, sell, and trade NFTs from enrolled collections on the marketplace.",
    },
    {
      step: 3,
      title: "Volume is Tracked",
      description: "Your trading volume is automatically tracked and weighted for rewards.",
    },
    {
      step: 4,
      title: "Earn Rewards",
      description: `Top volume movers receive ${getCurrencyName()} rewards from the accumulated buyback pool.`,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 pt-24 pb-12">
        {/* Make tabs global for the page or just control filtering? 
            Ideally, wrapped around the content but below the main hero title? 
            Let's put it at the top of the main area for clear context. 
        */}
        <div className="flex justify-end mb-4">
          <Tabs value={selectedChain} onValueChange={(v) => setSelectedChain(v as any)} className="w-[300px]">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="solana">Solana</TabsTrigger>
              <TabsTrigger value="monad">Monad</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
            <TrendingUp className="w-5 h-5" />
            <span className="font-medium">Buyback Program</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            Trade NFTs. <span className="text-primary">Earn Rewards.</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            The Lily Pad Buyback Program rewards top volume traders with {getCurrencyName()} tokens.
            Trade NFTs from enrolled collections and climb the leaderboard.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button size="lg" onClick={() => navigate('/marketplace')}>
              <Rocket className="w-5 h-5 mr-2" />
              Browse Marketplace
            </Button>
            <Button size="lg" variant="outline" onClick={() => document.getElementById('collections')?.scrollIntoView({ behavior: 'smooth' })}>
              View Collections
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>

        {/* Token Launch Mechanics */}
        <div className="mb-16">
          <TokenLaunchMechanics chain={selectedChain} />
        </div>

        {/* Live Stats, Leaderboard, and Rewards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-16">
          <div className="lg:col-span-2 space-y-6">
            <LiveBuybackStats chain={selectedChain} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <PersonalVolumeStats />
              <TradingStreak />
            </div>
            <VolumeAchievements />
            <RewardsClaimCard />
            <VolumeChart />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <RewardCalculator />
              <VolumeSimulator />
            </div>
            <RewardHistory />
          </div>
          <div className="space-y-6">
            <VolumeLeaderboard />
            <StreakLeaderboard />
            <StreakChallenge />
            <ChallengeBadges />
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8">Program Benefits</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, index) => (
              <Card key={index} className="border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="pt-6">
                  <div className={`p-3 rounded-xl ${benefit.bgColor} w-fit mb-4`}>
                    <benefit.icon className={`w-6 h-6 ${benefit.color}`} />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{benefit.title}</h3>
                  <p className="text-sm text-muted-foreground">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8">How It Works</h2>
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              {/* Connection line */}
              <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gradient-to-b from-primary via-primary/50 to-primary/20 hidden sm:block" />

              <div className="space-y-6">
                {howItWorks.map((item, index) => (
                  <div key={index} className="flex gap-4 items-start">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center z-10 bg-background">
                      <span className="font-bold text-primary">{item.step}</span>
                    </div>
                    <Card className="flex-1">
                      <CardContent className="py-4">
                        <h3 className="font-semibold mb-1">{item.title}</h3>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Enrolled Collections */}
        <div id="collections" className="scroll-mt-24">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Enrolled Collections</h2>
                <p className="text-sm text-muted-foreground">
                  Trade NFTs from these collections to participate in the buyback program
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Users className="w-3 h-3" />
              {collections?.length || 0} Collections
            </Badge>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-square" />
                  <CardHeader className="pb-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-2 w-full mb-2" />
                    <Skeleton className="h-4 w-1/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : collections && collections.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {collections.map((collection) => {
                const mintProgress = collection.total_supply > 0
                  ? (collection.minted / collection.total_supply) * 100
                  : 0;

                return (
                  <Card
                    key={collection.id}
                    className="overflow-hidden hover:border-primary/50 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/collection/${collection.id}`)}
                  >
                    <div className="aspect-square relative overflow-hidden bg-muted">
                      {collection.image_url ? (
                        <img
                          src={collection.image_url}
                          alt={collection.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Rocket className="w-12 h-12 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute top-3 left-3">
                        <BuybackProgramBadge />
                      </div>
                      <Badge
                        variant="outline"
                        className={`absolute top-3 right-3 ${collection.status === 'live'
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : collection.status === 'upcoming'
                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                            : 'bg-muted text-muted-foreground border-border'
                          }`}
                      >
                        <Sparkles className="w-3 h-3 mr-1" />
                        {collection.status.charAt(0).toUpperCase() + collection.status.slice(1)}
                      </Badge>
                    </div>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg truncate">{collection.name}</CardTitle>
                      <CardDescription>
                        by {collection.creator_address.slice(0, 6)}...{collection.creator_address.slice(-4)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Minted</span>
                        <span className="font-medium">{collection.minted} / {collection.total_supply}</span>
                      </div>
                      <Progress value={mintProgress} className="h-1.5" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 rounded-full bg-muted">
                  <Sparkles className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">No Collections Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    The buyback program is coming soon. Check back later for enrolled collections.
                  </p>
                  <Button variant="outline" onClick={() => navigate('/marketplace')}>
                    Browse Marketplace
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* CTA Section */}
        <div className="mt-16">
          <Card className="bg-gradient-to-br from-primary/10 to-green-500/10 border-primary/30">
            <CardContent className="py-12 text-center">
              <Zap className="w-12 h-12 text-primary mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Ready to Start Earning?</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Browse the marketplace, trade NFTs from enrolled collections, and compete for top volume rewards.
              </p>
              <Button size="lg" onClick={() => navigate('/marketplace')}>
                <Rocket className="w-5 h-5 mr-2" />
                Go to Marketplace
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
