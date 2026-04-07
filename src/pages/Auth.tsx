import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/providers/WalletProvider";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Import, PlusCircle, ArrowRight } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useSiteAsset } from "@/hooks/useSiteAsset";
import { motion, AnimatePresence } from "framer-motion";

const fallbackAuthBranding = "/auth-branding.webp";

type SelectedChain = "solana" | "xrpl" | "monad";

// Phantom icon
const PhantomIcon = () => (
  <svg width="20" height="20" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="128" height="128" rx="26" fill="url(#paint0_linear_auth)" />
    <path d="M110.5 64.6C110.5 90.5 89.3 111.5 63.2 111.5H33.6C31.5 111.5 29.8 109.8 29.8 107.7V63.1C29.8 41.1 47.9 23.2 70.1 23.2C92.3 23.2 110.5 41.1 110.5 63.1V64.6Z" fill="url(#paint1_linear_auth)" />
    <path d="M86.7 64.5C86.7 68.3 83.6 71.4 79.8 71.4C76 71.4 72.9 68.3 72.9 64.5C72.9 60.7 76 57.6 79.8 57.6C83.6 57.6 86.7 60.7 86.7 64.5Z" fill="white" />
    <path d="M64.5 64.5C64.5 68.3 61.4 71.4 57.6 71.4C53.8 71.4 50.7 68.3 50.7 64.5C50.7 60.7 53.8 57.6 57.6 57.6C61.4 57.6 64.5 60.7 64.5 64.5Z" fill="white" />
    <defs>
      <linearGradient id="paint0_linear_auth" x1="64" y1="0" x2="64" y2="128" gradientUnits="userSpaceOnUse">
        <stop stopColor="#534BB1" />
        <stop offset="1" stopColor="#551BF9" />
      </linearGradient>
      <linearGradient id="paint1_linear_auth" x1="70.15" y1="23.2" x2="70.15" y2="111.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity="0.82" />
      </linearGradient>
    </defs>
  </svg>
);

// XRP Ledger icon — official symbol (curly brackets + X) on dark background tile
const XRPLIcon = () => (
  <span className="flex items-center justify-center w-5 h-5 rounded bg-[#23292F]">
    <XRPIcon className="w-3.5 h-3.5 text-white" />
  </span>
);

// Monad icon — purple diamond
const MonadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="128" height="128" rx="26" fill="url(#paint0_monad)" />
    <path d="M64 18L108 64L64 110L20 64L64 18Z" fill="white" fillOpacity="0.95" />
    <path d="M64 38L90 64L64 90L38 64L64 38Z" fill="url(#paint0_monad)" />
    <defs>
      <linearGradient id="paint0_monad" x1="64" y1="0" x2="64" y2="128" gradientUnits="userSpaceOnUse">
        <stop stopColor="#7B4EF5" />
        <stop offset="1" stopColor="#3B1A8F" />
      </linearGradient>
    </defs>
  </svg>
);

const CHAINS: { id: SelectedChain; label: string; Icon: React.FC }[] = [
  { id: "solana", label: "Phantom", Icon: PhantomIcon },
  { id: "xrpl", label: "XRPL", Icon: XRPLIcon },
  { id: "monad", label: "Monad", Icon: MonadIcon },
];

export default function Auth() {
  const navigate = useNavigate();
  const { connect, isConnecting } = useWallet();
  const { state } = useAuth();
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [selectedChain, setSelectedChain] = useState<SelectedChain>("solana");
  const [showImport, setShowImport] = useState(false);
  const [importSeed, setImportSeed] = useState("");
  const [hasExistingXRPLWallet, setHasExistingXRPLWallet] = useState(false);
  // Fetch dynamic auth branding from site_assets, fallback to local
  const { assetUrl: authBranding } = useSiteAsset('auth_branding', fallbackAuthBranding);

  // Check if user already has a saved XRPL wallet in localStorage
  useEffect(() => {
    const xrplKey = localStorage.getItem("xrpl_wallet_address");
    setHasExistingXRPLWallet(!!xrplKey);
  }, []);

  useSEO({
    title: "Connect Wallet | The Lily Pad",
    description: "Connect your wallet to access The Lily Pad. Choose Phantom for Solana or Monad, or XRPL browser wallet."
  });

  // Redirect when authenticated or needs profile setup
  useEffect(() => {
    if (state === "AUTHENTICATED") {
      navigate("/");
    } else if (state === "NEEDS_PROFILE") {
      navigate("/profile-setup");
    }
  }, [state, navigate]);

  const handlePhantomConnect = async () => {
    setIsConnectingWallet(true);
    try {
      await connect("phantom", "solana");
    } catch (error) {
      console.error("Phantom connect error:", error);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleXRPLConnect = async () => {
    setIsConnectingWallet(true);
    try {
      await connect("xrpl", "xrpl");
    } catch (error) {
      console.error("XRPL connect error:", error);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleMonadConnect = async () => {
    setIsConnectingWallet(true);
    try {
      await connect(undefined, "monad");
    } catch (error) {
      console.error("Monad connect error:", error);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleXRPLImport = async () => {
    if (!importSeed.trim()) return;
    setIsConnectingWallet(true);
    try {
      // Import uses the main connect which generates/loads wallet
      // For import, we need to call importXRPLWallet + saveXRPLWallet first
      const { importXRPLWallet, saveXRPLWallet } = await import("@/lib/xrpl-wallet");
      const wallet = importXRPLWallet(importSeed.trim());
      await saveXRPLWallet(wallet);
      await connect("xrpl", "xrpl");
      setImportSeed("");
      setShowImport(false);
    } catch (error) {
      console.error("XRPL import error:", error);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const isLoading = isConnecting || isConnectingWallet;

  // Tab indicator position: divide into thirds
  const tabIndex = CHAINS.findIndex(c => c.id === selectedChain);
  const indicatorLeft = `calc(${tabIndex} * (100% / 3) + 4px)`;
  const indicatorWidth = "calc(100% / 3 - 8px)";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left side - Hero Image (Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-emerald-50 to-emerald-100 items-center justify-center p-8">
        <img
          src={authBranding || fallbackAuthBranding}
          alt="The Lily Pad"
          className="w-full h-full object-contain"
          fetchPriority="high"
          loading="eager"
          decoding="async"
          width={1920}
          height={1080}
        />
      </div>

      {/* Right side - Wallet Connect */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 bg-background">
        {/* Mobile Branding */}
        <div className="lg:hidden mb-6 w-full max-w-[280px]">
          <img
            src={authBranding || fallbackAuthBranding}
            alt="The Lily Pad"
            className="w-full h-auto rounded-lg"
            fetchPriority="high"
            loading="eager"
            decoding="async"
            width={280}
            height={157}
          />
        </div>

        <Card className="w-full max-w-md border-border/50 shadow-xl overflow-hidden">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-bold">Welcome to The Lily Pad</CardTitle>
            <CardDescription>Choose your chain and connect</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Chain Toggle — 3 tabs */}
            <div className="relative flex items-center bg-muted rounded-xl p-1 gap-1">
              {CHAINS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setSelectedChain(id)}
                  className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors duration-200 ${selectedChain === id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground/80"
                    }`}
                >
                  <Icon />
                  {label}
                </button>
              ))}
              {/* Sliding indicator */}
              <motion.div
                className="absolute top-1 bottom-1 rounded-lg bg-background shadow-md border border-border/50"
                animate={{ left: indicatorLeft, width: indicatorWidth }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            </div>

            {/* Chain-specific content */}
            <AnimatePresence mode="wait">
              {selectedChain === "solana" && (
                <motion.div
                  key="solana"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  {/* Solana badge */}
                  <div className="flex items-center justify-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#9945FF]/10 text-[#9945FF] text-xs font-medium border border-[#9945FF]/20">
                      <span>◎</span> Solana Network
                    </span>
                  </div>

                  <Button
                    onClick={handlePhantomConnect}
                    disabled={isLoading}
                    className="w-full h-14 text-base font-medium bg-gradient-to-r from-[#534BB1] to-[#551BF9] hover:from-[#4a43a0] hover:to-[#4c18e0] text-white"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-3" />
                    ) : (
                      <span className="mr-3"><PhantomIcon /></span>
                    )}
                    Connect with Phantom
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    It always takes leaps to go over problems.
                  </p>
                </motion.div>
              )}

              {selectedChain === "xrpl" && (
                <motion.div
                  key="xrpl"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  {/* XRPL badge */}
                  <div className="flex items-center justify-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00AAE4]/10 text-[#00AAE4] text-xs font-medium border border-[#00AAE4]/20">
                      <XRPIcon className="w-3.5 h-3.5" /> XRP Ledger (Testnet)
                    </span>
                  </div>

                  {/* Create or reconnect wallet */}
                  <Button
                    onClick={handleXRPLConnect}
                    disabled={isLoading}
                    className="w-full h-14 text-base font-medium bg-gradient-to-r from-[#23292F] to-[#2563EB] hover:from-[#1a1f24] hover:to-[#1d4ed8] text-white"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-3" />
                    ) : hasExistingXRPLWallet ? (
                      <ArrowRight className="w-5 h-5 mr-3" />
                    ) : (
                      <PlusCircle className="w-5 h-5 mr-3" />
                    )}
                    {hasExistingXRPLWallet ? "Reconnect XRPL Wallet" : "Create XRPL Wallet"}
                  </Button>

                  {/* Import existing wallet */}
                  {!showImport ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowImport(true)}
                      disabled={isLoading}
                    >
                      <Import className="w-4 h-4 mr-2" />
                      Import Existing Wallet
                    </Button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-2"
                    >
                      <Input
                        type="password"
                        placeholder="Enter your XRPL seed / secret..."
                        value={importSeed}
                        onChange={(e) => setImportSeed(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleXRPLImport}
                          disabled={isLoading || !importSeed.trim()}
                          className="flex-1"
                        >
                          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import & Connect"}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => { setShowImport(false); setImportSeed(""); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground text-center">
                      Non-custodial browser wallet. Your keys never leave your device.
                    </p>
                    <p className="text-xs text-muted-foreground/60 text-center">
                      New wallets need XRP from a faucet to activate on testnet.
                    </p>
                  </div>
                </motion.div>
              )}

              {selectedChain === "monad" && (
                <motion.div
                  key="monad"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  {/* Monad badge */}
                  <div className="flex items-center justify-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#7B4EF5]/10 text-[#7B4EF5] text-xs font-medium border border-[#7B4EF5]/20">
                      ◈ Monad Network
                    </span>
                  </div>

                  <Button
                    onClick={handleMonadConnect}
                    disabled={isLoading}
                    className="w-full h-14 text-base font-medium bg-gradient-to-r from-[#7B4EF5] to-[#3B1A8F] hover:from-[#6a3fe0] hover:to-[#2e1470] text-white"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-3" />
                    ) : (
                      <span className="mr-3"><PhantomIcon /></span>
                    )}
                    Connect with Phantom (Monad)
                  </Button>

                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground text-center">
                      Uses your Phantom EVM wallet address for Monad Testnet.
                    </p>
                    <p className="text-xs text-muted-foreground/60 text-center">
                      Make sure Phantom is installed and set to an EVM network.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Install / docs links */}
        <div className="mt-6 text-sm text-muted-foreground text-center">
          {selectedChain === "xrpl" ? (
            <p>
              Learn about XRPL{" "}
              <a
                href="https://xrpl.org/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                Documentation
              </a>
            </p>
          ) : selectedChain === "monad" ? (
            <p>
              Learn about Monad{" "}
              <a
                href="https://docs.monad.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                Documentation
              </a>
            </p>
          ) : (
            <p>
              Need Phantom?{" "}
              <a
                href="https://phantom.app/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                Download here
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
