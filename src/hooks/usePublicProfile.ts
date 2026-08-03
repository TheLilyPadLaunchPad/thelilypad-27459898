import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getDecentralizedProfile } from '@/integrations/arweave/profileClient';
import type { UserProfile } from './useUserProfile';
import type { LinkedWallet } from './useLinkedWallets';
import { PUBLIC_PROFILE_COLUMNS } from '@/integrations/supabase/columns';

interface PublicProfileData {
  profile: UserProfile | null;
  linkedWallets: LinkedWallet[];
  loading: boolean;
  error: string | null;
}

export function usePublicProfile(identifier: string | undefined): PublicProfileData {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [linkedWallets, setLinkedWallets] = useState<LinkedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identifier) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        // Try by display_name first, then wallet_address, then id
        let query = supabase
          .from('user_profiles')
          .select(PUBLIC_PROFILE_COLUMNS);

        // Check if it's a UUID
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

        if (isUuid) {
          query = query.eq('id', identifier);
        } else {
          // Try display_name first (case-insensitive)
          query = query.ilike('display_name', identifier);
        }

        let { data, error: fetchError } = await query.maybeSingle();

        // If not found by display_name, try wallet_address
        if (!data && !isUuid) {
          // 1. Try decentralized Arweave profile first if it looks like a wallet
          const arweaveProfile = await getDecentralizedProfile(identifier);
          if (arweaveProfile) {
            data = arweaveProfile as any;
          } else {
            // 2. Fallback to Supabase
            const walletResult = await supabase
              .from('user_profiles')
              .select(PUBLIC_PROFILE_COLUMNS)
              .eq('wallet_address', identifier)
              .maybeSingle();

            data = walletResult.data as any;
            fetchError = walletResult.error;
          }
        } else if (data && data.wallet_address) {
          // Even if found in Supabase, try to refresh from Arweave for latest decentralized state
          const arweaveProfile = await getDecentralizedProfile(data.wallet_address);
          if (arweaveProfile) {
            data = { ...data, ...arweaveProfile } as any;
          }
        }


        if (cancelled) return;
        if (fetchError) throw fetchError;
        if (!data) {
          setError('Profile not found');
          setProfile(null);
          return;
        }

        setProfile(data as UserProfile);

        // Fetch linked wallets if profile is public
        if (!(data as any).is_private) {
          const { data: wallets } = await supabase
            .from('linked_wallets')
            .select(PUBLIC_PROFILE_COLUMNS)
            .eq('profile_id', (data as any).id)
            .order('is_primary', { ascending: false });

          if (!cancelled) {
            setLinkedWallets((wallets as LinkedWallet[]) || []);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load profile');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProfile();
    return () => { cancelled = true; };
  }, [identifier]);

  return { profile, linkedWallets, loading, error };
}
