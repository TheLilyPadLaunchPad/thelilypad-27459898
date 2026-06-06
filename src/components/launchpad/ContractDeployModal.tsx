import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetaplexBadge } from "@/components/MetaplexBadge";
import {
  Rocket,
  AlertTriangle,
  Link2,
  Info,
  Leaf,
  Loader2,
} from "lucide-react";
import { useWallet } from "@/providers/WalletProvider";
import { toast } from "sonner";
import { isValidIPFSCID } from "@/config/nftFactory";
import { supabase } from "@/integrations/supabase/client";
import { useSolanaLaunch } from "@/hooks/useSolanaLaunch";
import { useMonadLaunch } from "@/hooks/useMonadLaunch";
import { uploadCollectionMetadata, hasArweaveWallet } from "@/lib/metadataUpload";

interface ContractDeployModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: {
    id: string;
    name: string;
    symbol: string;
    total_supply: number;
    royalty_percent: number;
    creator_address: string;
    chain?: string;
  };
  onDeploySuccess: (contractAddress: string) => void;
}

import { SupportedChain, CHAINS } from "@/config/chains";

export const ContractDeployModal: React.FC<ContractDeployModalProps> = ({
  open,
  onOpenChange,
  collection,
  onDeploySuccess,
}) => {
  const { isConnected, address, connect, network } = useWallet();
  const [manualAddress, setManualAddress] = React.useState("");
  const [showManualInput, setShowManualInput] = React.useState(false);
  const [ipfsCID, setIpfsCID] = React.useState("");
  const [isSavingCID, setIsSavingCID] = React.useState(false);
  const [isDeploying, setIsDeploying] = React.useState(false);

  const solanaLaunch = useSolanaLaunch();
  const monadLaunch = useMonadLaunch();

  const chainId = (collection.chain?.split('-')[0] as SupportedChain) || 'solana';
  const currentChain = CHAINS[chainId] || CHAINS.solana;

  const handleManualSubmit = async () => {
    // Basic validation based on chain
    if (!manualAddress) {
      toast.error("Please enter a valid address");
      return;
    }

    if (chainId === 'solana' && manualAddress.length < 32) {
      toast.error("Please enter a valid Solana address");
      return;
    }

    if (chainId === 'monad' && !manualAddress.startsWith('0x')) {
      toast.error("Please enter a valid Monad/EVM address (starts with '0x')");
      return;
    }

    setIsSavingCID(true);

    try {
      // Save IPFS CID if provided
      if (ipfsCID.trim()) {
        if (!isValidIPFSCID(ipfsCID.trim())) {
          toast.error("Invalid IPFS CID format. Should start with 'Qm' or 'bafy'.");
          setIsSavingCID(false);
          return;
        }

        const { error: updateError } = await supabase
          .from("collections")
          .update({ ipfs_base_cid: ipfsCID.trim() })
          .eq("id", collection.id);

        if (updateError) {
          console.error("Failed to save IPFS CID:", updateError);
          toast.error("Failed to save IPFS CID");
          setIsSavingCID(false);
          return;
        }
      }

      onDeploySuccess(manualAddress);
      toast.success("Collection linked successfully!" + (ipfsCID.trim() ? " IPFS CID saved." : ""));
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("An error occurred");
    } finally {
      setIsSavingCID(false);
    }
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      let contractAddress = "";

      if (chainId === 'solana') {
        toast.loading("Preparing collection metadata...", { id: 'deploying' });

        const metadata = {
          name: collection.name,
          symbol: collection.symbol,
          description: `Collection by ${collection.creator_address}`,
          image: "", // Placeholder, can be updated later
          properties: {
            category: "image",
            creators: [{
              address: address,
              share: 100
            }]
          }
        };

        let metadataUri = "";
        try {
          const uploaded = await uploadCollectionMetadata(metadata, {
            collectionId: collection.id,
          });
          metadataUri = uploaded.url;
          if (uploaded.provider === "supabase") {
            toast.info(
              "Uploaded metadata via Lily Pad storage (install Wander for permanent Arweave storage).",
              { id: 'deploying-info', duration: 4000 },
            );
          }
        } catch (uploadErr: any) {
          throw new Error(
            `Metadata upload failed: ${uploadErr?.message || "unknown error"}`,
          );
        }

        toast.loading("Deploying Metaplex Core Collection...", { id: 'deploying' });
        const result = await solanaLaunch.deploySolanaCollection({
          name: collection.name,
          symbol: collection.symbol,
          uri: metadataUri,
          sellerFeeBasisPoints: Math.round(collection.royalty_percent * 100),
          creators: [{ address: address || '', share: 100 }]
        });
        contractAddress = result.address;
      } else if (chainId === 'monad') {
        toast.loading("Deploying Monad ERC-721 Collection...", { id: 'deploying' });
        const result = await monadLaunch.createCollection({
          name: collection.name,
          symbol: collection.symbol,
          description: "Created via The Lily Pad",
          imageUri: "", // Placeholder
          totalSupply: collection.total_supply,
          royaltyBasisPoints: collection.royalty_percent * 100,
        });
        if (result.success && result.address) {
          contractAddress = result.address;
        } else {
          throw new Error("Deployment failed to return an address");
        }
      }

      if (contractAddress) {
        toast.success("Successfully deployed!", { id: 'deploying' });
        onDeploySuccess(contractAddress);
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error("Deployment error:", error);
      const rawMsg = error?.message || error?.toString?.() || "An unexpected error occurred during deployment";
      toast.error("Deployment failed", {
        description: rawMsg.length > 240 ? rawMsg.slice(0, 240) + "…" : rawMsg,
        id: 'deploying',
        duration: 8000,
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const handleClose = () => {
    setShowManualInput(false);
    setManualAddress("");
    setIpfsCID("");
    onOpenChange(false);
  };

  const netKey = network === 'mainnet' ? 'mainnet' : 'testnet';
  const networkName = currentChain.networks[netKey]?.name || (network === 'mainnet' ? 'Mainnet' : 'Devnet');
  const fullNetworkName = `${currentChain.name} ${networkName}`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            Deploy Collection
          </DialogTitle>
          <DialogDescription>
            Deploy your NFT collection to {fullNetworkName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* LilyPad Platform Badge */}
          <div className="flex items-center justify-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <Leaf className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-primary">The Lily Pad Collection</span>
            <Badge variant="secondary" className="text-xs">
              {currentChain.name}
            </Badge>
          </div>

          {/* Collection Info */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Collection</span>
              <span className="font-medium">{collection.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Symbol</span>
              <span className="font-medium">{collection.symbol}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Max Supply</span>
              <span className="font-medium">{collection.total_supply?.toLocaleString() || "0"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Royalty</span>
              <span className="font-medium">{collection.royalty_percent}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Network</span>
              <Badge variant="outline" className="text-xs">
                {fullNetworkName}
              </Badge>
            </div>
          </div>

          {/* Wallet Not Connected */}
          {!isConnected && (
            <div className="p-4 bg-muted border border-border rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-3">
                Connect your wallet to continue
              </p>
              <Button onClick={() => connect()} size="sm">
                Connect Wallet
              </Button>
            </div>
          )}

          {/* Info about Solana deployment */}
            {isConnected && !showManualInput && (
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 text-primary" />
                  <div className="text-sm space-y-2">
                    <p className="font-medium text-primary">{currentChain.name} Deployment</p>
                    <p className="text-muted-foreground text-xs">
                      {chainId === 'solana'
                        ? "Collections on Solana are deployed using the Metaplex Core standard for high performance and low fees."
                        : `Collections on ${currentChain.name} are deployed using standard ERC-721 smart contracts.`
                      }
                    </p>
                    {chainId === 'solana' && (
                      <>
                        <div className="rounded-md border border-primary/20 bg-background/40 p-2 text-xs space-y-1">
                          <p className="font-medium text-foreground">Deploy cost = Solana rent only</p>
                          <p className="text-muted-foreground">
                            You pay the network rent to create the Candy Machine accounts. Minters pay the mint price.
                            After <span className="font-medium">sellout</span> or your <span className="font-medium">mint end date</span>,
                            you can <span className="font-medium">close the Candy Machine</span> and reclaim the rent SOL.
                          </p>
                        </div>
                        {!hasArweaveWallet() && (
                          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-muted-foreground">
                            No Arweave wallet detected — metadata will be stored on Lily Pad storage.
                            Install <span className="font-medium">Wander</span> for permanent Arweave storage.
                          </div>
                        )}
                        <div className="rounded-md border border-dashed border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">Pay mint in L3AP</span> · coming soon —
                          opts your collection into the buyback program and waives the launchpad deploy fee.
                        </div>
                        <MetaplexBadge variant="inline" />
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

          {/* Deploy Button */}
          {isConnected && !showManualInput && (
            <div className="space-y-3">
              <Button 
                className="w-full gap-2 py-6 text-lg font-bold shadow-lg shadow-primary/20"
                onClick={handleDeploy}
                disabled={isDeploying}
              >
                {isDeploying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="w-5 h-5" />
                    Deploy to {currentChain.name}
                  </>
                )}
              </Button>
              <p className="text-[10px] text-center text-muted-foreground uppercase tracking-wider">
                This will trigger a wallet transaction
              </p>
              {chainId === 'solana' && (
                <div className="flex justify-center">
                  <MetaplexBadge variant="inline" className="mt-1" />
                </div>
              )}
            </div>
          )}

          {/* Contract Linking Option */}
          {isConnected && !showManualInput && (
            <div className="p-4 bg-muted border border-border rounded-lg">
              <div className="flex items-center gap-2 text-foreground mb-2">
                <Link2 className="w-4 h-4" />
                <span className="text-sm font-medium">Link Existing Collection</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Already deployed your collection? Paste the collection address here.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => setShowManualInput(true)}
              >
                <Link2 className="w-3 h-3" />
                Link Existing Collection
              </Button>
            </div>
          )}

          {/* Manual Address Input */}
          {showManualInput && (
            <div className="p-4 bg-muted/50 rounded-lg space-y-4">
              <div className="flex items-center gap-2 text-foreground">
                <Link2 className="w-4 h-4" />
                <span className="text-sm font-medium">Link Existing Collection</span>
              </div>

              {/* Collection Address */}
              <div className="space-y-2">
                <Label htmlFor="contract-address" className="text-xs text-muted-foreground">
                  Collection Address *
                </Label>
                <Input
                  id="contract-address"
                  placeholder={`Enter ${currentChain.name} collection address...`}
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              {/* IPFS CID Input */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ipfs-cid" className="text-xs text-muted-foreground">
                    IPFS Metadata CID
                  </Label>
                  <Badge variant="outline" className="text-xs">Optional</Badge>
                </div>
                <Input
                  id="ipfs-cid"
                  placeholder="bafybeierqu2yc..."
                  value={ipfsCID}
                  onChange={(e) => setIpfsCID(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Base CID containing your metadata files
                </p>
                {ipfsCID && !isValidIPFSCID(ipfsCID) && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Invalid CID format
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setShowManualInput(false);
                    setManualAddress("");
                    setIpfsCID("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleManualSubmit}
                  disabled={!manualAddress || manualAddress.length < 32 || isSavingCID}
                >
                  {isSavingCID ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Link Collection"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContractDeployModal;
