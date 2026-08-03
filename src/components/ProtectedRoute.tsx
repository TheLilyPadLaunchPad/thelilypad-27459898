import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/providers/AuthProvider";
import { useBetaMode } from "@/hooks/useBetaMode";
import FrogLoader from "./FrogLoader";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Routes that are always reachable even in beta mode
const BETA_ALLOWLIST = [
  '/waitroom',
  '/leaderboard',   // leaderboard is part of the waitroom experience
  '/auth',
  '/auth/callback',
  '/profile-setup',
  '/profile-suspended',
];

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { state, isAdmin } = useAuth();
  const { isBetaMode, isLoading: betaLoading } = useBetaMode();
  const location = useLocation();

  // On page refresh the wallet auto-reconnect hasn't fired yet, so
  // the auth state starts as DISCONNECTED for a brief moment.
  // If localStorage says the user was previously connected, treat this
  // as a loading state instead of redirecting to /auth immediately.
  const hadPreviousSession = typeof window !== 'undefined' && localStorage.getItem('walletConnected') === 'true';

  // Show loader while wallet connecting, handshaking, or profile loading
  if (state === "CONNECTING_WALLET" || state === "WALLET_CONNECTED" || state === "LOADING_PROFILE") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <FrogLoader size="lg" />
      </div>
    );
  }

  // If disconnected but a previous session exists, wait for auto-reconnect
  if (state === "DISCONNECTED" && hadPreviousSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <FrogLoader size="lg" />
      </div>
    );
  }

  // Redirect to auth if truly disconnected (no prior session)
  if (state === "DISCONNECTED") {
    return <Navigate to="/auth" replace />;
  }

  // ADMIN BYPASS: Admins always have full access regardless of beta mode
  if (isAdmin) {
    if (location.pathname === '/profile-setup') {
      return <Navigate to="/" replace />;
    }
    return <>{children}</>;
  }

  // Redirect to profile setup if needed
  if (state === "NEEDS_PROFILE" && location.pathname !== "/profile-setup") {
    return <Navigate to="/profile-setup" replace />;
  }

  // ── BETA MODE GATE ────────────────────────────────────────────────────────
  // Wait for the beta mode check to resolve before rendering anything
  if (betaLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <FrogLoader size="lg" />
      </div>
    );
  }

  // If beta mode is ON and this route is not on the allowlist, send to waitroom
  if (isBetaMode && !BETA_ALLOWLIST.some(p => location.pathname.startsWith(p))) {
    return <Navigate to="/waitroom" replace />;
  }
  // ─────────────────────────────────────────────────────────────────────────

  return <>{children}</>;
};

export default ProtectedRoute;
