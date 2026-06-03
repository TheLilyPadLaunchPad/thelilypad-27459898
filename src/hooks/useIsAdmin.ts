import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWallet } from '@/providers/WalletProvider';

export const useIsAdmin = () => {
  const { address, isConnected } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ADMIN_WALLETS = [
      'Cra8LAvpQAk3hx4By5STHp4xrq7HSAnZLk4Jwzv1wUAH',
      '3xxV9tbTanfAqRTSZkiZKMGdVDb3KZrrPm3NCkU38Hty',
    ];

    const checkAdminStatus = async () => {
      // Fast path: wallet-based admin bypass
      if (isConnected && address && ADMIN_WALLETS.includes(address)) {
        setIsAdmin(true);
        setLoading(false);
        return;
      }

      // Server-side admin role check via Supabase user_roles table.
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (error) {
          console.error('Error checking admin status:', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(!!data);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdminStatus();
    });

    return () => subscription.unsubscribe();
  }, [isConnected, address]);

  return { isAdmin, loading };
};
