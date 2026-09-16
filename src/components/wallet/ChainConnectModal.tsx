import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, AlertTriangle, Sparkles, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useWallet } from "@/providers/WalletProvider";
import CreateXRPLWalletDialog from "@/components/auth/CreateXRPLWalletDialog";
import UnlockXRPLWalletDialog from "@/components/auth/UnlockXRPLWalletDialog";
import { listSavedWallets } from "@/lib/xrplGeneratedWallet";

type SelectedChain = "solana" | "monad" | "xrpl" | "robinhood";

const SolanaIcon = () => (
  <svg width="18" height="18" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="128" height="128" rx="26" fill="url(#ccm_sol)" />
    <path d="M30 86h58l10-10H40zM30 64h58l10-10H40zM30 42h58l10-10H40z" fill="#fff" />
    <defs>
      <linearGradient id="ccm_sol" x1="0" y1="0" x2="128" y2="128" gradientUnits="userSpaceOnUse">
        <stop stopColor="#9945FF" />
        <stop offset="1" stopColor="#14F195" />
      </linearGradient>
    </defs>
  </svg>
);

const MonadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="128" height="128" rx="26" fill="url(#ccm_mon)" />
    <path d="M64 18L108 64L64 110L20 64L64 18Z" fill="white" fillOpacity="0.95" />
    <path d="M64 38L90 64L64 90L38 64L64 38Z" fill="url(#ccm_mon)" />
    <defs>
      <linearGradient id="ccm_mon" x1="64" y1="0" x2="64" y2="128" gradientUnits="userSpaceOnUse">
        <stop stopColor="#7B4EF5" />
        <stop offset="1" stopColor="#3B1A8F" />
      </linearGradient>
    </defs>
  </svg>
);

const XrplIcon = () => (
  <svg width="18" height="18" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="128" height="128" rx="26" fill="currentColor" />
    <path d="M34 38l30 30 30-30M34 90l30-30 30 30" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const RobinhoodIcon = () => (
  <svg width="18" height="18" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="128" height="128" rx="26" fill="#00C805" />
    <path d="M40 96V40c10-6 22-8 34-4l-10 18c-8-2-14-1-14 4v38H40z" fill="#fff" />
  </svg>
);

const CHAIN_TABS: { id: SelectedChain; label: string; Icon: React.FC; comingSoon?: boolean }[] = [
  { id: "solana", label: "SOL", Icon: SolanaIcon },
  { id: "monad", label: "MON", Icon: MonadIcon },
  { id: "xrpl", label: "XRPL", Icon: XrplIcon },
  { id: "robinhood", label: "Robinhood", Icon: RobinhoodIcon, comingSoon: true },
];

interface ChainConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chain tab shown first. Defaults to Solana. */
  defaultChain?: SelectedChain;
}

/**
 * In-app wallet connection. The user picks the chain they want to connect to
 * (Solana, Monad, XRPL — Robinhood Chain coming soon) and then their wallet.
 */
export const ChainConnectModal: React.FC<ChainConnectModalProps> = ({
  open,
  onOpenChange,
  defaultChain = "solana",
}) => {
  const { connect, isConnecting, connectXRPLNonCustodial, connectMonad } = useWallet();
  const [selectedChain, setSelectedChain] = useState<SelectedChain>(defaultChain);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [coldStorageOpen, setColdStorageOpen] = useState(false);
  const [coldStorageAddress, setColdStorageAddress] = useState("");
  const [createWalletOpen, setCreateWalletOpen] = useState(false);
  const [unlockWalletOpen, setUnlockWalletOpen] = useState(false);
  const hasSavedXrpl = listSavedWallets().length > 0;

  const isLoading = isConnecting || isConnectingWallet;

  const runConnect = async (fn: () => Promise<void>, label: string) => {
    setIsConnectingWallet(true);
    try {
      await fn();
      onOpenChange(false);
    } catch (error: any) {
      console.error(`${label} connect error:`, error);
      toast.error(error?.message || `Failed to connect ${label} wallet`);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleColdStorageConnect = async () => {
    if (!coldStorageAddress.trim()) return;
    setColdStorageOpen(false);
    await runConnect(
      () => connectXRPLNonCustodial("cold", coldStorageAddress.trim(), "mainnet"),
      "XRPL"
    );
    setColdStorageAddress("");
  };

  const tabIndex = CHAIN_TABS.findIndex((c) => c.id === selectedChain);
  const indicatorLeft = `calc(${tabIndex} * (100% / ${CHAIN_TABS.length}) + 4px)`;
  const indicatorWidth = `calc(100% / ${CHAIN_TABS.length} - 8px)`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect a wallet</DialogTitle>
            <DialogDescription>Pick the chain you want to connect to.</DialogDescription>
          </DialogHeader>

          {/* Chain tabs */}
          <div role="tablist" aria-label="Select blockchain" className="relative flex items-center bg-muted rounded-xl p-1 gap-1">
            {CHAIN_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selectedChain === id}
                onClick={() => setSelectedChain(id)}
                className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 px-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 ${selectedChain === id ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
                  }`}
              >
                <Icon />
                {label}
              </button>
            ))}
            <motion.div
              className="absolute top-1 bottom-1 rounded-lg bg-background shadow-md border border-border/50"
              animate={{ left: indicatorLeft, width: indicatorWidth }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          </div>

          <AnimatePresence mode="wait">
            {selectedChain === "solana" && (
              <motion.div key="solana" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }} className="space-y-4">
                <Button
                  onClick={() => runConnect(() => connect("reown", "solana"), "Solana")}
                  disabled={isLoading}
                  className="w-full h-14 text-base font-medium"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <span className="mr-3"><SolanaIcon /></span>}
                  Connect Solana Wallet
                </Button>
                <p className="text-xs text-muted-foreground text-center">Connect with Reown Wallet Connect.</p>
              </motion.div>
            )}

            {selectedChain === "monad" && (
              <motion.div key="monad" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-4">
                <Button
                  onClick={() => runConnect(() => connectMonad(), "Monad")}
                  disabled={isLoading}
                  className="w-full h-14 text-base font-medium"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <span className="mr-3"><MonadIcon /></span>}
                  Connect Monad Wallet
                </Button>
                <p className="text-xs text-muted-foreground text-center">Uses your EVM wallet on Monad.</p>
              </motion.div>
            )}

            {selectedChain === "xrpl" && (
              <motion.div key="xrpl" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-3">
                <Button
                  onClick={() => runConnect(() => connectXRPLNonCustodial("crossmark"), "XRPL")}
                  disabled={isLoading}
                  className="w-full h-14 text-base font-medium"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <span className="mr-3 text-xl">✕</span>}
                  Connect Crossmark
                </Button>
                <Button
                  onClick={() => runConnect(() => connectXRPLNonCustodial("gem"), "XRPL")}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full h-14 text-base font-medium border-2"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <span className="mr-3 text-xl">💎</span>}
                  Connect GemWallet
                </Button>

                <Button
                  onClick={() => setCreateWalletOpen(true)}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full h-12 text-sm font-medium border-2 border-dashed"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Create New XRPL Wallet
                </Button>

                {hasSavedXrpl && (
                  <Button
                    onClick={() => setUnlockWalletOpen(true)}
                    disabled={isLoading}
                    variant="ghost"
                    className="w-full h-10 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Lock className="w-3.5 h-3.5 mr-2" />
                    Unlock saved wallet on this device
                  </Button>
                )}

                {coldStorageOpen ? (
                  <div className="space-y-3 rounded-md border border-border/60 p-3">
                    <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>Watch-only mode. You can browse holdings, but signing requires Crossmark or GemWallet.</span>
                    </div>
                    <Input
                      placeholder="r..."
                      value={coldStorageAddress}
                      onChange={(e) => setColdStorageAddress(e.target.value)}
                      className="font-mono"
                      aria-label="XRPL address"
                    />
                    <Button onClick={handleColdStorageConnect} disabled={!coldStorageAddress.trim() || isLoading} className="w-full">
                      {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting...</> : "Connect Cold Storage"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setColdStorageOpen(true)}
                    disabled={isLoading}
                    variant="ghost"
                    className="w-full h-11 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    Cold Storage (Hardware Wallet)
                  </Button>
                )}

                <p className="text-xs text-muted-foreground text-center">You hold your own keys. We never see or store them.</p>
              </motion.div>
            )}

            {selectedChain === "robinhood" && (
              <motion.div key="robinhood" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-4 text-center py-4">
                <Badge variant="outline" className="px-3 py-1">Coming soon</Badge>
                <p className="text-sm text-muted-foreground">
                  Robinhood Chain support is on the way. You'll be able to connect it right here.
                </p>
                <Button disabled className="w-full h-14 text-base font-medium">
                  <span className="mr-3"><RobinhoodIcon /></span>
                  Connect Robinhood Chain
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      <CreateXRPLWalletDialog open={createWalletOpen} onOpenChange={setCreateWalletOpen} defaultNetwork="mainnet" />
      <UnlockXRPLWalletDialog open={unlockWalletOpen} onOpenChange={setUnlockWalletOpen} />
    </>
  );
};

export default ChainConnectModal;
