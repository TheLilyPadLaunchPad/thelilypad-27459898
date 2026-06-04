import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/providers/WalletProvider';
import { supabase } from '@/integrations/supabase/client';
import { getDecentralizedProfile, saveDecentralizedProfile } from '@/integrations/arweave/profileClient';
import { useChain } from '@/providers/ChainProvider';

export interface UserProfile {
    id: string;
    wallet_address: string;
    user_id: string | null;
    is_collector: boolean;
    is_creator: boolean;
    is_streamer: boolean;
    profile_setup_completed: boolean;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    banner_url: string | null;
    social_twitter: string | null;
    social_discord: string | null;
    social_instagram: string | null;
    social_youtube: string | null;
    social_tiktok: string | null;
    schedule: unknown;
    categories: string[] | null;
    /** @deprecated payout wallet now lives in user_payout_wallets table (owner-only RLS) */
    payout_wallet_address?: string | null;
    playlist_ids: string[] | null;
    is_verified: boolean;
    is_private: boolean;
    native_token_balance?: number | null;
    referred_by?: string | null;
    created_at: string;
    updated_at: string;

}

export const useUserProfile = () => {
    const { address, isConnected, network } = useWallet();
    const { chain } = useChain();
    const queryClient = useQueryClient();

    const fetchProfile = async () => {
        if (!address) return null;

        try {
            // 1. Fetch from Arweave (Primary for Decentralized Mode)
            const arweaveProfile = await getDecentralizedProfile(address);

            // 2. Fetch from Supabase (Secondary)
            let supabaseProfile: UserProfile | null = null;
            try {
                const { data, error: fetchError } = await supabase
                    .from('user_profiles')
                    .select('*')
                    .eq('wallet_address', address)
                    .maybeSingle();
                if (!fetchError && data) supabaseProfile = data as UserProfile;
            } catch (e) {
                console.warn("Supabase profile fetch failed", e);
            }

            // Merge: Arweave data wins for shared fields
            return arweaveProfile || supabaseProfile;
        } catch (err: unknown) {
            console.error('Error in profile fetch function:', err);
            return null;
        }
    };

    const { data: profile, isLoading, error, refetch } = useQuery({
        queryKey: ['user-profile', address],
        queryFn: fetchProfile,
        enabled: !!address && isConnected,
        staleTime: 60000,
    });

    // Realtime changes hook proxying to query invalidation
    useEffect(() => {
        if (!address) return;
        const channel = supabase
            .channel(`profile-updates-${address}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'user_profiles',
                filter: `wallet_address=eq.${address}`
            }, () => {
                queryClient.invalidateQueries({ queryKey: ['user-profile', address] });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [address, queryClient]);

    // Decentralized Persistence Wrapper
    const persistToArweave = async (updates: Partial<UserProfile>) => {
        if (!address) return;
        try {
            await saveDecentralizedProfile(updates, { address, network });
        } catch (e) {
            console.warn("Decentralized profile persistence failed:", e);
        }
    };

    const createProfile = async (roleSelection: {
        isCollector: boolean;
        isCreator: boolean;
        isStreamer: boolean;
    }, displayName?: string) => {
        if (!address) {
            throw new Error('Wallet not connected');
        }

        const updates = {
            wallet_address: address,
            is_collector: roleSelection.isCollector,
            is_creator: roleSelection.isCreator,
            is_streamer: roleSelection.isStreamer,
            profile_setup_completed: true,
            ...(displayName?.trim() ? { display_name: displayName.trim() } : {}),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Persist to Arweave (Always)
        await persistToArweave(updates);

        // Link to Supabase (if available)
        let finalProfile: UserProfile | null = null;
        try {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            const { data, error: insertError } = await supabase
                .from('user_profiles')
                .upsert({
                    ...updates,
                    user_id: authUser?.id || null,
                }, { onConflict: 'wallet_address' })
                .select()
                .single();

            if (!insertError) {
                finalProfile = data as UserProfile;
            }
        } catch (e) {
            console.warn("Supabase creation failed, falling back to local state");
        }

        if (!finalProfile) {
            finalProfile = { ...profile, ...updates } as UserProfile;
        }

        // Update local cache immediately
        queryClient.setQueryData(['user-profile', address], finalProfile);
        // Force refetch to ensure everything is settled
        await queryClient.invalidateQueries({ queryKey: ['user-profile', address] });

        return finalProfile;
    };

    const updateProfile = async (updates: Partial<UserProfile>) => {
        if (!address) {
            throw new Error('Wallet not connected');
        }

        // Persist to Arweave
        await persistToArweave({ ...profile, ...updates });

        let finalProfile: UserProfile | null = null;
        try {
            const { data, error: updateError } = await supabase
                .from('user_profiles')
                .update(updates as Record<string, unknown>)
                .eq('wallet_address', address)
                .select()
                .single();

            if (!updateError) {
                finalProfile = data as UserProfile;
            }
        } catch (e) {
            console.warn("Supabase update failed");
        }

        if (!finalProfile) {
            finalProfile = { ...profile, ...updates } as UserProfile;
        }

        queryClient.setQueryData(['user-profile', address], finalProfile);
        queryClient.invalidateQueries({ queryKey: ['user-profile', address] });

        return finalProfile;
    };

    const saveProfile = async (updates: Partial<UserProfile>) => {
        if (!address) {
            throw new Error('Wallet not connected');
        }

        // Persist to Arweave
        await persistToArweave({ ...profile, ...updates });

        let finalProfile: UserProfile | null = null;
        try {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            const upsertData = {
                wallet_address: address,
                user_id: authUser?.id || null,
                ...updates,
                profile_setup_completed: true,
            };

            const { data, error: upsertError } = await (supabase
                .from('user_profiles') as any)
                .upsert(upsertData, { onConflict: 'wallet_address' })
                .select()
                .single();

            if (!upsertError) {
                finalProfile = data as UserProfile;
            }
        } catch (e) {
            console.warn("Supabase save failed");
        }

        if (!finalProfile) {
            finalProfile = { ...profile, ...updates } as UserProfile;
        }

        queryClient.setQueryData(['user-profile', address], finalProfile);
        queryClient.invalidateQueries({ queryKey: ['user-profile', address] });

        return finalProfile;
    };

    return {
        profile: profile ?? null,
        loading: isLoading,
        isLoading,
        error: error instanceof Error ? error.message : null,
        createProfile,
        updateProfile,
        saveProfile,
        refetch,
        hasProfile: !!profile,
        profileComplete: (profile as UserProfile)?.profile_setup_completed ?? false
    };
};
