import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import Marketplace from "@/pages/Marketplace";


import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Clock, Users, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useBundleCountdown, formatCountdown } from "@/hooks/useBundleCountdown";
import { RaffleEntryModal } from "@/components/raffles/RaffleEntryModal";
import { CreateOneOfOneModal } from "@/components/raffles/CreateOneOfOneModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, LayoutGrid } from "lucide-react";
import { getErrorMessage } from "@/lib/errorUtils";
import type { Json } from "@/integrations/supabase/types";
import { SupportedChain, CHAINS, getStoredChain, setStoredChain } from "@/config/chains";
import { ChainIcon } from "@/components/launchpad/ChainSelector";
import { cn } from "@/lib/utils";

interface Raffle {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  prize_type: string;
  prize_details: Json;
  entry_price: number;
  max_tickets_per_user: number | null;
  total_tickets: number | null;
  required_collection_id: string | null;
  start_date: string;
  end_date: string;
  winner_count: number;
  is_drawn: boolean;
  winners: Json;
}

const RaffleCard: React.FC<{ raffle: Raffle; onEnter: (raffle: Raffle) => void; currency?: string }> = ({ raffle, onEnter, currency = "SOL" }) => {
  const countdown = useBundleCountdown(raffle.start_date, raffle.end_date, true);
  const isActive = !countdown.isNotStarted && !countdown.isExpired && !raffle.is_drawn;

  const getPrizeTypeLabel = (type: string) => {
    switch (type) {
      case 'nft': return 'NFT Prize';
      case 'token': return 'SOL Tokens';
      case 'shop_item': return 'Shop Items';
      case 'mixed': return 'Mixed Prizes';
      default: return type;
    }
  };

  return (
    <Card className="overflow-hidden hover:border-primary/50 transition-all duration-300 group">
      <div className="aspect-video relative overflow-hidden bg-muted">
        {raffle.image_url ? (
          <img
            src={raffle.image_url}
            alt={raffle.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Trophy className="w-16 h-16 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge variant={isActive ? "default" : "secondary"}>
            {countdown.isNotStarted ? "Coming Soon" : countdown.isExpired || raffle.is_drawn ? "Ended" : "Active"}
          </Badge>
          <Badge variant="outline" className="bg-background/80">
            {getPrizeTypeLabel(raffle.prize_type)}
          </Badge>
        </div>
      </div>

      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{raffle.name}</CardTitle>
        {raffle.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{raffle.description}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Ticket className="w-4 h-4 text-primary" />
            <span>{raffle.entry_price > 0 ? `${raffle.entry_price} ${currency}` : 'Free Entry'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <span>{raffle.winner_count} Winner{raffle.winner_count > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2 col-span-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className={countdown.isExpired ? "text-destructive" : "text-muted-foreground"}>
              {formatCountdown(countdown)}
            </span>
          </div>
          {raffle.total_tickets !== null && raffle.total_tickets > 0 && (
            <div className="flex items-center gap-2 col-span-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">{raffle.total_tickets} entries</span>
            </div>
          )}
        </div>

        <Button
          className="w-full"
          disabled={!isActive}
          onClick={() => onEnter(raffle)}
        >
          {countdown.isNotStarted ? "Starting Soon" :
            countdown.isExpired || raffle.is_drawn ? "Raffle Ended" :
              "Enter Raffle"}
        </Button>
      </CardContent>
    </Card>
  );
};

const Raffles: React.FC = () => {
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRaffle, setSelectedRaffle] = useState<Raffle | null>(null);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);
  const { toast } = useToast();

  const [selectedChain, setSelectedChain] = useState<SupportedChain>(getStoredChain() || 'solana');
  const currentChain = CHAINS[selectedChain];

  const handleChainChange = (chain: SupportedChain) => {
    setStoredChain(chain);
    setSelectedChain(chain);
  };

  useEffect(() => {
    fetchRaffles();
  }, []);

  const fetchRaffles = async () => {
    try {
      const { data, error } = await supabase
        .from('lily_raffles')
        .select('*')
        .eq('is_active', true)
        .order('end_date', { ascending: true });

      if (error) throw error;
      setRaffles((data || []) as unknown as Raffle[]);
    } catch (error: unknown) {
      toast({
        title: "Error loading raffles",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
              <Ticket className="w-8 h-8 text-primary" />
              Raffles & Studio
            </h1>
            <p className="text-muted-foreground">
              Launch and collect 1/1 art and limited editions
            </p>
          </div>
          <Button onClick={() => setIsLaunchOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Launch {currentChain.name} 1/1
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {(['solana', 'monad'] as SupportedChain[]).map(chain => {
            const config = CHAINS[chain];
            return (
              <button
                key={chain}
                onClick={() => handleChainChange(chain)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-medium",
                  selectedChain === chain
                    ? "bg-primary/20 border-primary shadow-[0_0_15px_rgba(var(--primary),0.3)] text-primary"
                    : "bg-card hover:bg-muted text-muted-foreground"
                )}
              >
                <ChainIcon chain={chain} className="w-4 h-4" />
                {config.name}
              </button>
            );
          })}
        </div>

        <Tabs defaultValue="raffles" className="space-y-6">
          <TabsList>
            <TabsTrigger value="raffles" className="gap-2">
              <Ticket className="w-4 h-4" />
              Active Raffles
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="gap-2">
              <LayoutGrid className="w-4 h-4" />
              1/1 Marketplace
            </TabsTrigger>
          </TabsList>

          <TabsContent value="raffles">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="aspect-video w-full" />
                    <CardHeader className="pb-2">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-full mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-5 w-full col-span-2" />
                      </div>
                      <Skeleton className="h-10 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : raffles.length === 0 ? (
              <Card className="p-12 text-center">
                <Ticket className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">No Active Raffles</h3>
                <p className="text-muted-foreground">Check back soon for new raffle opportunities!</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {raffles.map((raffle) => (
                  <RaffleCard
                    key={raffle.id}
                    raffle={raffle}
                    onEnter={setSelectedRaffle}
                    currency={currentChain.symbol}
                  />
                ))}
              </div>
            )}
          </TabsContent>

                      <TabsContent value="marketplace">
              <Marketplace />
            </TabsContent>
        </Tabs>
      </main>

      {selectedRaffle && (
        <RaffleEntryModal
          raffle={selectedRaffle}
          open={!!selectedRaffle}
          onOpenChange={(open) => !open && setSelectedRaffle(null)}
          onSuccess={fetchRaffles}
          currency={currentChain.symbol}
          chain={selectedChain}
        />
      )}

      <CreateOneOfOneModal
        open={isLaunchOpen}
        onOpenChange={setIsLaunchOpen}
        chain={selectedChain}
      />
    </div>
  );
};

export default Raffles;
