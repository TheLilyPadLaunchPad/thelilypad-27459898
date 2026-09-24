import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, XCircle, Ban, ExternalLink, Clock, Trash2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getTxExplorerUrl } from "@/lib/chainUtils";
import { clearTxHistory, isStale, readTxHistory, subscribeTxHistory, type TxKind, type TxRecord } from "@/lib/txHistory";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";

type Outcome = "all" | "pending" | "confirmed" | "failed";
const KINDS: { v: TxKind | "all"; l: string }[] = [
  { v: "all", l: "All" },
  { v: "launch", l: "Launches" },
  { v: "mint", l: "Mints" },
  { v: "marketplace", l: "Marketplace" },
];

const outcomeOf = (r: TxRecord): Exclude<Outcome, "all"> | "cancelled" | "unknown" => {
  if (isStale(r)) return "unknown";
  if (r.state === "awaiting_signature" || r.state === "submitted") return "pending";
  if (r.state === "confirmed") return "confirmed";
  if (r.state === "cancelled") return "cancelled";
  return "failed";
};

const BADGE: Record<string, { label: string; icon: any; cls: string }> = {
  pending: { label: "Pending", icon: Loader2, cls: "bg-accent text-accent-foreground" },
  confirmed: { label: "Confirmed", icon: CheckCircle2, cls: "bg-primary/15 text-primary" },
  failed: { label: "Failed", icon: XCircle, cls: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelled", icon: Ban, cls: "bg-muted text-muted-foreground" },
  unknown: { label: "Unconfirmed", icon: Clock, cls: "bg-muted text-muted-foreground" },
};

export default function TransactionHistory() {
  const [list, setList] = useState<TxRecord[]>(() => readTxHistory());
  const [kind, setKind] = useState<TxKind | "all">("all");
  const [outcome, setOutcome] = useState<Outcome>("all");

  useEffect(() => subscribeTxHistory(() => setList(readTxHistory())), []);

  const filtered = useMemo(
    () =>
      list.filter((r) => {
        if (kind !== "all" && r.kind !== kind) return false;
        if (outcome === "all") return true;
        const o = outcomeOf(r);
        return outcome === "failed" ? o === "failed" || o === "cancelled" : o === outcome;
      }),
    [list, kind, outcome],
  );

  return (
    <div className="min-h-screen bg-background">
    <Navbar />
    <main className="container max-w-4xl mx-auto px-4 pt-20 sm:pt-24 pb-12 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <History className="h-7 w-7 text-primary" /> Transaction history
          </h1>
          <p className="text-muted-foreground mt-1">Your launches, mints and marketplace actions made on this device.</p>
        </div>
        {list.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => confirm("Clear your transaction history on this device?") && clearTxHistory()}>
            <Trash2 className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Button key={k.v} size="sm" variant={kind === k.v ? "default" : "outline"} onClick={() => setKind(k.v)}>
            {k.l}
          </Button>
        ))}
        <span className="w-px bg-border mx-1" />
        {(["all", "pending", "confirmed", "failed"] as Outcome[]).map((o) => (
          <Button key={o} size="sm" variant={outcome === o ? "secondary" : "ghost"} onClick={() => setOutcome(o)} className="capitalize">
            {o === "all" ? "Any outcome" : o}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          {list.length === 0 ? "No transactions yet. Mints, launches and purchases you make will show up here." : "Nothing matches these filters."}
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const o = outcomeOf(r);
            const b = BADGE[o];
            const Icon = b.icon;
            return (
              <li key={r.id}>
                <Card className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{r.label}</span>
                      <Badge variant="outline" className="capitalize">{r.kind}</Badge>
                      {r.chain && <Badge variant="outline" className="capitalize">{r.chain}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleString()}</p>
                    {r.error && <p className="text-sm text-destructive mt-1">{r.error}</p>}
                    {o === "unknown" && <p className="text-sm text-muted-foreground mt-1">The page closed before this finished — check the explorer.</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium", b.cls)}>
                      <Icon className={cn("h-3.5 w-3.5", o === "pending" && "animate-spin")} /> {b.label}
                    </span>
                    {r.hash && (
                      <Button asChild size="sm" variant="ghost">
                        <a href={getTxExplorerUrl(r.hash, r.chain || "solana")} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          <span className="sr-only">View on explorer</span>
                        </a>
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
    </div>
  );
}
