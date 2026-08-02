import { useMarketPulse, type MarketPulseChain } from "@/hooks/useMarketPulse";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AdvantageCell } from "./AdvantageCell";
import { ExternalLink, ImageIcon } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";

interface Props {
  chain: MarketPulseChain;
  limit?: number;
  compact?: boolean;
}

function fmt(n: number | null, digits = 2): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function MarketPulseTable({ chain, limit = 20, compact = false }: Props) {
  const { data, isLoading, error } = useMarketPulse(chain, limit);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: Math.min(limit, 6) }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (error || !data?.length) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        Market data unavailable for {chain}. Showing Lily Pad advantage instead.
        <div className="max-w-sm mx-auto mt-3">
          <AdvantageCell chain={chain} />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Collection</th>
            <th className="px-3 py-2 text-right">Floor</th>
            <th className="px-3 py-2 text-right hidden sm:table-cell">24h Vol</th>
            <th className="px-3 py-2 text-right hidden md:table-cell">Total Vol</th>
            <th className="px-3 py-2 text-right hidden lg:table-cell">Listed</th>
            {!compact && (
              <th className="px-3 py-2 text-left hidden md:table-cell">
                Lily Pad
              </th>
            )}
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={`${row.chain}-${row.rank}-${row.name}`}
              className="border-t border-border hover:bg-muted/30 transition-colors"
            >
              <td className="px-3 py-2 text-muted-foreground">{row.rank}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  {row.image ? (
                    <SmartImage
                      src={row.image}
                      alt={row.name}
                      className="w-8 h-8 rounded object-cover"
                      displayWidth={64}
                      widths={[32, 64, 128]}
                      sizes="32px"
                      width={32}
                      height={32}
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate max-w-[160px]">
                      {row.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {row.marketplace}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {fmt(row.floor, 3)}{" "}
                <span className="text-muted-foreground">{row.currency}</span>
              </td>
              <td className="px-3 py-2 text-right hidden sm:table-cell whitespace-nowrap">
                {fmt(row.volume24h)} {row.currency}
              </td>
              <td className="px-3 py-2 text-right hidden md:table-cell whitespace-nowrap">
                {fmt(row.volumeTotal)} {row.currency}
              </td>
              <td className="px-3 py-2 text-right hidden lg:table-cell">
                {fmt(row.listed, 0)}
              </td>
              {!compact && (
                <td className="px-3 py-2 hidden md:table-cell">
                  <AdvantageCell chain={chain} compact />
                </td>
              )}
              <td className="px-3 py-2 text-right">
                {row.url && (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                  >
                    View <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
