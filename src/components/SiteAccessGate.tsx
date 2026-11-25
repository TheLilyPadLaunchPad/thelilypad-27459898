import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdmin } from '@/contexts/AdminContext';
import { useBetaMode } from '@/hooks/useBetaMode';
import { isSitePathLocked } from '@/lib/siteAccess';
import FrogLoader from './FrogLoader';

export function SiteAccessGate() {
  const { pathname } = useLocation();
  const { isAdmin, loading } = useAdmin();
  const { isBetaMode, isLoading } = useBetaMode();
  if (isLoading || loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><FrogLoader size="lg" /></div>;
  }
  if (isSitePathLocked(pathname, isBetaMode, isAdmin)) {
    return <Navigate to="/waitroom" replace />;
  }
  return <Outlet />;
}