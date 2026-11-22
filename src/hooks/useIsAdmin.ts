import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWallet } from '@/providers/WalletProvider';
import { setAdminTestNetworksEnabled } from '@/integrations/reown/appkit';

/**
 * Keep the boot-time admin-networks hint in sync with verified admin status.
 * The Reown AppKit singleton is created before auth resolves, so when the
 * hint changes we reload once to re-register the correct network list.
 */
const syncAdminTestNetworks = (isAdmin: boolean) => {
  const changed = setAdminTestNetworksEnabled(isAdmin);
  if (!changed || typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem('lilypad_net_reload')) return;
    sessionStorage.setItem('lilypad_net_reload', '1');
  } catch {}
  window.location.reload();
};

/**
 * Admin status is granted exclusively via the server-side `user_roles` table
 * (role = 'admin'). The previous hardcoded ADMIN_WALLETS bypass was removed
 * for security — admins must have a row in `user_roles`.
 */
export const useIsAdmin = () => {
  const { address, isConnected } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let generation = 0;
    let authTimer: ReturnType<typeof setTimeout> | undefined;
    const checkAdminStatus = async () => {
      const current = ++generation;
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!active || current !== generation) return;

        if (!user) {
          setIsAdmin(false);
          syncAdminTestNetworks(false);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (!active || current !== generation) return;

        if (error) {
          console.error('Error checking admin status:', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(!!data);
          syncAdminTestNetworks(!!data);
        }
      } catch (error) {
        if (!active || current !== generation) return;
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        if (active && current === generation) setLoading(false);
      }
    };

    checkAdminStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Auth awaits its subscribers while holding its session lock. Defer
      // getUser() until the callback returns, or wallet sign-in can deadlock.
      setLoading(true);
      generation++;
      clearTimeout(authTimer);
      authTimer = setTimeout(() => { if (active) void checkAdminStatus(); }, 0);
    });

    return () => {
      active = false;
      clearTimeout(authTimer);
      subscription.unsubscribe();
    };
  }, [isConnected, address]);

  return { isAdmin, loading };
};
