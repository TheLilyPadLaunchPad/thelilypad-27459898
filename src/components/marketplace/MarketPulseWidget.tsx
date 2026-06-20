import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Activity, ArrowRight } from "lucide-react";
import { MarketPulseTable } from "./MarketPulseTable";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MarketPulseChain } from "@/hooks/useMarketPulse";

const CHAINS: { id: MarketPulseChain; label: string }[] = [
  { id: "solana", label: "Solana" },
  { id: "ethereum", label: "Ethereum" },
  { id: "monad", label: "Monad" },
];

export function MarketPulseWidget() {
  const [chain, setChain] = useState<MarketPulseChain>("solana");

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="w-5 h-5 text-primary" />
            Market Pulse
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Top 10 collections across major marketplaces — with the Lily Pad
            advantage right beside them.
          </p>
        </div>
        <Link
          to="/market-pulse"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1 whitespace-nowrap"
        >
          See Top 20 <ArrowRight className="w-3 h-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1.5 flex-wrap">
          {CHAINS.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={chain === c.id ? "default" : "outline"}
              onClick={() => setChain(c.id)}
              className="h-7 text-xs"
            >
              {c.label}
            </Button>
          ))}
        </div>
        <MarketPulseTable chain={chain} limit={10} compact />
      </CardContent>
    </Card>
  );
}
