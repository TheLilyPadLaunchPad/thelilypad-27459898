import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { requestStreamerWallet, type WalletResponse } from '@/lib/streamerWalletRequest';

export const useStreamerWallet = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWalletAddress = useCallback(async (streamerUserId: string): Promise<WalletResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      return await requestStreamerWallet(supabase, streamerUserId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch wallet address';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    fetchWalletAddress,
    isLoading,
    error,
  };
};
