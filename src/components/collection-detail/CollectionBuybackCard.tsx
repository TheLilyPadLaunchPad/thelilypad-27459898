import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCollectionBuyback } from "@/hooks/useCollectionBuyback";
import { Repeat, ExternalLink } from "lucide-react";

interface Props {
  collectionId: string;
  chainSymbol?: string;
}

export function CollectionBuybackCard({ collectionId, chainSymbol = "SOL" }: Props) {
  const { enabled, contributionPct, totalContributedSol, contributions, loading } =
    useCollectionBuyback(collectionId);

  if (loading || !enabled) return null;

  const latest = contributions[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="w-5 h-5" />
          Buyback Program
        </CardTitle>
        <CardDescription>
          This collection routes {contributionPct ?? 0}% of mint revenue into the platform buyback pool at sellout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Contribution</span>
          <Badge variant="secondary">{contributionPct ?? 0}%</Badge>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Contributed to date</span>
          <span className="font-medium">
            {totalContributedSol.toFixed(4)} {chainSymbol}
          </span>
        </div>
        {latest && (
          <div className="flex justify-between text-sm items-center">
            <span className="text-muted-foreground">Latest</span>
            <span className="flex items-center gap-2">
              <Badge
                variant={
                  latest.status === "queued" || latest.status === "transferred"
                    ? "default"
                    : latest.status === "failed"
                    ? "destructive"
                    : "outline"
                }
              >
                {latest.status}
              </Badge>
              {latest.tx_signature && (
                <a
                  href={`https://solscan.io/tx/${latest.tx_signature}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                >
                  tx <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
