import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CurrencyType = "SOL" | "MON";

interface CreatorCurrencySettings {
  preferredCurrency: CurrencyType;
  solWalletAddress: string | null;
  payoutWalletAddress: string | null;
}

export const useCreatorCurrency = (userId?: string) => {
  const [settings, setSettings] = useState<CreatorCurrencySettings>({
    preferredCurrency: "SOL",
    solWalletAddress: null,
    payoutWalletAddress: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("streamer_profiles")
        .select("preferred_currency, sol_wallet_address, payout_wallet_address")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          preferredCurrency: (data.preferred_currency as CurrencyType) || "SOL",
          solWalletAddress: data.sol_wallet_address,
          payoutWalletAddress: data.payout_wallet_address,
        });
      }
    } catch (error) {
      console.error("Error fetching currency settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateCurrency = async (currency: CurrencyType) => {
    if (!userId) {
      toast.error("Please sign in to update settings");
      return false;
    }

    try {
      const { error } = await supabase
        .from("streamer_profiles")
        .update({ preferred_currency: currency })
        .eq("user_id", userId);

      if (error) throw error;

      setSettings(prev => ({ ...prev, preferredCurrency: currency }));
      toast.success(`Currency preference updated to ${currency}`);
      return true;
    } catch (error) {
      console.error("Error updating currency:", error);
      toast.error("Failed to update currency preference");
      return false;
    }
  };

  const updateSolWallet = async (walletAddress: string) => {
    if (!userId) {
      toast.error("Please sign in to update settings");
      return false;
    }

    // Basic Solana address validation
    if (!walletAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
      toast.error("Invalid Solana wallet address");
      return false;
    }

    try {
      const { error } = await supabase
        .from("streamer_profiles")
        .update({ sol_wallet_address: walletAddress })
        .eq("user_id", userId);

      if (error) throw error;

      setSettings(prev => ({ ...prev, solWalletAddress: walletAddress }));
      toast.success("SOL wallet address saved");
      return true;
    } catch (error) {
      console.error("Error updating SOL wallet:", error);
      toast.error("Failed to update SOL wallet address");
      return false;
    }
  };

  const canReceiveSOL = settings.preferredCurrency === "SOL" && !!settings.solWalletAddress;

  return {
    ...settings,
    isLoading,
    updateCurrency,
    updateSolWallet,
    canReceiveSOL,
    refetch: fetchSettings,
  };
};

// Currency display metadata
const CURRENCY_META: Record<CurrencyType, { symbol: string; icon: string }> = {
  SOL: { symbol: "SOL", icon: "◎" },
  MON: { symbol: "MON", icon: "⟠" },
};

// Helper hook for shop item currency display
export const useCurrencyDisplay = (currency: CurrencyType, priceSol?: number) => {
  const meta = CURRENCY_META[currency] || CURRENCY_META.SOL;

  const getDisplayPrice = () => {
    return { amount: priceSol || 0, symbol: meta.symbol, icon: meta.icon };
  };

  const formatPrice = (amount: number, symbol: string) => {
    return `${amount.toFixed(4)} ${symbol}`;
  };

  return { getDisplayPrice, formatPrice };
};
