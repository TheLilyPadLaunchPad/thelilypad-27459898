import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Wallet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useArweaveWallet } from "@/hooks/useArweaveWallet";

interface Props {
  /** Optional upload size in bytes. Shows a SOL price preview when set. */
  pendingUploadBytes?: number;
  /** Hide the banner once the wallet is connected and (if checked) affordable. */
  hideWhenReady?: boolean;
  className?: string;
}

/**
 * Banner for any flow that needs permanent Arweave storage. Storage is
 * Solana-funded via Irys — no second wallet required, the connected
 * Phantom / Solflare wallet pays the upload fee in SOL.
 */
export function ArweaveWalletBanner({
  pendingUploadBytes,
  hideWhenReady = true,
  className,
}: Props) {
  const {
    installed,
    connected,
    address,
    balance,
    connect,
    refreshBalance,
    canAffordUpload,
    loading,
    error,
  } = useArweaveWallet();
  const [priceSol, setPriceSol] = useState<number | null>(null);
  const [affordable, setAffordable] = useState<boolean | null>(null);

  useEffect(() => {
    if (connected) void refreshBalance();
  }, [connected, refreshBalance]);

  useEffect(() => {
    if (!connected || !pendingUploadBytes || pendingUploadBytes <= 0) {
      setPriceSol(null);
      setAffordable(null);
      return;
    }
    let cancelled = false;
    void canAffordUpload(pendingUploadBytes).then((r) => {
      if (cancelled) return;
      setPriceSol(r.priceAr);
      setAffordable(r.ok);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, pendingUploadBytes, canAffordUpload]);

  if (!installed) {
    return (
      <Alert className={className} variant="default">
        <Wallet className="h-4 w-4" />
        <AlertTitle>Connect a Solana wallet to upload</AlertTitle>
        <AlertDescription>
          Permanent storage is paid in SOL via Irys using your connected
          Solana wallet (Phantom, Solflare, etc.). Connect a wallet to
          continue.
        </AlertDescription>
      </Alert>
    );
  }

  if (!connected || !address) {
    return (
      <Alert className={className}>
        <Wallet className="h-4 w-4" />
        <AlertTitle>Authorize permanent storage uploads</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>
            Your Solana wallet will sign upload receipts and (for files
            larger than ~100 KB) pay the storage fee in SOL.
          </span>
          {error && <span className="text-destructive text-sm">{error}</span>}
          <Button
            size="sm"
            onClick={() => void connect()}
            disabled={loading}
            className="w-fit"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Authorize"}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const insufficient = affordable === false;
  if (insufficient && priceSol !== null) {
    return (
      <Alert className={className} variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Insufficient SOL for permanent storage</AlertTitle>
        <AlertDescription>
          This upload needs <strong>{priceSol.toFixed(6)} SOL</strong> of
          funded Irys balance. Funded balance:{" "}
          <strong>{(balance ?? 0).toFixed(6)} SOL</strong>. Top up your
          Solana wallet and retry — funding will happen automatically on the
          next upload.
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
      <AlertTitle>Permanent storage ready</AlertTitle>
      <AlertDescription className="text-sm">
        {address.slice(0, 6)}…{address.slice(-4)} · Irys balance{" "}
        <strong>{(balance ?? 0).toFixed(6)} SOL</strong>
        {priceSol !== null && (
          <>
            {" · "}This upload costs <strong>{priceSol.toFixed(6)} SOL</strong>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

export default ArweaveWalletBanner;
