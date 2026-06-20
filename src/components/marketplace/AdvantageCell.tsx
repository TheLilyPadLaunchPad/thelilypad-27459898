import { Badge } from "@/components/ui/badge";
import {
  LILY_PAD_ADVANTAGE,
  COMPETITOR_FEES,
} from "@/config/marketComparison";
import type { MarketPulseChain } from "@/hooks/useMarketPulse";
import { TrendingUp, ShieldCheck, Coins } from "lucide-react";

interface Props {
  chain: MarketPulseChain;
  compact?: boolean;
}

export function AdvantageCell({ chain, compact }: Props) {
  const comp = COMPETITOR_FEES[chain];
  const lily = LILY_PAD_ADVANTAGE;
  const feeDelta = (comp.fee - lily.platformFeePct).toFixed(1);

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary" className="text-[10px]">
          <Coins className="w-3 h-3 mr-1" /> {lily.buybackPct}% buyback
        </Badge>
        {!comp.royaltyEnforced && (
          <Badge variant="secondary" className="text-[10px]">
            <ShieldCheck className="w-3 h-3 mr-1" /> royalties enforced
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs space-y-1">
      <div className="flex items-center gap-1 font-semibold text-primary">
        <TrendingUp className="w-3 h-3" /> Lily Pad Advantage
      </div>
      <div className="text-muted-foreground">
        Fee {lily.platformFeePct}% vs {comp.name} {comp.fee}%
        {Number(feeDelta) > 0 && (
          <span className="ml-1 text-primary">(−{feeDelta}%)</span>
        )}
      </div>
      <div className="text-muted-foreground">
        Buyback {lily.buybackPct}% of trades · royalties enforced
      </div>
    </div>
  );
}
