import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import FrogLoader from "@/components/FrogLoader";
import { CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Auth callback page for OAuth redirects and email verification
 * Handles Google OAuth and email verification flows
 */
const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Completing sign in...");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check if this is a Supabase auth callback (email verification or OAuth)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");
        const errorDescription = hashParams.get("error_description");

        // Handle auth errors from URL
        if (errorDescription) {
          setStatus("error");
          setMessage(decodeURIComponent(errorDescription));
          return;
        }

        // Handle password recovery
        if (type === "recovery") {
          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              setStatus("error");
              setMessage(error.message);
              return;
            }

            // Redirect to settings page to set new password
            setStatus("success");
            setMessage("Verified! Redirecting to reset your password...");
            setTimeout(() => navigate("/settings?tab=account", { replace: true }), 2000);
            return;
          }
        }

        // Handle email verification success
        if (type === "signup" || type === "email") {
          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              setStatus("error");
              setMessage(error.message);
              return;
            }

            setStatus("success");
            setMessage("Email verified successfully!");
            setTimeout(() => navigate("/streams", { replace: true }), 2000);
            return;
          }
        }

        // Handle OAuth callback (Google, etc.)
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            setStatus("error");
            setMessage(error.message);
            return;
          }

          navigate("/streams", { replace: true });
          return;
        }

        // Check for existing session from OAuth flow
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          navigate("/streams", { replace: true });
          return;
        }

        // No SDK fallback needed — redirect home
        navigate("/", { replace: true });
      } catch (error) {
        console.error("Auth callback error:", error);
        setStatus("error");
        setMessage("Authentication failed. Please try again.");
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md px-4">
        {status === "loading" && (
          <>
            <FrogLoader size="lg" />
            <p className="text-muted-foreground">{message}</p>
          </>
        )}
        
        {status === "success" && (
          <>
            <div className="flex justify-center">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">{message}</h2>
            <p className="text-muted-foreground">Redirecting you to the app...</p>
          </>
        )}
        
        {status === "error" && (
          <>
            <div className="flex justify-center">
              <XCircle className="w-16 h-16 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Verification Failed</h2>
            <p className="text-muted-foreground">{message}</p>
            <Button onClick={() => navigate("/auth", { replace: true })}>
              Back to Sign In
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;