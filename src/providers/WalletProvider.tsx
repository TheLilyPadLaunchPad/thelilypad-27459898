import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { NetworkType, getSolanaRpcUrl } from "@/config/solana";
import { waitForPhantomExtension } from "@/config/phantom";
import { toast } from "sonner";
import { Connection, PublicKey } from "@solana/web3.js";
import { useChain } from "./ChainProvider";
import { setStoredChain } from "@/config/chains";
import { supabase } from "@/integrations/supabase/client";

// Types
export type WalletType = "phantom" | "solana";
export type ChainType = "solana" | "monad";
export type OAuthProvider = "google" | "apple";

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isTransactionPending: boolean;
  balance: string | null;
  network: NetworkType;
  walletType: WalletType | null;
  chainType: ChainType;
  authProvider?: string;
  isNewAccount?: boolean;
}

interface WalletContextType extends WalletState {
  connect: (walletType?: WalletType, chainType?: ChainType) => Promise<void>;
  connectWithOAuth: (provider: OAuthProvider) => Promise<void>;
  disconnect: () => void;
  switchNetwork: (network: NetworkType) => Promise<void>;
  getSolanaProvider: () => any;
  setTransactionPending: (pending: boolean) => void;
  isPhantomAvailable: boolean;
  discoveredWallets: any[];
  connection: Connection;
}

const WalletContext = createContext<WalletContextType | null>(null);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};

// Get Solana provider
const getSolanaProvider = () => {
  if (typeof window !== "undefined") {
    if ("phantom" in window && (window as any).phantom?.solana) {
      return (window as any).phantom.solana;
    }
    if ("solana" in window) {
      return (window as any).solana;
    }
  }
  return null;
};

const formatSolanaBalance = (lamports: number): string => {
  return (lamports / 1_000_000_000).toFixed(4);
};

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { chain } = useChain();

  const [state, setState] = useState<WalletState>(() => {
    const wasConnected = localStorage.getItem("walletConnected") === "true";
    return {
      address: null,
      isConnected: false,
      isConnecting: wasConnected,
      isTransactionPending: false,
      balance: null,
      network: (localStorage.getItem("solanaNetwork") as NetworkType) || "mainnet",
      walletType: (localStorage.getItem("walletType") as WalletType) || "phantom",
      chainType: (localStorage.getItem("chainType") as ChainType) || "solana",
    };
  });

  const [isPhantomAvailable, setIsPhantomAvailable] = useState(false);
  const [discoveredWallets, setDiscoveredWallets] = useState<any[]>([]);

  const connection = useMemo(() => {
    return new Connection(getSolanaRpcUrl(state.network), 'confirmed');
  }, [state.network]);

  const fetchSolanaBalance = useCallback(async (address: string) => {
    try {
      const balance = await connection.getBalance(new PublicKey(address));
      return formatSolanaBalance(balance);
    } catch (error) {
      console.error("Error fetching Solana balance:", error);
      return null;
    }
  }, [connection]);

  const ensureSupabaseSession = useCallback(async (walletAddress: string, walletType: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user?.user_metadata?.wallet_address !== walletAddress) {
        const { error } = await supabase.auth.signInAnonymously({
          options: { data: { wallet_address: walletAddress, wallet_type: walletType } }
        });
        if (error) {
          console.error('Supabase anonymous sign-in failed:', error);
        } else {
          console.log('Established Supabase session for wallet:', walletAddress);
        }
      }
    } catch (err) {
      console.error('Error ensuring Supabase session:', err);
    }
  }, []);

  // Connect Solana via injected provider (Phantom extension)
  const connectSolanaLegacy = useCallback(async () => {
    const provider = getSolanaProvider();
    if (!provider) {
      throw new Error("Solana wallet not found. Please install Phantom.");
    }

    setState(prev => ({ ...prev, isConnecting: true, walletType: "solana", chainType: "solana" }));

    try {
      const connectionPromise = provider.connect();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Phantom connection timed out")), 10000)
      );

      const response = await Promise.race([connectionPromise, timeoutPromise]) as any;
      const address = response.publicKey.toString();
      const balance = await fetchSolanaBalance(address);

      await ensureSupabaseSession(address, 'solana');

      setState(prev => ({
        ...prev,
        address,
        isConnected: true,
        isConnecting: false,
        balance,
        walletType: "phantom",
        chainType: "solana",
        authProvider: "injected",
      }));

      localStorage.setItem("walletConnected", "true");
      localStorage.setItem("walletType", "phantom");
      setStoredChain('solana');

      toast.success("Wallet connected on Solana");
    } catch (error: any) {
      console.error("Solana connect error:", error);

      const message = (error?.message || "").toString();
      const code = error?.code;

      const isUserRejected = code === 4001 || message.toLowerCase().includes("rejected");
      const isInternalRpcError = code === -32603 || message.toLowerCase().includes("internal json-rpc");

      if (isUserRejected) {
        toast.error("Connection rejected");
      } else if (isInternalRpcError) {
        toast.error("Phantom returned an internal error. Please unlock Phantom, then try again.");
      } else {
        toast.error(message || "Failed to connect to Solana");
      }

      setState(prev => ({ ...prev, isConnecting: false }));
      throw error;
    }
  }, [fetchSolanaBalance, ensureSupabaseSession]);

  // Connect Monad wallet via Phantom (EVM address)
  const connectMonad = useCallback(async (silent = false) => {
    setState(prev => ({ ...prev, isConnecting: true, walletType: "phantom", chainType: "monad" }));

    try {
      const phantomEvm = (window as any).phantom?.ethereum;
      if (phantomEvm) {
        let accounts: string[];
        if (silent) {
          accounts = await phantomEvm.request({ method: 'eth_accounts' });
        } else {
          accounts = await phantomEvm.request({ method: 'eth_requestAccounts' });
        }

        const address = accounts[0];
        if (!address) throw new Error('No EVM address returned from Phantom');

        await ensureSupabaseSession(address, 'phantom-evm');

        setState(prev => ({
          ...prev,
          address,
          isConnected: true,
          isConnecting: false,
          balance: '0',
          walletType: "phantom",
          chainType: "monad",
          authProvider: "injected",
        }));

        localStorage.setItem("walletConnected", "true");
        localStorage.setItem("walletType", "phantom");
        localStorage.setItem("chainType", "monad");
        setStoredChain('monad');
        toast.success("Phantom (Monad) wallet connected");
        return;
      }

      throw new Error('Phantom EVM provider not found. Please install Phantom and enable EVM support.');
    } catch (error: any) {
      console.error("Monad connect error:", error);
      setState(prev => ({ ...prev, isConnecting: false }));
      const msg = error?.message || "Failed to connect Phantom for Monad";
      toast.error(msg);
      throw error;
    }
  }, [ensureSupabaseSession]);

  // Main connect function
  const connect = useCallback(async (_walletType?: WalletType, _chainType?: ChainType) => {
    let targetWallet = _walletType;
    let targetChain = _chainType;

    if (!targetWallet && !targetChain) {
      targetChain = (chain.id as ChainType) || "solana";
      targetWallet = 'phantom';
    } else if (targetWallet && !targetChain) {
      targetChain = (chain.id === 'monad' ? 'monad' : 'solana');
    } else if (!targetWallet && targetChain) {
      targetWallet = 'phantom';
    }

    console.log(`Connecting to ${targetChain} using ${targetWallet} wallet`);

    if (targetChain === 'monad') {
      await connectMonad();
      return;
    }

    // Default: Solana connection via injected provider
    const injected = getSolanaProvider();
    if (injected) {
      try {
        await connectSolanaLegacy();
        return;
      } catch (err: any) {
        if (err?.code === 4001 || err?.message?.toLowerCase().includes("rejected")) return;
        try {
          await injected.disconnect?.();
        } catch { /* noop */ }
      }
    }

    toast.error("Phantom wallet not found. Please install it from phantom.app");
  }, [chain.id, connectSolanaLegacy, connectMonad]);

  const connectWithOAuth = useCallback(async (_provider: OAuthProvider) => {
    toast.info("OAuth login requires the Phantom extension. Please install it from phantom.app");
  }, []);

  // Disconnect
  const disconnect = useCallback(async () => {
    try {
      await getSolanaProvider()?.disconnect();
    } catch { }

    setState(prev => ({
      ...prev,
      address: null,
      isConnected: false,
      isConnecting: false,
      balance: null,
      walletType: null,
      chainType: "solana" as ChainType,
      authProvider: undefined,
    }));

    localStorage.removeItem("walletConnected");
    localStorage.removeItem("walletType");
    localStorage.removeItem("chainType");
    localStorage.removeItem("authProvider");

    toast.success("Wallet disconnected");
  }, []);

  const switchNetwork = useCallback(async (network: NetworkType) => {
    setState(prev => ({ ...prev, network }));
    localStorage.setItem("solanaNetwork", network);
    toast.success(`Switched to ${network}`);
  }, []);

  const getSolanaProviderCallback = useCallback(() => {
    return getSolanaProvider();
  }, []);

  // Initialize and detect wallets
  useEffect(() => {
    const init = async () => {
      const available = await waitForPhantomExtension(3000);
      setIsPhantomAvailable(available);
    };
    init();
  }, []);

  // Auto-connect
  useEffect(() => {
    const wasConnected = localStorage.getItem("walletConnected") === "true";
    if (!wasConnected) return;

    const autoConnect = async () => {
      setState(prev => ({ ...prev, isConnecting: true }));
      try {
        const storedWalletType = localStorage.getItem("walletType");
        const storedChainType = localStorage.getItem("chainType");

        await waitForPhantomExtension(2000);

        // 1. Monad Re-connection
        if (storedChainType === 'monad') {
          const phantomEvm = (window as any).phantom?.ethereum;
          if (phantomEvm) {
            const accounts = await phantomEvm.request({ method: 'eth_accounts' });
            if (accounts?.[0]) {
              await connectMonad(true);
              return;
            }
          }
          throw new Error("No trusted EVM accounts");
        }

        // 2. Solana Re-connection (Phantom)
        if (storedWalletType === "phantom" || storedWalletType === "solana") {
          const provider = getSolanaProvider();
          if (provider) {
            try {
              await provider.connect({ onlyIfTrusted: true });
              await connectSolanaLegacy();
              return;
            } catch (e) {
              console.log("Silent connect failed:", e);
            }
          }
        }
      } catch (e) {
        console.warn("Auto-connect failed:", e);
      } finally {
        setState(prev => ({ ...prev, isConnecting: false }));
      }
    };

    autoConnect();
  }, [connectSolanaLegacy, connectMonad]);

  // Chain-Wallet Compatibility Validation
  useEffect(() => {
    if (!state.isConnected || !state.address) return;

    const isCompatible =
      (chain.id === 'solana' && (state.walletType === 'phantom' || state.walletType === 'solana')) ||
      (chain.id === 'monad' && state.walletType === 'phantom');

    if (!isCompatible) {
      toast.warning(`Wallet may not be compatible with ${chain.name}`, {
        description: `Try using ${chain.walletLabels.connect.replace('Connect ', '')} for ${chain.name}`,
        duration: 5000,
      });
    }
  }, [chain.id, chain.name, chain.walletLabels.connect, state.isConnected, state.walletType, state.address]);

  const setTransactionPending = useCallback((pending: boolean) => {
    setState(prev => ({ ...prev, isTransactionPending: pending }));
  }, []);

  return (
    <WalletContext.Provider
      value={{
        ...state,
        connect,
        connectWithOAuth,
        disconnect,
        switchNetwork,
        getSolanaProvider: getSolanaProviderCallback,
        setTransactionPending,
        isPhantomAvailable,
        discoveredWallets,
        connection,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
