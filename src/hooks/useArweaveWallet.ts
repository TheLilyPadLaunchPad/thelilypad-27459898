import { useCallback, useEffect, useState } from "react";
import {
  ArweaveWalletMissingError,
  disconnectArweaveWallet,
  ensureArweaveWalletConnected,
  getArBalance,
  getUploadPriceAr,
  isArweaveWalletAvailable,
} from "@/integrations/arweave/nativeClient";

interface UseArweaveWalletState {
  /** True when ArConnect / Wander extension is detected in this browser. */
  installed: boolean;
  /** True after the user has granted permissions to this site. */
  connected: boolean;
  /** Active Arweave address (43-char base64url) once connected. */
  address: string | null;
  /** User's AR balance once `refreshBalance` has run. */
  balance: number | null;
  /** True while a connect/balance call is in flight. */
  loading: boolean;
  /** Last error from connect / refreshBalance. */
  error: string | null;
}

/**
 * Detect ArConnect/Wander, expose a connect/disconnect flow, and surface the
 * user's AR balance. Pure presentation-layer helper — upload logic lives in
 * `@/integrations/arweave/nativeClient` so it's also callable outside React.
 */
export function useArweaveWallet() {
  const [state, setState] = useState<UseArweaveWalletState>({
    installed: false,
    connected: false,
    address: null,
    balance: null,
    loading: false,
    error: null,
  });

  // Detect the extension on mount and when it loads asynchronously.
  useEffect(() => {
    const update = () =>
      setState((s) => ({ ...s, installed: isArweaveWalletAvailable() }));
    update();
    window.addEventListener("arweaveWalletLoaded", update);
    return () => window.removeEventListener("arweaveWalletLoaded", update);
  }, []);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const address = await ensureArweaveWalletConnected();
      setState((s) => ({
        ...s,
        loading: false,
        connected: true,
        address,
        installed: true,
      }));
      return address;
    } catch (e) {
      const message =
        e instanceof ArweaveWalletMissingError
          ? e.message
          : (e as Error).message || "Failed to connect Arweave wallet.";
      setState((s) => ({ ...s, loading: false, error: message }));
      throw e;
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await disconnectArweaveWallet();
    } finally {
      setState((s) => ({
        ...s,
        connected: false,
        address: null,
        balance: null,
      }));
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!state.address) return null;
    try {
      const balance = await getArBalance(state.address);
      setState((s) => ({ ...s, balance }));
      return balance;
    } catch (e) {
      setState((s) => ({
        ...s,
        error: (e as Error).message || "Failed to fetch AR balance.",
      }));
      return null;
    }
  }, [state.address]);

  /**
   * Check whether the user can afford to upload `bytes` of data right now.
   * Returns `{ ok: true }` or `{ ok: false, priceAr, balanceAr }`.
   */
  const canAffordUpload = useCallback(
    async (
      bytes: number
    ): Promise<
      | { ok: true; priceAr: number; balanceAr: number }
      | { ok: false; priceAr: number; balanceAr: number }
    > => {
      const [priceAr, balanceAr] = await Promise.all([
        getUploadPriceAr(bytes),
        state.address ? getArBalance(state.address) : Promise.resolve(0),
      ]);
      return { ok: balanceAr >= priceAr, priceAr, balanceAr } as const;
    },
    [state.address]
  );

  return {
    ...state,
    connect,
    disconnect,
    refreshBalance,
    canAffordUpload,
  };
}

export default useArweaveWallet;
