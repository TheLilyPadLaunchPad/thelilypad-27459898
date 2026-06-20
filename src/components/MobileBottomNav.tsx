import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Store, Rocket, Radio, Wallet, LayoutDashboard } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWallet } from "@/providers/WalletProvider";
import { useUserProfile } from "@/hooks/useUserProfile";
import { cn } from "@/lib/utils";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  matchPrefix?: string;
}

const baseNavItems: NavItem[] = [
  { icon: Home,    label: "Home",    href: "/",           matchPrefix: "__exact__" },
  { icon: Store,   label: "Market",  href: "/marketplace", matchPrefix: "/marketplace" },
  { icon: Rocket,  label: "Launch",  href: "/launchpad",  matchPrefix: "/launchpad" },
  { icon: Radio,   label: "Streams", href: "/streams",    matchPrefix: "/streams" },
  { icon: Wallet,  label: "Wallet",  href: "/wallet",     matchPrefix: "/wallet" },
];

const streamerNavItems: NavItem[] = [
  { icon: Home,            label: "Home",      href: "/",            matchPrefix: "__exact__" },
  { icon: Store,           label: "Market",    href: "/marketplace", matchPrefix: "/marketplace" },
  { icon: Rocket,          label: "Launch",    href: "/launchpad",   matchPrefix: "/launchpad" },
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard",   matchPrefix: "/dashboard" },
  { icon: Wallet,          label: "Wallet",    href: "/wallet",      matchPrefix: "/wallet" },
];

export const MobileBottomNav: React.FC = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { isConnected } = useWallet();
  const { profile } = useUserProfile();

  // Hide on auth, profile setup, and suspended pages
  const hiddenPaths = ["/auth", "/profile-setup", "/profile-suspended"];
  if (hiddenPaths.includes(location.pathname)) return null;

  const navItems = profile?.is_streamer ? streamerNavItems : baseNavItems;

  const isActive = (item: NavItem) => {
    if (item.matchPrefix === "__exact__") return location.pathname === item.href;
    if (item.matchPrefix) return location.pathname.startsWith(item.matchPrefix);
    return location.pathname === item.href;
  };

  const resolveHref = (item: NavItem) => {
    if (!isConnected && item.href !== "/") return "/auth";
    return item.href;
  };

  // Mobile: fixed bottom pill nav
  if (isMobile) {
    return (
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50 safe-area-bottom"
        role="navigation"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-around px-1" style={{ height: "64px" }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            const href = resolveHref(item);

            return (
              <Link
                key={item.href}
                to={href}
                className={cn(
                  "relative flex flex-col items-center justify-center flex-1 py-1.5 px-0.5",
                  "transition-all duration-150 active:scale-90 select-none",
                  "-webkit-tap-highlight-color: transparent"
                )}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                {active && (
                  <span
                    className="absolute inset-x-2 top-1 bottom-1 rounded-xl bg-primary/12 pointer-events-none"
                    style={{
                      animation: "nav-pill-appear 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    }}
                  />
                )}
                <Icon
                  className={cn(
                    "relative z-10 mb-0.5 transition-all duration-200",
                    active
                      ? "w-5 h-5 text-primary scale-110"
                      : "w-5 h-5 text-muted-foreground"
                  )}
                  strokeWidth={active ? 2.5 : 1.75}
                />
                <span
                  className={cn(
                    "relative z-10 text-[10px] font-semibold tracking-tight leading-none transition-colors duration-200",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
                {active && (
                  <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-primary opacity-60" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  // Desktop: slim fixed left sidebar nav
  return (
    <nav
      className="fixed left-0 top-0 md:top-20 bottom-0 z-40 flex flex-col items-center py-4 gap-1 bg-background/80 backdrop-blur-xl border-r border-border/50 w-16"
      role="navigation"
      aria-label="Desktop navigation"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item);
        const href = resolveHref(item);

        return (
          <Link
            key={item.href}
            to={href}
            className={cn(
              "relative flex flex-col items-center justify-center w-12 h-12 rounded-xl",
              "transition-all duration-150 hover:scale-105 select-none group",
              active && "bg-primary/10"
            )}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            title={item.label}
          >
            <Icon
              className={cn(
                "transition-all duration-200",
                active
                  ? "w-5 h-5 text-primary scale-110"
                  : "w-5 h-5 text-muted-foreground group-hover:text-foreground"
              )}
              strokeWidth={active ? 2.5 : 1.75}
            />
            <span
              className={cn(
                "text-[9px] font-semibold mt-0.5 transition-colors",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};

