import { ReactNode } from "react";
import { Lock, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMonadHolder } from "@/hooks/useMonadHolder";

interface Props {
  contracts: string[];
  collectionName?: string;
  children: ReactNode;
}

/** Unlocks children only after the server confirms the connected Monad wallet holds an NFT. */
export function HolderGate({ contracts, collectionName, children }: Props) {
  const { isHolder, checking, error, verify, canCheck } = useMonadHolder(contracts);

  if (isHolder) {
    return (
      <div className="space-y-3">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <ShieldCheck className="h-3.5 w-3.5" /> Verified holder
        </p>
        {children}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed p-4 text-center text-sm">
      <Lock className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
      <p className="font-medium">Holder-only benefits</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {isHolder === false
          ? `This wallet doesn't hold an NFT from ${collectionName || "this collection"} yet.`
          : `Hold an NFT from ${collectionName || "this collection"} to unlock.`}
      </p>
      {canCheck ? (
        <Button size="sm" className="mt-3" onClick={verify} disabled={checking}>
          {checking && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {isHolder === false ? "Check again" : "Verify ownership"}
        </Button>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Connect a Monad wallet to check.</p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
