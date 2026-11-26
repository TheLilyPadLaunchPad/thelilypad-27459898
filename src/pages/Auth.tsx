import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAccountSession } from "@/hooks/useAccountSession";
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
  const { user: account, loading: accountLoading } = useAccountSession();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    if (mode !== "forgot" && password.length < 8) { toast.error("Use at least 8 characters for your password"); return; }
    setBusy(true);
    setNotice("");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: address, password });
        if (error) throw error;
        try { window.__lovableEvents?.track?.("project.account_signed_in", { method: "email" }); } catch { /* Analytics must never block sign-in. */ }
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: address, password, options: { emailRedirectTo: `${window.location.origin}/auth${window.location.search}` },
        });
        if (error) throw error;
        // With email confirmation on, there is no session until the link is opened.
        // An already-registered email returns a placeholder with no identities: not a new sign-up.
        if (data.session || (data.user?.identities?.length ?? 0) > 0) {
          try {
            window.__lovableEvents?.track?.("project.account_signed_up", { method: "email", confirmation_required: !data.session });
          } catch { /* Analytics must never block sign-up. */ }
        }
        if (!data.session) setNotice("Check your email and open the confirmation link to finish creating your account.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        try { window.__lovableEvents?.track?.("project.password_reset_requested", {}); } catch { /* Analytics must never block a reset. */ }
        setNotice("If that email has an account, a password reset link is on its way.");
      }
    } catch (err) {
      try {
        window.__lovableEvents?.track?.("project.account_auth_failed", { action: mode === "signin" ? "sign_in" : mode === "signup" ? "sign_up" : "password_reset" });
      } catch { /* Never send the error text or the email. */ }
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const { assetUrl: authBranding } = useSiteAsset("auth_branding", fallbackAuthBranding);

  useSEO({
    title: "Enter The Lily Pad | Multi-Chain NFT Launchpad",
    description:
      "Step into The Lily Pad to explore NFT launches, the marketplace and creator drops. Connect a Solana, Monad or XRPL wallet whenever you're ready.",
  });

  // Once connected, send the visitor back to where they were heading
  useEffect(() => {
    // Wallets alone no longer sign anyone in: wait for the email account.
    if (!account) return;
    if (state === "AUTHENTICATED") {
      markEnteredApp();
      navigate(returnTo || "/streams", { replace: true });
    } else if (state === "NEEDS_PROFILE") {
      const referral = searchParams.get('ref');
      navigate(referral ? `/profile-setup?ref=${encodeURIComponent(referral)}` : '/profile-setup');
    }
  }, [state, account, navigate, returnTo, searchParams]);

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
            <CardDescription>
              {account ? "You're signed in. Connect a wallet with Reown to continue." : "Sign in with your email, then connect your wallet with Reown."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {account ? (
              <>
                <p className="text-sm text-center text-muted-foreground break-all">Signed in as {account.email}</p>
                <Button onClick={() => setConnectOpen(true)} className="w-full h-12 text-base font-semibold gap-2">
                  <Wallet className="w-5 h-5" /> Connect wallet
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => void supabase.auth.signOut()}>Sign out</Button>
              </>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="auth-email">Email</Label>
                  <Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-password">Password</Label>
                    <Input id="auth-password" type="password" required minLength={8}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                )}
                {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={busy || accountLoading}>
                  {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
                </Button>
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <button type="button" className="text-primary hover:underline" onClick={() => { setNotice(""); setMode(mode === "signin" ? "signup" : "signin"); }}>
                    {mode === "signin" ? "Create an account" : "I already have an account"}
                  </button>
                  {mode === "signin" && (
                    <button type="button" className="text-muted-foreground hover:underline" onClick={() => { setNotice(""); setMode("forgot"); }}>
                      Forgot password?
                    </button>
                  )}
                </div>
              </form>
            )}
            <Button
              onClick={handleEnter}
              variant="outline"
              className="w-full h-12 text-base font-semibold group"
            >
              {account ? "Continue" : "Continue browsing"}
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <ChainConnectModal open={connectOpen} onOpenChange={setConnectOpen} />

            <p className="text-xs text-muted-foreground text-center">
              Your email keeps your profile and whitelist spot safe. Your wallet connects through Reown
              whenever you're ready to mint, buy or sell.
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
