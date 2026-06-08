import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { NetworkType, getSolanaRpcUrl } from "@/config/solana";
import { toast } from "sonner";
import { Connection, PublicKey } from "@solana/web3.js";
import { useChain } from "./ChainProvider";
import { setStoredChain } from "@/config/chains";
import { supabase } from "@/integrations/supabase/client";

// Reown AppKit Imports
import { createAppKit, useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider, useDisconnect } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana, solanaTestnet, solanaDevnet } from '@reown/appkit/networks';
import type { Provider } from '@reown/appkit-adapter-solana/react';

// Setup Reown AppKit Outside of React
const solanaWeb3JsAdapter = new SolanaAdapter();
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined;

if (!projectId) {
  console.warn(
    "[Reown] VITE_REOWN_PROJECT_ID is not set. The wallet modal is using a shared demo projectId — " +
    "create your own at https://cloud.reown.com and set VITE_REOWN_PROJECT_ID before going live."
  );
}

const metadata = {
  name: 'The Lily Pad',
  description: 'The Lily Pad — multi-chain NFT launchpad, marketplace, and streaming platform.',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://thelilypad.lovable.app',
  icons: ['https://thelilypad.lovable.app/icon-512.png'],
};

createAppKit({
  adapters: [solanaWeb3JsAdapter],
  networks: [solana, solanaTestnet, solanaDevnet],
  metadata,
  projectId: projectId || 'b56e18d47c72ab683b10814fe9495694',
  features: {
    analytics: true,
    email: true,
    socials: ['google', 'x', 'discord', 'apple']
  }
});

// Types
export type WalletType = "phantom" | "solana" | "reown";
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

const formatSolanaBalance = (lamports: number): string => {
  return (lamports / 1_000_000_000).toFixed(4);
};

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { chain } = useChain();
  
  // Reown Hooks
  const { address: reownAddress, isConnected: isReownConnected, status: reownStatus } = useAppKitAccount();
  const { walletProvider: reownProvider } = useAppKitProvider<Provider>('solana');
  const { caipNetwork, switchNetwork: reownSwitchNetwork } = useAppKitNetwork();
  const { open } = useAppKit();
  const { disconnect: reownDisconnect } = useDisconnect();

  const [state, setState] = useState<WalletState>(() => {
    return {
      address: null,
      isConnected: false,
      isConnecting: false,
      isTransactionPending: false,
      balance: null,
      network: ((localStorage.getItem("solanaNetwork") === "testnet" ? "devnet" : localStorage.getItem("solanaNetwork")) as NetworkType) || "mainnet",
      walletType: "reown",
      chainType: "solana",
    };
  });

  const connection = useMemo(() => {
    // We map Reown's network state to our custom connection object so existing RPC calls work
    // By default, Reown is multichain, but LilyPad is primarily Solana right now.
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

  // Sync Reown State to our Internal App State
  useEffect(() => {
    const syncReown = async () => {
      if (isReownConnected && reownAddress) {
        const balance = await fetchSolanaBalance(reownAddress);
        setState(prev => ({
          ...prev,
          address: reownAddress,
          isConnected: true,
          balance,
          walletType: "reown",
          isConnecting: false
        }));
        try { localStorage.setItem("walletConnected", "true"); } catch {}
        await ensureSupabaseSession(reownAddress, 'reown');
      } else {
        setState(prev => ({
          ...prev,
          address: null,
          isConnected: false,
          balance: null,
          isConnecting: reownStatus === 'connecting'
        }));
        if (reownStatus !== 'connecting' && reownStatus !== 'reconnecting') {
          try { localStorage.removeItem("walletConnected"); } catch {}
        }
      }
    };
    
    syncReown();
  }, [isReownConnected, reownAddress, reownStatus, fetchSolanaBalance, ensureSupabaseSession]);

  // Main connect function replaces legacy Phantom connect with Reown Modal
  const connect = useCallback(async (_walletType?: WalletType, _chainType?: ChainType) => {
    try {
       await open();
    } catch (error) {
       console.error("Failed to open Reown AppKit:", error);
       toast.error("Failed to open wallet connection modal");
    }
  }, [open]);

  const connectWithOAuth = useCallback(async (_provider: OAuthProvider) => {
    try {
      // Reown handles OAuth natively inside the modal now
      await open();
    } catch (error) {
      console.error("OAuth connection failed:", error);
    }
  }, [open]);

  const disconnect = useCallback(async () => {
    try {
      await reownDisconnect();
    } catch (error) {
      console.error("Disconnect error:", error);
    }
    
    setState(prev => ({
      ...prev,
      address: null,
      isConnected: false,
      isConnecting: false,
      balance: null,
      walletType: null,
      authProvider: undefined,
    }));

    toast.success("Wallet disconnected");
  }, [reownDisconnect]);

  const switchNetwork = useCallback(async (network: NetworkType) => {
    setState(prev => ({ ...prev, network }));
    localStorage.setItem("solanaNetwork", network);
    toast.success(`Switched to ${network}`);
  }, []);

  // Extremely important: This returns the Reown Solana Provider so existing Umi/Metaplex hooks don't break
  const getSolanaProviderCallback = useCallback(() => {
    return reownProvider;
  }, [reownProvider]);

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
        isPhantomAvailable: true, // Legacy flag, always true now via AppKit
        discoveredWallets: [],
        connection,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
