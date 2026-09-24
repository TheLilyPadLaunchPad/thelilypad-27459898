import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Loader2, Info } from "lucide-react";
import { useWallet } from "@/providers/WalletProvider";
import { useSolanaCoreTransfer } from "@/hooks/useSolanaCoreTransfer";
import { useMonadTransfer } from "@/hooks/useMonadTransfer";
import { toast } from "sonner";
import { useTxStatus } from "@/hooks/useTxStatus";
import { TxStatusCard } from "@/components/tx/TxStatusCard";

interface Listing {
  id: string;
  nft_id: string;
  seller_id: string;
  seller_address: string;
  price: number;
  currency: string;
  chain?: string;
  nft: {
    id: string;
    token_id: number;
    name: string | null;
    image_url: string | null;
    collection_id: string | null;
    owner_address: string;
    contract_address?: string; // Solana Core Asset Address or EVM Contract
    collection?: {
      name: string;
      contract_address: string | null;
    };
  };
}

interface BuyNFTModalProps {
  listing: Listing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BuyNFTModal({ listing, open, onOpenChange, onSuccess }: BuyNFTModalProps) {
  const { address } = useWallet();
  const solanaTransfer = useSolanaCoreTransfer();
  const monadTransfer = useMonadTransfer();
  const [isSuccess, setIsSuccess] = useState(false);
  const tx = useTxStatus();

  // Determine chain and currency
  const chainId = listing?.chain || 'solana';
  const currencySymbol = listing?.currency || (chainId === 'monad' ? 'MON' : 'SOL');
  const chainName = chainId === 'monad' ? 'Monad' : 'Solana';

  const isLoading = solanaTransfer.isLoading || monadTransfer.isLoading || tx.isBusy;

  const handleBuy = async () => {
    if (!listing || !address) return;
    if (listing.seller_address === address) {
      onSuccess();
      return;
    }
    if (chainId !== 'monad' && chainId !== 'solana') {
      toast.error(`${chainName} purchases not yet supported in this modal.`);
      return;
    }
    const assetAddr = listing.nft.contract_address || listing.nft.collection?.contract_address || "";
    const result = await tx.run("Buy NFT", async () => {
      const r: any = chainId === 'monad'
        ? await monadTransfer.transferAsset(assetAddr, address, listing.nft.token_id)
        : await solanaTransfer.transferAsset(assetAddr, address, { collectionAddress: listing.nft.collection?.contract_address || undefined });
      if (!r?.success) throw new Error(r?.error || solanaTransfer.error || monadTransfer.error || "Purchase failed");
      return r;
    }, { chain: chainId, kind: "marketplace" });
    if (result) {
      setIsSuccess(true);
      setTimeout(() => onSuccess(), 2000);
    }
  };

  if (!listing) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Buy NFT
          </DialogTitle>
          <DialogDescription>
            Purchase this digital asset on {chainName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
            {/* Preview */}
            {listing.nft.image_url ? (
              <img src={listing.nft.image_url} alt="NFT" className="w-16 h-16 rounded object-cover" />
            ) : (
              <div className="w-16 h-16 bg-secondary rounded flex items-center justify-center">
                <Info className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="font-medium">{listing.nft.name || `Token #${listing.nft.token_id}`}</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {chainId === 'solana' ? 'Core Asset' : 'ERC-721'}
                </Badge>
                <p className="text-sm font-semibold">{listing.price} {currencySymbol}</p>
              </div>
            </div>
          </div>

          <TxStatusCard status={tx.status} chain={chainId} onRetry={handleBuy} onDismiss={tx.reset} />

          <Button
            className="w-full gap-2"
            onClick={handleBuy}
            disabled={isLoading || !address || isSuccess}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : isSuccess ? (
              "Success!"
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                {listing.seller_address === address ? "Manage Listing" : "Buy Now"}
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            {listing.seller_address === address
              ? "You own this listing."
              : chainId === 'monad' ? "Confirms via your Monad wallet." : "Note: Seller signature required for P2P transfer."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
