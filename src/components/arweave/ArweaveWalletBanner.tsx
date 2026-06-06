import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Wallet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useArweaveWallet } from "@/hooks/useArweaveWallet";

interface Props {
  /**
   * Optional upload size in bytes. When provided the banner shows a
   * pre-flight affordability check and warns if the user's AR balance is
   * insufficient for the upload.
   */
  pendingUploadBytes?: number;
  /** Hide the banner once a connected wallet has sufficient balance. */
  hideWhenReady?: boolean;
  className?: string;
}

const WANDER_URL = "https://www.wander.app/";

/**
 * Drop-in banner for any flow that needs an Arweave upload. Surfaces three
 * states: extension missing, connected wallet missing permissions, and
 * insufficient AR balance. Safe to mount anywhere — it only renders when
 * there's something the user needs to action.
 */
export function ArweaveWalletBanner({
  pendingUploadBytes,
  hideWhenReady = true,
  className,
}: Props) {
  const { installed, connected, address, balance, connect, refreshBalance, canAffordUpload, loading, error } =
    useArweaveWallet();
  const [priceAr, setPriceAr] = useState<number | null>(null);
  const [affordable, setAffordable] = useState<boolean | null>(null);

  // Pull balance once connected.
  useEffect(() => {
    if (connected) void refreshBalance();
  }, [connected, refreshBalance]);

  // Pre-flight price check whenever the pending size or address changes.
  useEffect(() => {
    if (!connected || !pendingUploadBytes || pendingUploadBytes <= 0) {
      setPriceAr(null);
      setAffordable(null);
      return;
    }
    let cancelled = false;
    void canAffordUpload(pendingUploadBytes).then((r) => {
      if (cancelled) return;
      setPriceAr(r.priceAr);
      setAffordable(r.ok);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, pendingUploadBytes, canAffordUpload]);

  // Missing extension.
  if (!installed) {
    return (
      <Alert className={className} variant="default">
        <Download className="h-4 w-4" />
        <AlertTitle>Install an Arweave wallet to upload</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>
            Uploads are signed by your Arweave wallet and paid in AR. Install
            Wander (the official Arweave wallet) to continue.
          </span>
          <a
            href={WANDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-2 text-primary underline"
          >
            Install Wander →
          </a>
        </AlertDescription>
      </Alert>
    );
  }

  // Installed but not yet connected.
  if (!connected || !address) {
    return (
      <Alert className={className}>
        <Wallet className="h-4 w-4" />
        <AlertTitle>Connect your Arweave wallet</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>Grant permissions so uploads can be signed in-browser.</span>
          {error && <span className="text-destructive text-sm">{error}</span>}
          <Button size="sm" onClick={() => void connect()} disabled={loading} className="w-fit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect wallet"}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Connected — show affordability if we have a target size.
  const insufficient = affordable === false;
  if (insufficient && priceAr !== null) {
    return (
      <Alert className={className} variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Insufficient AR balance</AlertTitle>
        <AlertDescription>
          This upload needs <strong>{priceAr.toFixed(6)} AR</strong>. Your balance is{" "}
          <strong>{(balance ?? 0).toFixed(6)} AR</strong>. Top up your wallet from an exchange
          that lists AR (e.g. Binance, KuCoin, MEXC, Gate) before retrying.
        </AlertDescription>
      </Alert>
    );
  }

  if (hideWhenReady && (pendingUploadBytes == null || affordable === true)) {
    return null;
  }

  return (
    <Alert className={className}>
      <CheckCircle2 className="h-4 w-4" />
      <AlertTitle>Arweave wallet ready</AlertTitle>
      <AlertDescription className="text-sm">
        {address.slice(0, 6)}…{address.slice(-4)} · Balance{" "}
        <strong>{(balance ?? 0).toFixed(6)} AR</strong>
        {priceAr !== null && (
          <>
            {" · "}This upload costs <strong>{priceAr.toFixed(6)} AR</strong>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

export default ArweaveWalletBanner;
