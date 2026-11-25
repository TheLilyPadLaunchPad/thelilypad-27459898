import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { isWhitelistEligible } from '@/lib/whitelistEligibility';

export function useWhitelistEligibility() {
  const { state, walletAddress, profile } = useAuth();
  const authenticated = state === 'AUTHENTICATED';
  const confirmedAccounts = useRef(new Set<string>());
  const query = useQuery({
    queryKey: ['whitelist-eligibility', state, walletAddress, profile?.user_id],
    enabled: authenticated && !!walletAddress,
    queryFn: async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session || session.user.is_anonymous) return false;
      const { data, error } = await supabase.rpc('get_my_profile');
      if (error) throw error;
      const saved = Array.isArray(data) ? data[0] : data;
      const eligible = isWhitelistEligible({
        authenticated, walletAddress, sessionUserId: session.user.id,
        profileUserId: saved?.user_id ?? null,
        savedWalletAddress: saved?.wallet_address ?? null,
        profileComplete: saved?.profile_setup_completed === true,
      });
      // This flow grants WL by verifying saved registration, not by creating a separate claim row.
      // Deduplicate retries/refocus checks; account identifiers stay in memory and never in events.
      if (eligible && !confirmedAccounts.current.has(session.user.id)) {
        confirmedAccounts.current.add(session.user.id);
        try {
          window.__lovableEvents?.track?.('project.whitelist_claim_succeeded', { entry_point: 'waitroom' });
        } catch { /* Analytics must never prevent WL eligibility. */ }
      }
      return eligible;
    },
    staleTime: 0,
  });
  return { eligible: authenticated && !!walletAddress && query.data === true, checking: query.isFetching, error: query.isError };
}