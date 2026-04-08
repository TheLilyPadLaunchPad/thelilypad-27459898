import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wallet, ExternalLink, Clock, Sparkles, Zap, Hexagon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { waitForPhantomExtension } from "@/config/phantom";
import { useChain } from "@/providers/ChainProvider";
import { cn } from "@/lib/utils";

export type WalletType = "phantom" | "solana";
export type ChainType = "solana" | "monad";

export type OAuthProvider = "google" | "apple";

interface WalletOption {
  id: WalletType;
  name: string;
  icon: string | React.ReactNode;
  isInstalled: boolean;
  installUrl: string;
  description?: string;
}

interface WalletSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (walletType: WalletType) => void;
  onOAuthSelect?: (provider: OAuthProvider) => void;
  isConnecting: boolean;
}


export const WalletSelectorModal: React.FC<WalletSelectorModalProps> = ({
  open,
  onOpenChange,
  onSelect,
  isConnecting,
}) => {
  const { chain } = useChain();
  const [walletOptions, setWalletOptions] = useState<WalletOption[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const initWallets = async () => {
      setIsInitializing(true);

      try {
        const options: WalletOption[] = [];

        await waitForPhantomExtension(2000);
        const isPhantomInstalled = !!(window as any).phantom?.solana?.isPhantom || !!(window as any).phantom?.ethereum;

        const phantomOption: WalletOption = {
          id: "phantom",
          name: "Phantom",
          icon: "👻",
          isInstalled: isPhantomInstalled,
          installUrl: "https://phantom.app/",
          description: chain.id === 'monad' ? "Connect Monad via Phantom EVM" : "Solana, EVM & more",
        };

        options.push(phantomOption);

        setWalletOptions(options);
      } catch (e) {
        console.error("Error initializing wallets:", e);
        setWalletOptions([
          {
            id: "phantom",
            name: "Phantom",
            icon: "👻",
            isInstalled: false,
            installUrl: "https://phantom.app/",
          },
        ]);
      }

      setIsInitializing(false);
    };

    if (open) {
      initWallets();
    }
  }, [open, chain.id]);

  const handleWalletClick = (wallet: WalletOption) => {
    if (!wallet.isInstalled) {
      window.open(wallet.installUrl, "_blank");
      return;
    }
    onSelect(wallet.id);
  };

  const getChainIcon = () => {
    switch (chain.id) {
      case 'solana': return <span className="mr-1 text-emerald-400">◎</span>;
      case 'monad': return <Hexagon className="w-3 h-3 mr-1 text-purple-400" />;
      default: return null;
    }
  };

  const getChainBadgeStyles = () => {
    switch (chain.id) {
      case 'solana': return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case 'monad': return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      default: return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Connect Wallet
          </DialogTitle>
          <DialogDescription>
            Connect your {chain.name} wallet to get started on The Lily Pad
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-center">
            <Badge variant="outline" className={cn("px-3 py-1", getChainBadgeStyles())}>
              {getChainIcon()}
              {chain.name} Network
            </Badge>
          </div>

          <Separator className="opacity-50" />

          <div className="space-y-3">
            {isInitializing ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">Detecting wallets...</p>
              </div>
            ) : (
              <>
                {walletOptions.map((wallet) => (
                  <Button
                    key={wallet.id}
                    variant="outline"
                    className="w-full justify-between h-16 px-4 border-2 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                    onClick={() => handleWalletClick(wallet)}
                    disabled={isConnecting}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-3xl group-hover:scale-110 transition-transform">
                        {typeof wallet.icon === 'string' ? wallet.icon : wallet.icon}
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-base">{wallet.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {wallet.isInstalled ? (wallet.description || "Detected") : "Not installed"}
                        </div>
                      </div>
                    </div>
                    {!wallet.isInstalled ? (
                      <ExternalLink className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    ) : (
                      isConnecting ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                      )
                    )}
                  </Button>
                ))}
              </>
            )}
          </div>

          {chain.id === 'monad' && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex gap-3">
              <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                Monad is currently in Testnet. Make sure your Phantom wallet is set to an EVM network to connect successfully.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
