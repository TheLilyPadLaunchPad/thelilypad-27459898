import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO, startOfDay, eachDayOfInterval, subDays } from "date-fns";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface NFT {
  id: string;
  minted_at: string;
  collection_id: string;
}

interface CollectionStats {
  id: string;
  floorPrice: number | null;
  count: number;
}

interface PortfolioValueChartProps {
  nfts: NFT[];
  collectionStats: CollectionStats[];
  /** Currency symbol to display — e.g. 'SOL', 'MON'. Defaults to 'SOL'. */
  currency?: string;
}

export function PortfolioValueChart({ nfts, collectionStats, currency = 'SOL' }: PortfolioValueChartProps) {
  const chartData = useMemo(() => {
    if (nfts.length === 0) return [];

    // Create a map of collection ID to floor price
    const floorPrices = new Map<string, number>();
    collectionStats.forEach(stat => {
      if (stat.floorPrice !== null) {
        floorPrices.set(stat.id, stat.floorPrice);
      }
    });

    // Sort NFTs by minted date
    const sortedNfts = [...nfts].sort(
      (a, b) => new Date(a.minted_at).getTime() - new Date(b.minted_at).getTime()
    );

    if (sortedNfts.length === 0) return [];

    // Get date range - from first mint to today
    const firstMintDate = startOfDay(parseISO(sortedNfts[0].minted_at));
    const today = startOfDay(new Date());

    // Limit to last 90 days if portfolio is older
    const startDate = firstMintDate < subDays(today, 90) ? subDays(today, 90) : firstMintDate;

    // Generate all days in the range
    const allDays = eachDayOfInterval({ start: startDate, end: today });

    // Build cumulative data for each day
    let cumulativeNfts: NFT[] = [];

    // Pre-populate with NFTs minted before start date
    sortedNfts.forEach(nft => {
      const mintedDate = startOfDay(parseISO(nft.minted_at));
      if (mintedDate < startDate) {
        cumulativeNfts.push(nft);
      }
    });

    const data = allDays.map(day => {
      // Add NFTs minted on this day
      sortedNfts.forEach(nft => {
        const mintedDate = startOfDay(parseISO(nft.minted_at));
        if (mintedDate.getTime() === day.getTime()) {
          cumulativeNfts.push(nft);
        }
      });

      // Calculate portfolio value for this day using current floor prices
      let value = 0;
      cumulativeNfts.forEach(nft => {
        const floorPrice = floorPrices.get(nft.collection_id);
        if (floorPrice) {
          value += floorPrice;
        }
      });

      return {
        date: format(day, "MMM d"),
        fullDate: format(day, "MMM d, yyyy"),
        value: Number(value.toFixed(2)),
        nftCount: cumulativeNfts.length
      };
    });

    return data;
  }, [nfts, collectionStats]);

  // Calculate trend
  const trend = useMemo(() => {
    if (chartData.length < 2) return { direction: 'neutral' as const, percent: 0 };

    const firstValue = chartData[0].value;
    const lastValue = chartData[chartData.length - 1].value;

    if (firstValue === 0) {
      return { direction: 'up' as const, percent: 100 };
    }

    const percentChange = ((lastValue - firstValue) / firstValue) * 100;

    return {
      direction: percentChange > 0 ? 'up' as const : percentChange < 0 ? 'down' as const : 'neutral' as const,
      percent: Math.abs(percentChange)
    };
  }, [chartData]);

  if (chartData.length === 0) {
    return null;
  }

  const currentValue = chartData[chartData.length - 1]?.value || 0;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Portfolio Value Over Time</CardTitle>
          <div className="flex items-center gap-2">
            {trend.direction === 'up' && (
              <span className="flex items-center gap-1 text-sm text-green-500">
                <TrendingUp className="w-4 h-4" />
                +{trend.percent.toFixed(1)}%
              </span>
            )}
            {trend.direction === 'down' && (
              <span className="flex items-center gap-1 text-sm text-red-500">
                <TrendingDown className="w-4 h-4" />
                -{trend.percent.toFixed(1)}%
              </span>
            )}
            {trend.direction === 'neutral' && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Minus className="w-4 h-4" />
                0%
              </span>
            )}
          </div>
        </div>
        <p className="text-2xl font-bold">{currentValue.toFixed(2)} {currency}</p>
        <p className="text-xs text-muted-foreground">Estimated based on current floor prices</p>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}`}
                className="text-muted-foreground"
                width={50}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg p-3">
                        <p className="text-sm font-medium">{data.fullDate}</p>
                        <p className="text-lg font-bold text-primary">{data.value.toFixed(2)} {currency}</p>
                        <p className="text-xs text-muted-foreground">{data.nftCount} NFTs</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#portfolioGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
