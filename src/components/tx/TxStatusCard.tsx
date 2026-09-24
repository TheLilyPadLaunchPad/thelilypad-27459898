import { CheckCircle2, Loader2, XCircle, Ban, ExternalLink, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTxExplorerUrl } from "@/lib/chainUtils";
import type { TxStatus } from "@/hooks/useTxStatus";
import { cn } from "@/lib/utils";

interface Props {
  status: TxStatus;
  chain?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

const COPY: Record<string, { title: string; body: string }> = {
  awaiting_signature: { title: "Pending", body: "Waiting for you to approve in your wallet…" },
  submitted: { title: "Submitted", body: "Sent to the network — waiting for confirmation…" },
  confirmed: { title: "Confirmed", body: "Done! Your transaction is confirmed on chain." },
  failed: { title: "Failed", body: "The transaction didn't go through." },
  cancelled: { title: "Cancelled in wallet", body: "Nothing was sent and no funds moved." },
};

export function TxStatusCard({ status, chain = "solana", onRetry, onDismiss, className }: Props) {
  if (status.state === "idle") return null;
  const copy = COPY[status.state];
  const busy = status.state === "awaiting_signature" || status.state === "submitted";

  const tone =
    status.state === "confirmed"
      ? "border-primary/40 bg-primary/10"
      : status.state === "failed"
        ? "border-destructive/40 bg-destructive/10"
        : "border-border bg-muted/40";

  const Icon = busy ? Loader2 : status.state === "confirmed" ? CheckCircle2 : status.state === "failed" ? XCircle : Ban;

  return (
    <div role="status" aria-live="polite" className={cn("rounded-lg border p-3 text-sm", tone, className)}>
      <div className="flex items-start gap-2">
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            busy && "animate-spin",
            status.state === "confirmed" && "text-primary",
            status.state === "failed" && "text-destructive",
            status.state === "cancelled" && "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {copy.title}
            {status.label ? <span className="font-normal text-muted-foreground"> · {status.label}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">{status.state === "failed" && status.error ? status.error : copy.body}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {status.hash && (
              <a
                href={getTxExplorerUrl(status.hash, chain)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View on explorer <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {(status.state === "failed" || status.state === "cancelled") && onRetry && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onRetry}>
                <RotateCcw className="h-3 w-3" /> Try again
              </Button>
            )}
          </div>
        </div>
        {!busy && onDismiss && (
          <button aria-label="Dismiss" onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
