import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Wallet } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useSiteAsset } from "@/hooks/useSiteAsset";
import { markEnteredApp, safeReturnTo } from "@/lib/guestEntry";
import { WALLET_REQUIRED } from "@/components/ProtectedRoute";
import { ChainConnectModal } from "@/components/wallet/ChainConnectModal";
import authBrandingAsset from "@/assets/auth-branding.webp.asset.json";

const fallbackAuthBranding = authBrandingAsset.url;

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const returnNeedsWallet = !!returnTo && WALLET_REQUIRED.some((p) => returnTo.startsWith(p));
  const [connectOpen, setConnectOpen] = useState(false);
  const { state } = useAuth();
  const { assetUrl: authBranding } = useSiteAsset("auth_branding", fallbackAuthBranding);

  useSEO({
    title: "Enter The Lily Pad | Multi-Chain NFT Launchpad",
    description:
      "Step into The Lily Pad to explore NFT launches, the marketplace and creator drops. Connect a Solana, Monad or XRPL wallet whenever you're ready.",
  });

  // Once connected, send the visitor back to where they were heading
  useEffect(() => {
    if (state === "AUTHENTICATED") {
      markEnteredApp();
      navigate(returnTo || "/streams", { replace: true });
    } else if (state === "NEEDS_PROFILE") {
      navigate("/profile-setup");
    }
  }, [state, navigate, returnTo]);

  const handleEnter = () => {
    markEnteredApp();
    navigate(returnTo && !returnNeedsWallet ? returnTo : "/", { replace: true });
  };

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

      {/* Right side - Enter */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 bg-background">
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
            <CardDescription>Jump in and look around — no wallet needed yet.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {returnTo && (
              <p className="text-sm text-center text-muted-foreground">
                Connect a wallet to continue where you left off.
              </p>
            )}
            <Button
              onClick={() => setConnectOpen(true)}
              variant={returnTo ? "default" : "outline"}
              className="w-full h-12 text-base font-semibold gap-2"
            >
              <Wallet className="w-5 h-5" /> Connect wallet
            </Button>
            <Button
              onClick={handleEnter}
              variant={returnTo ? "outline" : "default"}
              className="w-full h-14 text-base font-semibold group"
            >
              {returnTo && !returnNeedsWallet ? "Continue browsing" : "Enter"}
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <ChainConnectModal open={connectOpen} onOpenChange={setConnectOpen} />

            <p className="text-xs text-muted-foreground text-center">
              You can connect a Solana, Monad or XRPL wallet from anywhere inside the app when you're
              ready to mint, buy or sell. Robinhood Chain is coming soon.
            </p>
          </CardContent>
        </Card>

        <p className="mt-6 text-sm text-muted-foreground text-center">
          It always takes leaps to go over problems.
        </p>
      </main>
    </div>
  );
}
