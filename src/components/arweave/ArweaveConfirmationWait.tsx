import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  waitForConfirmation,
  type ConfirmationStatus,
} from "@/integrations/arweave/nativeClient";

interface Props {
  /** Arweave tx ids to wait on. Renders one row per id. */
  txIds: string[];
  /** Called when every tx has reached `minConfirmations`. */
  onAllConfirmed?: () => void;
  /** Called if any tx times out. Stops the wait. */
  onTimeout?: (txId: string, error: Error) => void;
  /** Minimum confirmations per tx before we treat it as durable. Default 1. */
  minConfirmations?: number;
  /** Total wait budget per tx in ms. Default 25 min. */
  timeoutMs?: number;
}

interface RowState {
  status: ConfirmationStatus;
  elapsedMs: number;
  done: boolean;
  error?: string;
}

const EXPECTED_WAIT_MS = 10 * 60 * 1000; // Used purely for the progress bar.

/**
 * Visible "waiting on Arweave confirmations" panel for slow uploads
 * (anything that went out as a base L1 tx). Drop it in before any step that
 * needs the tx data to be retrievable — Candy Machine create, on-chain
 * metadata writes, etc.
 */
export function ArweaveConfirmationWait({
  txIds,
  onAllConfirmed,
  onTimeout,
  minConfirmations = 1,
  timeoutMs,
}: Props) {
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    if (txIds.length === 0) return;
    let cancelled = false;
    let remaining = txIds.length;

    txIds.forEach((id) => {
      setRows((prev) => ({
        ...prev,
        [id]: {
          status: { confirmed: false, numberOfConfirmations: 0 },
          elapsedMs: 0,
          done: false,
        },
      }));

      waitForConfirmation(id, {
        minConfirmations,
        timeoutMs,
        onPoll: (status, elapsedMs) => {
          if (cancelled) return;
          setRows((prev) => ({
            ...prev,
            [id]: { ...prev[id], status, elapsedMs },
          }));
        },
      })
        .then(() => {
          if (cancelled) return;
          setRows((prev) => ({ ...prev, [id]: { ...prev[id], done: true } }));
          remaining -= 1;
          if (remaining === 0) onAllConfirmed?.();
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setRows((prev) => ({
            ...prev,
            [id]: { ...prev[id], error: err.message },
          }));
          onTimeout?.(id, err);
        });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txIds.join(",")]);

  const summary = useMemo(() => {
    const total = txIds.length;
    const done = Object.values(rows).filter((r) => r.done).length;
    return { total, done };
  }, [rows, txIds.length]);

  if (txIds.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {summary.done === summary.total ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          Waiting for Arweave to confirm {summary.done}/{summary.total} uploads
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Arweave finality typically takes 2–20 minutes. Keep this tab open —
          your uploads are already paid for and will appear as soon as the
          network confirms them.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {txIds.map((id) => {
          const row = rows[id];
          const pct = Math.min(
            100,
            row?.done
              ? 100
              : Math.round(((row?.elapsedMs ?? 0) / EXPECTED_WAIT_MS) * 100)
          );
          return (
            <div key={id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <code className="font-mono text-muted-foreground">
                  {id.slice(0, 8)}…{id.slice(-6)}
                </code>
                <span className="flex items-center gap-1 text-muted-foreground">
                  {row?.done ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-primary" /> confirmed
                    </>
                  ) : row?.error ? (
                    <span className="text-destructive">{row.error}</span>
                  ) : (
                    <>
                      <Clock className="h-3 w-3" />
                      {Math.round((row?.elapsedMs ?? 0) / 1000)}s elapsed
                    </>
                  )}
                </span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default ArweaveConfirmationWait;
