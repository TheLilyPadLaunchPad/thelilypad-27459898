import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { toast } from "sonner";
import { Loader2, Play, AlertTriangle } from "lucide-react";

interface BuybackProgram {
  id: string;
  name: string;
  chain: string;
  network: string;
  token_mint: string;
  dex: string;
  slippage_bps: number;
  min_interval_minutes: number;
  max_notional_per_run: number;
  min_pool_balance: number;
  enabled: boolean;
  last_run_at: string | null;
}

interface BuybackEventRow {
  id: string;
  status: string;
  chain: string | null;
  token_address: string | null;
  mon_spent: number | null;
  tokens_bought: number | null;
  tx_hash: string | null;
  scheduled_for: string;
  confirmed_at: string | null;
  attempts: number;
}

export default function AdminBuyback() {
  const qc = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [triggering, setTriggering] = useState<string | null>(null);

  useSEO({ title: "Buyback Admin | The Lily Pad", description: "Manage buyback programs and trigger swaps." });

  const { data: programs, isLoading: progLoading } = useQuery({
    queryKey: ["buyback-programs-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buyback_programs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BuybackProgram[];
    },
  });

  const { data: events } = useQuery({
    queryKey: ["buyback-events-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buyback_events_public" as never)
        .select("*")
        .order("scheduled_for", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data as unknown as BuybackEventRow[];
    },
    refetchInterval: 15000,
  });

  async function trigger(programId: string) {
    const amount = parseFloat(amounts[programId] ?? "");
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setTriggering(programId);
    try {
      const idem = `manual:${programId}:${Math.floor(Date.now() / 60000)}`;
      const { data, error } = await supabase.functions.invoke("buyback-trigger", {
        body: { program_id: programId, amount, idempotency_key: idem },
      });
      if (error) throw error;
      toast.success(`Buyback queued (event ${(data as { event_id: string }).event_id.slice(0, 8)}…)`);
      qc.invalidateQueries({ queryKey: ["buyback-events-recent"] });
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to queue buyback");
    } finally {
      setTriggering(null);
    }
  }

  async function toggleEnabled(p: BuybackProgram) {
    const { error } = await supabase
      .from("buyback_programs")
      .update({ enabled: !p.enabled })
      .eq("id", p.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Program ${!p.enabled ? "enabled" : "disabled"}`);
      qc.invalidateQueries({ queryKey: ["buyback-programs-admin"] });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Buyback Admin</h1>
          <p className="text-muted-foreground">
            Configure programs, manually trigger buybacks, and monitor the scheduler.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Programs</CardTitle>
            <CardDescription>
              The scheduler ticks every 5 minutes and runs queued buybacks for enabled programs.
              After 3 failures in 1 hour the program auto-disables (circuit breaker).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {progLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : !programs?.length ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                No programs yet. Insert a row into <code>buyback_programs</code> to begin.
              </div>
            ) : (
              <div className="space-y-4">
                {programs.map((p) => (
                  <div key={p.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold">
                          {p.name}{" "}
                          <Badge variant={p.enabled ? "default" : "secondary"}>
                            {p.enabled ? "enabled" : "disabled"}
                          </Badge>{" "}
                          <Badge variant="outline">{p.chain}</Badge>
                          <Badge variant="outline" className="ml-1">{p.dex}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono truncate">{p.token_mint}</div>
                        <div className="text-xs text-muted-foreground">
                          slippage {p.slippage_bps} bps · min {p.min_interval_minutes}m ·
                          max {p.max_notional_per_run} · floor {p.min_pool_balance}
                          {p.last_run_at ? ` · last ${new Date(p.last_run_at).toLocaleString()}` : ""}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => toggleEnabled(p)}>
                        {p.enabled ? "Disable" : "Enable"}
                      </Button>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 max-w-xs">
                        <Label htmlFor={`amt-${p.id}`} className="text-xs">Amount (SOL)</Label>
                        <Input
                          id={`amt-${p.id}`}
                          type="number"
                          step="0.001"
                          placeholder={`max ${p.max_notional_per_run}`}
                          value={amounts[p.id] ?? ""}
                          onChange={(e) => setAmounts((a) => ({ ...a, [p.id]: e.target.value }))}
                        />
                      </div>
                      <Button
                        onClick={() => trigger(p.id)}
                        disabled={!p.enabled || triggering === p.id}
                      >
                        {triggering === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Queue buyback
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent events</CardTitle>
            <CardDescription>Live state machine (auto-refreshes every 15s).</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Tx</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Attempts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events?.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Badge
                        variant={
                          e.status === "confirmed" ? "default" :
                          e.status === "failed" ? "destructive" :
                          e.status === "executing" ? "secondary" : "outline"
                        }
                      >{e.status}</Badge>
                    </TableCell>
                    <TableCell>{e.chain ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[120px]">
                      {e.token_address ?? "—"}
                    </TableCell>
                    <TableCell>{e.mon_spent ?? "—"}</TableCell>
                    <TableCell>{e.tokens_bought ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[140px]">
                      {e.tx_hash ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(e.scheduled_for).toLocaleString()}
                    </TableCell>
                    <TableCell>{e.attempts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
