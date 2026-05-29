import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * useBetaMode
 *
 * Reads the `beta_mode` row from the `feature_locks` table.
 * When `is_enabled = true`  → app is in beta lockdown; non-admin users are
 *                             redirected to /waitroom and cannot navigate away.
 * When `is_enabled = false` → app is fully open.
 *
 * Realtime subscription means the lock applies immediately to all active sessions
 * the moment an admin flips the switch — no page reload required.
 *
 * Admins are never affected by beta mode.
 */

const BETA_LOCK_KEY = 'beta_mode';
const QUERY_KEY     = ['beta-mode'];

export interface BetaModeState {
  isBetaMode: boolean;
  isLoading:  boolean;
  /** Toggle beta mode on/off (admin only) */
  toggle:     () => Promise<void>;
}

export function useBetaMode(): BetaModeState {
  const [isBetaMode, setIsBetaMode] = useState(false);
  const [isLoading,  setIsLoading]  = useState(true);
  const queryClient = useQueryClient();

  // ── Initial fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchBetaMode = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('feature_locks')
        .select('is_enabled')
        .eq('feature_key', BETA_LOCK_KEY)
        .maybeSingle();

      if (!cancelled) {
        if (error) {
          console.error('[useBetaMode] fetch error:', error.message);
        }
        // If the row doesn't exist yet, default to NOT locked (open app)
        setIsBetaMode(data?.is_enabled ?? false);
        setIsLoading(false);
      }
    };

    fetchBetaMode();
    return () => { cancelled = true; };
  }, []);

  // ── Realtime subscription — lock applies instantly to all active sessions ──
  useEffect(() => {
    const channel = supabase
      .channel('beta-mode-watch')
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'feature_locks',
          filter: `feature_key=eq.${BETA_LOCK_KEY}`,
        },
        (payload) => {
          const newVal = (payload.new as any)?.is_enabled ?? false;
          setIsBetaMode(newVal);
          queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // ── Toggle (admin action) ──────────────────────────────────────────────────
  const toggle = useCallback(async () => {
    const next = !isBetaMode;

    // Optimistic update
    setIsBetaMode(next);

    const { error } = await supabase
      .from('feature_locks')
      .upsert(
        {
          feature_key:           BETA_LOCK_KEY,
          feature_name:          'Beta Mode',
          description:           'When enabled, non-admin users are locked to the Wait Room and cannot access any part of the app.',
          is_enabled:            next,
          required_followers:    0,
          required_subscribers:  0,
        },
        { onConflict: 'feature_key' }
      );

    if (error) {
      // Roll back on failure
      console.error('[useBetaMode] toggle error:', error.message);
      setIsBetaMode(!next);
      throw error;
    }
  }, [isBetaMode]);

  return { isBetaMode, isLoading, toggle };
}
