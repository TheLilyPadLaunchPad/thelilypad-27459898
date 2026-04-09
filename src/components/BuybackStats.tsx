import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Coins, Activity, ArrowUpRight, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BuybackStatsProps {
  chain?: 'solana' | 'monad';
}

const BuybackStats = ({ chain = 'solana' }: BuybackStatsProps) => {
  const getCurrencySymbol = (c: string) => {
    switch (c) {
      case 'monad': return 'MON';
      default: return 'SOL';
    }
  };

  const currencySymbol = getCurrencySymbol(chain);

  const { data: poolData } = useQuery({
    queryKey: ['buyback-pool', chain],
    queryFn: async () => {
      const { data } = await supabase
        .from('buyback_pool')
        .select('*')
        .maybeSingle();
      return data;
    },
  });

  const { data: recentVolume } = useQuery({
    queryKey: ['volume-tracking-recent', chain],
    queryFn: async () => {
      const { data } = await supabase
        .from('volume_tracking')
        .select('source_type, volume_amount, weighted_volume')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const { data: buybackEvents } = useQuery({
    queryKey: ['buyback-events', chain],
    queryFn: async () => {
      const { data } = await supabase
        .from('buyback_events')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const poolBalance = poolData?.pool_balance || 0;
  const accumulatedVolume = poolData?.accumulated_volume || 0;
  const threshold = poolData?.buyback_threshold || 100;
  const progress = threshold > 0 ? Math.min((accumulatedVolume / threshold) * 100, 100) : 0;
  const totalBuybacks = poolData?.total_buybacks_executed || 0;

  const volumeBySource = recentVolume?.reduce((acc, v) => {
    acc[v.source_type] = (acc[v.source_type] || 0) + Number(v.volume_amount);
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <Card className="border-primary/20 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-primary" />
          Buyback Pool Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pool Balance */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Pool Balance</span>
          <span className="font-bold text-primary">{Number(poolBalance).toFixed(4)} {currencySymbol}</span>
        </div>

        {/* Progress to Next Buyback */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Volume Progress</span>
            <span className="font-medium">{Number(accumulatedVolume).toFixed(2)} / {threshold} {currencySymbol}</span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {progress >= 100 ? "Buyback ready!" : `${(100 - progress).toFixed(1)}% more volume needed`}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/30 p-3 text-center">
            <Coins className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
            <p className="text-lg font-bold">{totalBuybacks}</p>
            <p className="text-xs text-muted-foreground">Total Buybacks</p>
          </div>
          <div className="rounded-lg bg-muted/30 p-3 text-center">
            <Activity className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
            <p className="text-lg font-bold">{recentVolume?.length || 0}</p>
            <p className="text-xs text-muted-foreground">24h Transactions</p>
          </div>
        </div>

        {/* Volume by Source */}
        {Object.keys(volumeBySource).length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">24h Volume by Source</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(volumeBySource).map(([source, amount]) => (
                <Badge key={source} variant="secondary" className="text-xs">
                  {source}: {Number(amount).toFixed(2)} {currencySymbol}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Recent Buybacks */}
        {buybackEvents && buybackEvents.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Recent Buybacks</p>
            <div className="space-y-1">
              {buybackEvents.slice(0, 3).map((event) => (
                <div key={event.id} className="flex items-center justify-between text-xs bg-muted/20 rounded px-2 py-1">
                  <span className="flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 text-green-500" />
                    {Number(event.mon_spent).toFixed(2)} {currencySymbol}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(event.executed_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Platform Fee Info */}
        <div className="border-t pt-3 mt-3 space-y-3">
          <p className="text-xs text-muted-foreground text-center">
            2.5% platform fee • 50% goes to buyback pool
          </p>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/buyback-program">
              Learn More
              <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default BuybackStats;
