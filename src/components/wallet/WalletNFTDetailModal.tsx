import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ExternalLink,
  Copy,
  Check,
  Image as ImageIcon,
  Hash,
  FileText,
  Layers,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";
import type { NFT } from "@/hooks/useWalletNFTs";

interface WalletNFTDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  nft: NFT | null;
  network: string;
  onTransferSuccess?: () => void;
}

const NETWORK_CONFIG: Record<string, {
  explorerUrl: string;
  explorerName: string;
}> = {
  "solana-mainnet": {
    explorerUrl: "https://solscan.io/token",
    explorerName: "Solscan",
  },
};

export const WalletNFTDetailModal: React.FC<WalletNFTDetailModalProps> = ({
  isOpen,
  onClose,
  nft,
  network,
  onTransferSuccess,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!nft) return null;

  const config = NETWORK_CONFIG[network] || NETWORK_CONFIG["solana-mainnet"];

  const explorerLink = `${config.explorerUrl}/${nft.contractAddress}`;

  const handleCopyAddress = async () => {
    await navigator.clipboard.writeText(nft.contractAddress);
    setCopied(true);
    toast.success("Contract address copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const truncateAddress = (address: string) => {
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Sparkles className="w-5 h-5 text-primary shrink-0" />
            <span className="truncate">{nft.name || `#${nft.tokenId}`}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* NFT Image */}
          <div className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted/50">
            {nft.image ? (
              <img
                src={nft.image}
                alt={nft.name || `#${nft.tokenId}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-16 h-16 text-muted-foreground" />
              </div>
            )}

            <Badge className="absolute top-3 right-3 bg-black/70 text-white border-none">
              <Hash className="w-3 h-3 mr-1" />
              {nft.tokenId.length > 10 ? truncateAddress(nft.tokenId) : nft.tokenId}
            </Badge>
          </div>

          {/* Collection & Contract */}
          <div className="space-y-2">
            {nft.collection && (
              <div className="flex items-center gap-2 text-sm">
                <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Collection:</span>
                <span className="font-medium truncate">{nft.collection}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Contract:</span>
              <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                {truncateAddress(nft.contractAddress)}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopyAddress}
              >
                {copied ? (
                  <Check className="w-3 h-3 text-green-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>

          {/* Description */}
          {nft.description && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold mb-2">Description</h4>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {nft.description}
                </p>
              </div>
            </>
          )}

          {/* Attributes */}
          {nft.attributes && nft.attributes.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Attributes
                  <Badge variant="secondary" className="text-xs">
                    {nft.attributes.length}
                  </Badge>
                </h4>
                <ScrollArea className="h-[150px] pr-4">
                  <div className="grid grid-cols-2 gap-2">
                    {nft.attributes.map((attr, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                          {attr.trait_type}
                        </p>
                        <p className="text-sm font-medium truncate" title={attr.value}>
                          {attr.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}

          <Separator />

          {/* External Links */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => window.open(explorerLink, "_blank")}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              {config.explorerName}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WalletNFTDetailModal;
