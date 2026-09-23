import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/providers/WalletProvider";
import { CHAINS } from "@/config/chains";

/**
 * Sticky warning when the connected EVM wallet (Monad / Robinhood) is on a
 * different network than the app expects. Launch, marketplace and holder
 * actions should also check `isWrongNetwork` before sending transactions.
 */
export const WrongNetworkBanner = () => {
  const { isWrongNetwork, chainType, switchToExpectedNetwork } = useWallet();
  const [busy, setBusy] = useState(false);
  if (!isWrongNetwork) return null;
  const name = CHAINS[chainType]?.name ?? "the selected network";

  return (
    <div
      role="alert"
      className="fixed top-0 inset-x-0 z-[60] flex flex-wrap items-center justify-center gap-3 bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-md"
    >
      <AlertTriangle className="h-4 w-4" />
      <span>Your wallet is on the wrong network. Switch to {name} to mint, trade or claim holder benefits.</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try { await switchToExpectedNetwork(); } catch { /* toast shown by provider */ } finally { setBusy(false); }
        }}
      >
        {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
        Switch to {name}
      </Button>
    </div>
  );
};
