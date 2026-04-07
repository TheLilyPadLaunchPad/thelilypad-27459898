import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import FrogLoader from "./FrogLoader";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { state, isAdmin } = useAuth();
  const location = useLocation();

  // Show loader while wallet connecting, handshaking, or profile loading
  if (state === "CONNECTING_WALLET" || state === "WALLET_CONNECTED" || state === "LOADING_PROFILE") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <FrogLoader size="lg" />
      </div>
    );
  }

  // Redirect to auth if disconnected
  if (state === "DISCONNECTED") {
    return <Navigate to="/auth" replace />;
  }

  // ADMIN BYPASS: Admins don't need a profile to access the site
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

  // After profile setup, redirect to waitroom (unless already there or on an apply page)
  if (state === "AUTHENTICATED" && location.pathname === "/") {
    // For now, all authenticated users go to the waitroom
    // Remove this redirect when the platform is ready for full access
    // return <Navigate to="/waitroom" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
