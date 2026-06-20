import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { MarketPulseTable } from "@/components/marketplace/MarketPulseTable";
import { AdvantageCell } from "@/components/marketplace/AdvantageCell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LILY_PAD_ADVANTAGE } from "@/config/marketComparison";
import { useSEO } from "@/hooks/useSEO";
import { Activity, TrendingUp } from "lucide-react";
import type { MarketPulseChain } from "@/hooks/useMarketPulse";

const CHAINS: { id: MarketPulseChain; label: string }[] = [
  { id: "solana", label: "Solana" },
  { id: "monad", label: "Monad" },
];

export default function MarketPulse() {
  const [chain, setChain] = useState<MarketPulseChain>("solana");

  useSEO({
    title: "Market Pulse | Top NFT Collections vs Lily Pad",
    description:
      "Top 20 NFT collections by 24h volume across Solana, Ethereum, and Monad. Compare floor, volume, and trading activity against the Lily Pad advantage — buyback-fueled volume and enforced royalties.",
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6 pb-24 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Activity className="w-7 h-7 text-primary" />
            Market Pulse
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Top 20 collections from the biggest marketplaces. See the floor,
            24h volume and total volume — then compare what Lily Pad gives
            creators and holders that the others don't.
          </p>
        </header>

        <Card className="border-primary/30">
          <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Platform fee" value={`${LILY_PAD_ADVANTAGE.platformFeePct}%`} />
            <Stat label="Buyback on trades" value={`${LILY_PAD_ADVANTAGE.buybackPct}%`} />
            <Stat label="Creator payout" value={`${LILY_PAD_ADVANTAGE.creatorPayoutPct}%`} />
            <Stat
              label="Royalties"
              value={LILY_PAD_ADVANTAGE.royaltyEnforced ? "Enforced" : "Optional"}
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-1.5 flex-wrap">
            {CHAINS.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={chain === c.id ? "default" : "outline"}
                onClick={() => setChain(c.id)}
              >
                {c.label}
              </Button>
            ))}
          </div>
          <AdvantageCell chain={chain} />
        </div>

        <MarketPulseTable chain={chain} limit={20} />

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <TrendingUp className="w-4 h-4 text-primary" /> Why Lily Pad
              prints better
            </div>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              {LILY_PAD_ADVANTAGE.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
