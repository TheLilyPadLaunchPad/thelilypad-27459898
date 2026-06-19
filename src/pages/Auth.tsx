import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/providers/WalletProvider";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Shield, AlertTriangle } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useSiteAsset } from "@/hooks/useSiteAsset";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const fallbackAuthBranding = "/auth-branding.webp";

type SelectedChain = "solana" | "monad" | "xrpl";



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

// XRPL icon — black X-style square
const XrplIcon = () => (
  <svg width="20" height="20" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="128" height="128" rx="26" fill="#000" />
    <path d="M34 38l30 30 30-30M34 90l30-30 30 30" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

const CHAINS: { id: SelectedChain; label: string; Icon: React.FC }[] = [
  { id: "solana", label: "Solana", Icon: MonadIcon },
  { id: "monad", label: "Monad", Icon: MonadIcon },
  { id: "xrpl", label: "XRPL", Icon: XrplIcon },
];

export default function Auth() {
  const navigate = useNavigate();
  const { connect, isConnecting, connectXRPLNonCustodial } = useWallet();
  const { state } = useAuth();
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [selectedChain, setSelectedChain] = useState<SelectedChain>("solana");
  const [coldStorageDialogOpen, setColdStorageDialogOpen] = useState(false);
  const [coldStorageAddress, setColdStorageAddress] = useState("");
  const [coldStorageNetwork, setColdStorageNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  // Fetch dynamic auth branding from site_assets, fallback to local
  const { assetUrl: authBranding } = useSiteAsset('auth_branding', fallbackAuthBranding);


  useSEO({
    title: "Connect Wallet | The Lily Pad",
    description: "Connect your wallet to access The Lily Pad. Choose Solana or Monad."
  });

  // Redirect when authenticated or needs profile setup
  useEffect(() => {
    if (state === "AUTHENTICATED") {
      navigate("/");
    } else if (state === "NEEDS_PROFILE") {
      navigate("/profile-setup");
    }
  }, [state, navigate]);

  const handleSolanaConnect = async () => {
    setIsConnectingWallet(true);
    try {
      await connect("reown", "solana");
    } catch (error) {
      console.error("Solana connect error:", error);
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

  const handleXRPLConnect = async (provider: "crossmark" | "gem" | "cold") => {
    if (provider === "cold") {
      setColdStorageDialogOpen(true);
      return;
    }
    setIsConnectingWallet(true);
    try {
      await connectXRPLNonCustodial(provider);
    } catch (error) {
      console.error("XRPL connect error:", error);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleColdStorageConnect = async () => {
    if (!coldStorageAddress.trim()) {
      return;
    }
    setIsConnectingWallet(true);
    setColdStorageDialogOpen(false);
    try {
      await connectXRPLNonCustodial("cold", coldStorageAddress.trim(), coldStorageNetwork);
      setColdStorageAddress("");
    } catch (error) {
      console.error("Cold storage connect error:", error);
    } finally {
      setIsConnectingWallet(false);
    }
  };


  const isLoading = isConnecting || isConnectingWallet;

  // Tab indicator position: divide evenly across CHAINS
  const tabIndex = CHAINS.findIndex(c => c.id === selectedChain);
  const indicatorLeft = `calc(${tabIndex} * (100% / ${CHAINS.length}) + 4px)`;
  const indicatorWidth = `calc(100% / ${CHAINS.length} - 8px)`;

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
                    onClick={handleSolanaConnect}
                    disabled={isLoading}
                    className="w-full h-14 text-base font-medium bg-gradient-to-r from-[#534BB1] to-[#551BF9] hover:from-[#4a43a0] hover:to-[#4c18e0] text-white"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-3" />
                    ) : (
                      <span className="mr-3"><MonadIcon /></span>
                    )}
                    Connect Wallet
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    It always takes leaps to go over problems.
                  </p>
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
                      <span className="mr-3"><MonadIcon /></span>
                    )}
                    Connect Wallet (Monad)
                  </Button>

                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground text-center">
                      Uses your wallet address for Monad Testnet.
                    </p>
                  </div>
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
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-foreground/5 text-foreground text-xs font-medium border border-foreground/20">
                      ✕ XRPL Network · Non-Custodial
                    </span>
                  </div>

                  <Button
                    onClick={() => handleXRPLConnect("crossmark")}
                    disabled={isLoading}
                    className="w-full h-14 text-base font-medium bg-gradient-to-r from-[#1a1a1a] to-[#3a3a3a] hover:from-[#000] hover:to-[#222] text-white"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-3" />
                    ) : (
                      <span className="mr-3 text-xl">✕</span>
                    )}
                    Connect Crossmark
                  </Button>

                  <Button
                    onClick={() => handleXRPLConnect("gem")}
                    disabled={isLoading}
                    variant="outline"
                    className="w-full h-14 text-base font-medium border-2"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-3" />
                    ) : (
                      <span className="mr-3 text-xl">💎</span>
                    )}
                    Connect GemWallet
                  </Button>

                  <Dialog open={coldStorageDialogOpen} onOpenChange={setColdStorageDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        disabled={isLoading}
                        variant="ghost"
                        className="w-full h-12 text-sm font-medium text-muted-foreground hover:text-foreground"
                      >
                        <Shield className="w-4 h-4 mr-2" />
                        Cold Storage (Hardware Wallet)
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Connect Cold Storage</DialogTitle>
                        <DialogDescription>
                          Enter your XRPL address from a hardware wallet or paper wallet. Your keys never leave your device.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">XRPL Address</label>
                          <Input
                            placeholder="r..."
                            value={coldStorageAddress}
                            onChange={(e) => setColdStorageAddress(e.target.value)}
                            className="font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Network</label>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant={coldStorageNetwork === 'mainnet' ? 'default' : 'outline'}
                              onClick={() => setColdStorageNetwork('mainnet')}
                              className="flex-1"
                            >
                              Mainnet
                            </Button>
                            <Button
                              type="button"
                              variant={coldStorageNetwork === 'testnet' ? 'default' : 'outline'}
                              onClick={() => setColdStorageNetwork('testnet')}
                              className="flex-1"
                            >
                              Testnet
                            </Button>
                          </div>
                        </div>
                        <Button
                          onClick={handleColdStorageConnect}
                          disabled={!coldStorageAddress.trim() || isLoading}
                          className="w-full"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            "Connect Cold Storage"
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <p className="text-xs text-muted-foreground text-center">
                    You hold your own keys. We never see or store them.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Install / docs links */}
        <div className="mt-6 text-sm text-muted-foreground text-center">
          {selectedChain === "monad" ? (
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
          ) : selectedChain === "xrpl" ? (
            <p>
              Don't have one?{" "}
              <a href="https://crossmark.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Crossmark</a>
              {" · "}
              <a href="https://gemwallet.app" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">GemWallet</a>
            </p>
          ) : (
            <p>
              Connect with Reown Wallet Connect
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
