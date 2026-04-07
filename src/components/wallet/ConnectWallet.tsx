import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/providers/WalletProvider";
import { Wallet, LogOut, ExternalLink, User, ChevronDown, ChevronUp, Coins } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SPLTokenList } from "./SPLTokenList";
import { useSPLTokens } from "@/hooks/useSPLTokens";
import { WalletSelectorModal, WalletType, OAuthProvider } from "./WalletSelectorModal";
import { Badge } from "@/components/ui/badge";
import { CHAINS, getExplorerUrl, SupportedChain } from "@/config/chains";

interface ConnectWalletProps {
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export const ConnectWallet: React.FC<ConnectWalletProps> = ({
  variant = "ghost",
  size = "sm",
  className,
}) => {
  const {
    address,
    isConnected,
    isConnecting,
    balance,
    connect,
    connectWithOAuth,
    disconnect,
    walletType,
    chainType,
    network,
    authProvider
  } = useWallet();
  const navigate = useNavigate();
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showWalletSelector, setShowWalletSelector] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const { totalTokens } = useSPLTokens();

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatBalance = (bal: string | null) => {
    if (!bal) return "0.00";
    return parseFloat(bal).toFixed(4);
  };

  const handleDisconnect = () => {
    disconnect();
    setShowDisconnectConfirm(false);
  };

  const handleWalletSelect = async (selectedWalletType: WalletType) => {
    setShowWalletSelector(false);
    await connect(selectedWalletType);
  };

  const handleOAuthSelect = async (provider: OAuthProvider) => {
    setShowWalletSelector(false);
    await connectWithOAuth(provider);
  };

  const getWalletIcon = () => {
    // Check if connected via OAuth
    if (authProvider === "google") return (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    );
    if (authProvider === "apple") return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    );
    if (walletType === "phantom") return "👻";
    return null;
  };

  // Derive chain display info from CHAINS config — covers SOL, XRP, MON and any future chain
  const chainCfg = CHAINS[chainType as SupportedChain] ?? CHAINS.solana;
  const chainDisplayName = network === 'mainnet' ? chainCfg.name : `${chainCfg.name} Testnet`;
  const balanceSymbol = chainCfg.symbol;
  // Render the chain icon — XRP uses official SVG, others use unicode glyphs
  const renderChainIcon = (sizeClass = "w-4 h-4") => {
    if (chainType === 'xrpl') return <XRPIcon className={sizeClass} />;
    if (chainType === 'monad') return <span className="text-sm">◈</span>;
    return <span className="text-sm">◎</span>;
  };
  const explorerUrl = address
    ? getExplorerUrl(chainType as SupportedChain, address, 'address', network === 'mainnet' ? 'mainnet' : 'testnet')
    : '#';

  // Not connected state
  if (!isConnected) {
    return (
      <>
        <Button
          variant={variant}
          size={size}
          className={className}
          onClick={() => setShowWalletSelector(true)}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
              Connecting...
            </>
          ) : (
            <>
              <Wallet className="w-4 h-4 mr-2" />
              Connect Wallet
            </>
          )}
        </Button>

        <WalletSelectorModal
          open={showWalletSelector}
          onOpenChange={setShowWalletSelector}
          onSelect={handleWalletSelect}
          onOAuthSelect={handleOAuthSelect}
          isConnecting={isConnecting}
        />
      </>
    );
  }

  // Connected state
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} className={`${className} gap-2`}>
            <div className="flex items-center gap-2">
              {/* Wallet icon */}
              <span className="text-lg">{getWalletIcon()}</span>

              {/* Chain icon */}
              {renderChainIcon()}

              {/* Address */}
              <span className="font-mono text-xs">{formatAddress(address!)}</span>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {/* Balance section */}
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Balance</span>
              <Badge variant="outline" className="text-xs">
                {chainDisplayName}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {renderChainIcon("w-5 h-5")}
              <span className="text-lg font-semibold">{formatBalance(balance)} {balanceSymbol}</span>
            </div>
          </div>

          {/* SPL Tokens Toggle */}
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              setShowTokens(!showTokens);
            }}
          >
            <Coins className="w-4 h-4 mr-2" />
            <span>SPL Tokens ({totalTokens})</span>
            {showTokens ? (
              <ChevronUp className="w-4 h-4 ml-auto" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-auto" />
            )}
          </DropdownMenuItem>

          {showTokens && (
            <div className="px-2 py-1 max-h-48 overflow-y-auto">
              <SPLTokenList compact />
            </div>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => navigate("/my-nfts")}
          >
            <User className="w-4 h-4 mr-2" />
            My NFTs
          </DropdownMenuItem>

          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => window.open(explorerUrl, "_blank")}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            View on Explorer
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="cursor-pointer text-destructive"
            onClick={() => setShowDisconnectConfirm(true)}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Disconnect confirmation */}
      <AlertDialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Wallet</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect your wallet? You'll need to reconnect to use wallet features.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
