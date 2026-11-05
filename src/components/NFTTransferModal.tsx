/**
 * NFTTransferModal — Send a Solana NFT to another wallet.
 *
 * Supports Metaplex Core assets and Bubblegum V2 compressed NFTs through the
 * shared `transferSolanaNft` helper, which detects the standard via DAS and
 * resolves Merkle proofs for cNFTs automatically.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import { type Umi } from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { getDasUmi } from "@/utils/dasApi";
import { getSolanaRpcUrl } from "@/config/solana";
import { useWallet } from "@/providers/WalletProvider";
import { createUmi } from "@/chains";
import { getErrorMessage } from "@/lib/errorUtils";
import { isValidSolanaAddress, transferSolanaNft } from "@/lib/solanaNftTransfer";

interface NFTTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nft: {
    id: string;
    token_id: number;
    name: string | null;
    image_url: string | null;
    /** On-chain asset address (Core asset or cNFT id). Required to transfer. */
    assetAddress?: string | null;
    /** Core collection address, when known. */
    collectionAddress?: string | null;
    collection: {
      name: string;
      contract_address: string | null;
      image_url: string | null;
    } | null;
  } | null;
  onTransferSuccess: () => void;
}

export function NFTTransferModal({
  open,
  onOpenChange,
  nft,
  onTransferSuccess,
}: NFTTransferModalProps) {
  const { network, getSolanaProvider } = useWallet();
  const [recipientAddress, setRecipientAddress] = useState("");
  const [isValidAddress, setIsValidAddress] = useState<boolean | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const assetAddress = nft?.assetAddress || nft?.collection?.contract_address || null;
  const clusterParam = network === "devnet" ? "?cluster=devnet" : "";

  useEffect(() => {
    if (!open) {
      setRecipientAddress("");
      setIsValidAddress(null);
      setTxSignature(null);
      setError(null);
      setProgress(null);
    }
  }, [open]);

  useEffect(() => {
    if (recipientAddress.length === 0) {
      setIsValidAddress(null);
    } else {
      setIsValidAddress(isValidSolanaAddress(recipientAddress));
    }
  }, [recipientAddress]);

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

  const handleTransfer = async () => {
    if (!nft || !assetAddress) {
      setError("This NFT has no on-chain asset address yet and can't be transferred.");
      return;
    }
    if (!isValidAddress) {
      setError("Enter a valid Solana recipient address.");
      return;
    }

    setIsTransferring(true);
    setError(null);
    try {
      const umi = await buildWalletUmi();
      const dasUmi = getDasUmi(getSolanaRpcUrl(network as "mainnet" | "devnet"));
      const signature = await transferSolanaNft({
        umi,
        dasUmi,
        assetAddress,
        collectionAddress: nft.collectionAddress || null,
        recipient: recipientAddress.trim(),
        onProgress: setProgress,
      });
      setTxSignature(signature);
      toast.success(`${nft.name || "NFT"} transferred.`);
      onTransferSuccess();
    } catch (err) {
      console.error("Transfer failed:", err);
      setError(getErrorMessage(err) || "Failed to transfer NFT.");
    } finally {
      setIsTransferring(false);
      setProgress(null);
    }
  };

  if (!nft) return null;

  const canTransfer = !!assetAddress && isValidAddress === true && !isTransferring;

  return (
    <Dialog open={open} onOpenChange={(o) => !isTransferring && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Transfer NFT
          </DialogTitle>
          <DialogDescription>
            Send this NFT to another Solana wallet. Core and compressed NFTs are
            both supported.
          </DialogDescription>
        </DialogHeader>

        {/* NFT Preview */}
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
            {nft.image_url ? (
              <img
                src={nft.image_url}
                alt={nft.name || `#${nft.token_id}`}
                className="w-full h-full object-cover"
              />
            ) : nft.collection?.image_url ? (
              <img
                src={nft.collection.image_url}
                alt={nft.name || `#${nft.token_id}`}
                className="w-full h-full object-cover opacity-50"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {nft.name || `${nft.collection?.name} #${nft.token_id}`}
            </p>
            <p className="text-sm text-muted-foreground">{nft.collection?.name}</p>
            <Badge variant="outline" className="mt-1">
              Token #{nft.token_id}
            </Badge>
          </div>
        </div>

        {txSignature ? (
          <div className="space-y-4">
            <Alert className="bg-green-500/10 border-green-500/30">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-500">
                NFT transferred successfully!
              </AlertDescription>
            </Alert>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Transaction:</p>
              <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                {txSignature}
              </code>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                window.open(
                  `https://explorer.solana.com/tx/${txSignature}${clusterParam}`,
                  "_blank",
                )
              }
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View on Explorer
            </Button>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            {!assetAddress && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This NFT has no on-chain asset address yet. Transfers are not
                  available.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="recipient">Recipient Address</Label>
              <Input
                id="recipient"
                placeholder="Solana address…"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                className={
                  isValidAddress === false
                    ? "border-destructive"
                    : isValidAddress === true
                      ? "border-green-500"
                      : ""
                }
                disabled={isTransferring || !assetAddress}
              />
              {isValidAddress === false && recipientAddress.length > 0 && (
                <p className="text-xs text-destructive">
                  Please enter a valid Solana address
                </p>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {progress && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                {progress}
              </p>
            )}

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                This action is irreversible. Make sure the recipient address is
                correct before transferring.
              </AlertDescription>
            </Alert>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isTransferring}
              >
                Cancel
              </Button>
              <Button onClick={handleTransfer} disabled={!canTransfer}>
                {isTransferring ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Transferring...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Transfer
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
