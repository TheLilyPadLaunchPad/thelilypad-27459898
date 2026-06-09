import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LilyPadLogo } from "@/components/LilyPadLogo";
import { Menu, Users, Heart, LayoutDashboard, Gift, UserCog, Radio, Sticker, Smile, Image, ShieldCheck, X, Wifi, TrendingUp, Ticket, Package, LogOut, LogIn, Vote, Music, Coins } from "lucide-react";
import { ConnectWallet } from "@/components/wallet/ConnectWallet";
import { NetworkSwitch } from "@/components/wallet/NetworkSwitch";
import { RpcSettings } from "@/components/wallet/RpcSettings";
import { ChainSelector } from "@/components/launchpad/ChainSelector";
import { NotificationBell } from "@/components/NotificationBell";
import { useWallet } from "@/providers/WalletProvider";
import { useChain } from "@/providers/ChainProvider";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useMockMode } from "@/hooks/useMockMode";
import { BuyTokensModal } from "@/components/shop/BuyTokensModal";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

import type { LucideIcon } from "lucide-react";
import { Store, Rocket, Video } from "lucide-react";

const primaryLinks: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Marketplace", href: "/marketplace", icon: Store },
  { label: "Music", href: "/music-store", icon: Music },
  { label: "Launchpad", href: "/launchpad", icon: Rocket },
  { label: "Streams", href: "/streams", icon: Video },
];

const exploreLinks = [
  { label: "Streamers", href: "/streamers", icon: Users },
  { label: "Following", href: "/following", icon: Heart },
  { label: "Governance", href: "/governance", icon: Vote, disabled: true, comingSoon: true },
  { label: "Raffles", href: "/raffles", icon: Ticket },
  { label: "Blind Boxes", href: "/blind-boxes", icon: Package },
  { label: "Official Packs", href: "/official-packs", icon: Sticker },
  { label: "Buyback Program", href: "/buyback-program", icon: TrendingUp },
];

const accountLinks = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My NFTs", href: "/my-nfts", icon: Image },
  { label: "My Sticker Packs", href: "/my-sticker-packs", icon: Sticker },
  { label: "Channel Emotes", href: "/channel-emotes", icon: Smile },
  { label: "My Donations", href: "/donor-profile", icon: Gift },
  { label: "Edit Profile", href: "/edit-profile", icon: UserCog },
  { label: "Go Live", href: "/go-live", icon: Radio },
];

const adminLinks = [
  { label: "Admin Dashboard", href: "/admin", icon: ShieldCheck },
];

export const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { network, isConnected, chainType } = useWallet();
  const { chain, setChain } = useChain();
  const { profile, loading: profileLoading } = useUserProfile();
  const { isAdmin, loading: isAdminLoading } = useIsAdmin();
  const showAdmin = !isAdminLoading && isAdmin;
  const navigate = useNavigate();
  const isTestnet = network === "testnet";

  const { isMockMode } = useMockMode();
  const [isBuyTokensOpen, setIsBuyTokensOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <nav
      className={`fixed left-0 right-0 z-50 transition-all duration-300 top-0 ${isScrolled
        ? "bg-background/80 backdrop-blur-xl border-b border-border/50"
        : "bg-transparent"
        }`}
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 sm:h-16 md:h-20">
          {/* Hamburger Menu + Logo */}
          <div className="flex items-center gap-2">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <button className="p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] sm:w-[350px] bg-background p-0">
                <SheetHeader className="p-4 border-b border-border/50">
                  <SheetTitle className="flex items-center gap-2">
                    <LilyPadLogo size={28} />
                    <span>The Lily Pad</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-180px)]">
                  {/* Chain Selection (Mobile) */}
                  <div className="space-y-2 px-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Select Blockchain</p>
                    <ChainSelector
                      selectedChain={chain.id}
                      onChainChange={setChain}
                      className="w-full justify-start h-12"
                    />
                  </div>

                  <Separator className="opacity-50" />

                  {/* Primary Links */}
                  <div className="space-y-1">
                    {primaryLinks.map((link, index) => (
                      <SheetClose asChild key={link.label}>
                        <Link
                          to={link.href}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-muted/50 hover:translate-x-1 transition-all duration-200 font-medium animate-fade-in"
                          style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
                        >
                          <link.icon className="w-5 h-5 text-muted-foreground" />
                          {link.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </div>

                  {/* Explore Section */}
                  <div className="space-y-1">
                    <p
                      className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider animate-fade-in"
                      style={{ animationDelay: `${primaryLinks.length * 50 + 50}ms`, animationFillMode: 'both' }}
                    >
                      Explore
                    </p>
                    {exploreLinks.map((link, index) => {
                      const isDisabled = 'disabled' in link && link.disabled;
                      const isComingSoon = 'comingSoon' in link && link.comingSoon;

                      if (isDisabled) {
                        return (
                          <div
                            key={link.label}
                            className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground/50 cursor-not-allowed animate-fade-in"
                            style={{ animationDelay: `${(primaryLinks.length + index + 1) * 50 + 50}ms`, animationFillMode: 'both' }}
                          >
                            <link.icon className="w-5 h-5" />
                            <span>{link.label}</span>
                            {isComingSoon && (
                              <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded-full">Soon</span>
                            )}
                          </div>
                        );
                      }

                      return (
                        <SheetClose asChild key={link.label}>
                          <Link
                            to={link.href}
                            className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-muted/50 hover:translate-x-1 transition-all duration-200 font-medium animate-fade-in"
                            style={{ animationDelay: `${(primaryLinks.length + index + 1) * 50 + 50}ms`, animationFillMode: 'both' }}
                          >
                            <link.icon className="w-5 h-5 text-muted-foreground" />
                            {link.label}
                          </Link>
                        </SheetClose>
                      );
                    })}
                  </div>

                  {/* Account Section */}
                  <div className="space-y-1">
                    <p
                      className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider animate-fade-in"
                      style={{ animationDelay: `${(primaryLinks.length + exploreLinks.length + 1) * 50 + 50}ms`, animationFillMode: 'both' }}
                    >
                      Account
                    </p>
                    {accountLinks.filter(link => {
                      // Only show streamer-specific links if user is a streamer
                      if (link.href === "/go-live" || link.label === "Go Live" || link.label === "Streamer Dashboard") {
                        return profile?.is_streamer;
                      }
                      return true;
                    }).map((link, index) => (
                      <SheetClose asChild key={link.label}>
                        <Link
                          to={link.href}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-muted/50 hover:translate-x-1 transition-all duration-200 font-medium animate-fade-in"
                          style={{ animationDelay: `${(primaryLinks.length + exploreLinks.length + index + 2) * 50 + 50}ms`, animationFillMode: 'both' }}
                        >
                          <link.icon className="w-5 h-5 text-muted-foreground" />
                          {link.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </div>

                  {/* Admin Section */}
                  {showAdmin && (
                    <div className="space-y-1">
                      <p
                        className="px-4 text-xs font-semibold text-primary uppercase tracking-wider animate-fade-in"
                        style={{ animationDelay: `${(primaryLinks.length + exploreLinks.length + accountLinks.length + 2) * 50 + 50}ms`, animationFillMode: 'both' }}
                      >
                        Admin
                      </p>
                      {adminLinks.map((link, index) => (
                        <SheetClose asChild key={link.label}>
                          <Link
                            to={link.href}
                            className="flex items-center gap-3 px-4 py-3 rounded-lg text-primary hover:bg-primary/10 hover:translate-x-1 transition-all duration-200 font-medium animate-fade-in"
                            style={{ animationDelay: `${(primaryLinks.length + exploreLinks.length + accountLinks.length + index + 3) * 50 + 50}ms`, animationFillMode: 'both' }}
                          >
                            <link.icon className="w-5 h-5" />
                            {link.label}
                          </Link>
                        </SheetClose>
                      ))}
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3 border-t border-border/50 bg-background">
                  <div className="flex items-center justify-center gap-2">
                    {chain.id === 'solana' && <NetworkSwitch />}
                    <RpcSettings variant="icon" />
                  </div>
                  <ConnectWallet className="w-full justify-center" />
                </div>
              </SheetContent>
            </Sheet>

            {/* Logo - Next to hamburger */}
            <Link to="/" className="flex items-center gap-2">
              <LilyPadLogo size={32} className="sm:w-9 sm:h-9" />
              <span className="font-bold text-base sm:text-lg hidden xs:block">The Lily Pad</span>
            </Link>
          </div>

          {/* Right side - Chain Indicator, Wallet & Notifications */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Desktop Chain Selector */}
            <div className="hidden lg:block">
              <ChainSelector
                selectedChain={chain.id}
                onChainChange={setChain}
                compact
              />
            </div>

            {isConnected && chainType && (
              <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${chainType === 'monad'
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                  : 'bg-green-500/10 text-green-400 border-green-500/30'
                }`}>
                <span>{chainType === 'monad' ? '◈' : '◎'}</span>
                <span className="hidden md:inline">{chainType === 'monad' ? 'Monad' : 'Solana'}</span>
              </div>
            )}

            {showAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:flex items-center gap-2 text-primary hover:text-primary hover:bg-primary/10 border border-primary/20"
                onClick={() => navigate('/admin')}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="font-bold text-xs uppercase tracking-tight">Admin</span>
              </Button>
            )}

            {isMockMode && profile && (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="hidden md:flex items-center gap-2 border-primary/30 hover:bg-primary/10"
                  onClick={() => setIsBuyTokensOpen(true)}
                >
                  <Coins className="w-4 h-4 text-primary" />
                  <span className="font-bold">{profile.native_token_balance || 0} LPT</span>
                </Button>
                <BuyTokensModal open={isBuyTokensOpen} onOpenChange={setIsBuyTokensOpen} />
              </>
            )}

            <NotificationBell />
            <ConnectWallet />
          </div>
        </div>
      </div>
    </nav>
  );
};
