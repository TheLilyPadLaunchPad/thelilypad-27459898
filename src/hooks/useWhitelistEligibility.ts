import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { isWhitelistEligible } from '@/lib/whitelistEligibility';

export function useWhitelistEligibility() {
  const { state, walletAddress, profile } = useAuth();
  const authenticated = state === 'AUTHENTICATED';
  const query = useQuery({
    queryKey: ['whitelist-eligibility', state, walletAddress, profile?.user_id],
    enabled: authenticated && !!walletAddress,
    queryFn: async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session || session.user.is_anonymous) return false;
      const { data, error } = await supabase.rpc('get_my_profile');
      if (error) throw error;
      const saved = Array.isArray(data) ? data[0] : data;
      return isWhitelistEligible({
        authenticated, walletAddress, sessionUserId: session.user.id,
        profileUserId: saved?.user_id ?? null,
        savedWalletAddress: saved?.wallet_address ?? null,
        profileComplete: saved?.profile_setup_completed === true,
      });
    },
    staleTime: 0,
  });
  return { eligible: authenticated && !!walletAddress && query.data === true, checking: query.isFetching, error: query.isError };
}