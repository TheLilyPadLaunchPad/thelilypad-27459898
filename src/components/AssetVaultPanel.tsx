/**
 * AssetVaultPanel — Inspect and operate a Metaplex Core asset's built-in
 * signer wallet (Asset Signer PDA).
 *
 * Every Core asset has a deterministic PDA that can hold SOL and tokens.
 * Only the asset's owner can move funds out, via the Core `execute`
 * instruction which lets the PDA sign a CPI.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2, Vault } from "lucide-react";
import { toast } from "sonner";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createNoopSigner, publicKey, sol, type Umi } from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { execute, fetchAssetV1, findAssetSignerPda } from "@metaplex-foundation/mpl-core";
import { transferSol, setComputeUnitPrice } from "@metaplex-foundation/mpl-toolbox";
import bs58 from "bs58";
import { getDasUmi } from "@/utils/dasApi";
import { getSolanaRpcUrl } from "@/config/solana";
import { useWallet } from "@/providers/WalletProvider";
import { createUmi } from "@/chains";
import { getErrorMessage } from "@/lib/errorUtils";
import { isValidSolanaAddress } from "@/lib/solanaNftTransfer";

interface AssetVaultPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Core asset address whose vault to inspect. */
  assetAddress: string | null;
  assetName?: string | null;
}

export function AssetVaultPanel({ open, onOpenChange, assetAddress, assetName }: AssetVaultPanelProps) {
  const { network, getSolanaProvider } = useWallet();
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [isCoreAsset, setIsCoreAsset] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const rpcUrl = getSolanaRpcUrl(network as "mainnet" | "devnet");
  const clusterParam = network === "devnet" ? "?cluster=devnet" : "";

  const loadVault = useCallback(async () => {
    if (!assetAddress || !isValidSolanaAddress(assetAddress)) {
      setVaultAddress(null);
      setIsCoreAsset(null);
      return;
    }
    setIsLoading(true);
    try {
      const dasUmi = getDasUmi(rpcUrl);
      const asset = await (dasUmi.rpc as any).getAsset(publicKey(assetAddress));
      const core = asset.interface === "MplCoreAsset" && asset.compression?.compressed !== true;
      setIsCoreAsset(core);
      if (!core) {
        setVaultAddress(null);
        setBalanceSol(null);
        return;
      }
      const pda = findAssetSignerPda(dasUmi, { asset: publicKey(assetAddress) });
      const address = pda[0].toString();
      setVaultAddress(address);
      const connection = new Connection(rpcUrl, "confirmed");
      const lamports = await connection.getBalance(new PublicKey(address));
      setBalanceSol(lamports / LAMPORTS_PER_SOL);
    } catch (err) {
      console.error("Vault lookup failed:", err);
      setIsCoreAsset(null);
      toast.error("Couldn't load the asset vault.");
    } finally {
      setIsLoading(false);
    }
  }, [assetAddress, rpcUrl]);

  useEffect(() => {
    if (open) {
      setRecipient("");
      setAmount("");
      setTxSignature(null);
      setProgress(null);
      void loadVault();
    }
  }, [open, loadVault]);

  const buildWalletUmi = async (): Promise<Umi> => {
    const provider = getSolanaProvider();
    if (!provider?.publicKey) throw new Error("Solana wallet not connected");
    const umi = await createUmi(network as "mainnet" | "devnet", null);
    const wallet = {
      publicKey: provider.publicKey,
      signTransaction: provider.signTransaction.bind(provider),
      signAllTransactions: provider.signAllTransactions.bind(provider),
      signMessage: provider.signMessage ? provider.signMessage.bind(provider) : undefined,
    };
    return umi.use(walletAdapterIdentity(wallet));
  };

  const handleSend = async () => {
    if (!assetAddress || !vaultAddress) return;
    if (!isValidSolanaAddress(recipient)) {
      toast.error("Enter a valid Solana recipient address.");
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter an amount greater than 0.");
      return;
    }
    if (balanceSol !== null && parsed > balanceSol) {
      toast.error("Amount exceeds the vault balance.");
      return;
    }

    setIsSending(true);
    try {
      setProgress("Preparing vault transaction…");
      const umi = await buildWalletUmi();
      const asset = await fetchAssetV1(umi, publicKey(assetAddress));
      const vaultSigner = createNoopSigner(publicKey(vaultAddress));

      setProgress("Waiting for wallet approval…");
      const result = await execute(umi, {
        asset,
        instructions: transferSol(umi, {
          source: vaultSigner,
          destination: publicKey(recipient),
          amount: sol(parsed),
        }),
      })
        .add(setComputeUnitPrice(umi, { microLamports: 50_000 }))
        .sendAndConfirm(umi, {
          send: { skipPreflight: false },
          confirm: { commitment: "confirmed" },
        });

      const signature = bs58.encode(result.signature);
      setTxSignature(signature);
      toast.success("Vault transfer sent.");
      void loadVault();
    } catch (err) {
      console.error("Vault transfer failed:", err);
      toast.error(getErrorMessage(err) || "Vault transfer failed. Only the asset owner can move funds.");
    } finally {
      setIsSending(false);
      setProgress(null);
    }
  };

  const copyVault = () => {
    if (!vaultAddress) return;
    void navigator.clipboard.writeText(vaultAddress);
    toast.success("Vault address copied.");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isSending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Vault className="w-5 h-5" />
            Asset Vault
          </DialogTitle>
          <DialogDescription>
            Every Core NFT has a built-in wallet that can hold SOL and tokens.
            Only the NFT's owner can move funds out.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : isCoreAsset === false ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {assetName || "This NFT"} isn't a Metaplex Core asset, so it has no
              built-in vault. Vaults are available on Core NFTs only.
            </AlertDescription>
          </Alert>
        ) : vaultAddress ? (
          <div className="space-y-4">
            <div className="p-3 rounded-lg border bg-muted/40 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Vault address</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyVault} aria-label="Copy vault address">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="View vault on explorer"
                    onClick={() => window.open(`https://explorer.solana.com/address/${vaultAddress}${clusterParam}`, "_blank")}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <code className="text-xs break-all">{vaultAddress}</code>
              <p className="text-sm font-medium">
                Balance: {balanceSol !== null ? `${balanceSol.toFixed(4)} SOL` : "…"}
              </p>
            </div>

            {txSignature ? (
              <Alert className="bg-green-500/10 border-green-500/30">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-green-500 space-y-2">
                  <p>Vault transfer confirmed.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`https://explorer.solana.com/tx/${txSignature}${clusterParam}`, "_blank")}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View transaction
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="vault-recipient">Send SOL to</Label>
                  <Input
                    id="vault-recipient"
                    placeholder="Recipient Solana address"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    disabled={isSending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vault-amount">Amount (SOL)</Label>
                  <Input
                    id="vault-amount"
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={isSending}
                  />
                </div>
                {progress && (
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {progress}
                  </p>
                )}
              </>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Close
          </Button>
          {vaultAddress && !txSignature && (
            <Button onClick={handleSend} disabled={isSending || !recipient || !amount}>
              {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Vault className="w-4 h-4 mr-2" />}
              Send from Vault
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssetVaultPanel;
