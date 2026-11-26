import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

// Read the link details once, before the sign-in client clears them from the address bar.
const initialHash = typeof window !== "undefined" ? window.location.hash : "";
const linkFailed = /[#&]error(_code|_description)?=/.test(initialHash);

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(!linkFailed && initialHash.includes("type=recovery"));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (linkFailed) return;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // The reset link may already have signed the visitor in before this page loaded.
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session && !data.session.user.is_anonymous) setReady(true);
    }).catch(() => {});
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Use at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    try { window.__lovableEvents?.track?.("project.password_reset_completed", {}); } catch { /* Analytics must never block a reset. */ }
    toast.success("Password saved");
    navigate("/waitroom", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            {linkFailed ? "This reset link has expired or was already used."
              : ready ? "Choose your new password." : "Open this page from the link in your email."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!linkFailed && (
            <form onSubmit={save} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="reset-password">New password</Label>
                <Input id="reset-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} disabled={!ready} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reset-confirm">Confirm password</Label>
                <Input id="reset-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={!ready} />
              </div>
              <Button type="submit" className="w-full" disabled={!ready || busy}>{busy ? "Saving…" : "Save password"}</Button>
            </form>
          )}
          {(linkFailed || !ready) && (
            <Button asChild variant="outline" className="w-full"><Link to="/auth">Request a new reset link</Link></Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
