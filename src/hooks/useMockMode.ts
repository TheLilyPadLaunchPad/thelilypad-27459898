import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const MOCK_MODE_KEY = 'mock_mode';

export interface MockModeState {
  isMockMode: boolean;
  isLoading: boolean;
}

export function useMockMode(): MockModeState {
  const [isMockMode, setIsMockMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchMockMode = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('feature_locks')
        .select('is_enabled')
        .eq('feature_key', MOCK_MODE_KEY)
        .maybeSingle();

      if (!cancelled) {
        if (error) {
          console.error('[useMockMode] fetch error:', error.message);
        }
        setIsMockMode(!!data?.is_enabled);
        setIsLoading(false);
      }
    };

    fetchMockMode();

    const channel = supabase
      .channel('public:feature_locks:mock_mode')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'feature_locks',
          filter: `feature_key=eq.${MOCK_MODE_KEY}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setIsMockMode(false);
          } else {
            setIsMockMode(!!payload.new.is_enabled);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { isMockMode, isLoading };
}
