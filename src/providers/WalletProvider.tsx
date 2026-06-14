import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { NetworkType, getSolanaRpcUrl } from "@/config/solana";
import { toast } from "sonner";
import { Connection, PublicKey } from "@solana/web3.js";
import { useChain } from "./ChainProvider";
import { setStoredChain } from "@/config/chains";
import { supabase } from "@/integrations/supabase/client";
import { signInWithSolana } from "@/auth/supabaseWeb3";

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
  ensureSupabaseSession: () => Promise<boolean>;
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

  const ensureSupabaseSession = useCallback(async (): Promise<boolean> => {
    try {
      const walletAddress =
        (reownProvider as any)?.publicKey?.toBase58?.() ??
        (reownProvider as any)?.publicKey?.toString?.() ??
        reownAddress;
      if (!walletAddress) return false;

      // Bail if we already have a Supabase session for this wallet.
      const { data: { session } } = await supabase.auth.getSession();
      const existingAddr =
        (session?.user?.user_metadata as any)?.address ??
        (session?.user?.user_metadata as any)?.wallet_address;
      if (session && existingAddr === walletAddress) return true;

      // Need the Reown Solana provider to sign the SIWS message.
      if (!reownProvider || !(reownProvider as any).publicKey) {
        console.warn('[Auth] Reown Solana provider not ready yet — will retry on next sync.');
        return false;
      }

      const result: any = await signInWithSolana(reownProvider as any);
      if (result?.ok) {
        console.log('[Auth] Supabase Web3 session established for', result.address);
        return true;
      }
      console.error('[Auth] Solana SIWS failed:', result?.error);
      toast.error('Wallet sign-in failed. Please try again.');
      return false;
    } catch (err) {
      console.error('Error ensuring Supabase session:', err);
      return false;
    }
  }, [reownProvider, reownAddress]);

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
        await ensureSupabaseSession();
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

  // Sync Reown's selected network (mainnet / devnet / testnet) into our internal state
  useEffect(() => {
    if (!caipNetwork) return;
    const id = String((caipNetwork as any).id ?? '').toLowerCase();
    const name = String((caipNetwork as any).name ?? '').toLowerCase();
    let next: NetworkType | null = null;
    if (id.includes('devnet') || name.includes('devnet')) next = 'devnet';
    else if (id.includes('testnet') || name.includes('testnet')) next = 'devnet';
    else if (name === 'solana' || id.includes('mainnet') || id.includes('5eykt4')) next = 'mainnet';
    if (next) {
      const target = next;
      setState(prev => prev.network === target ? prev : { ...prev, network: target });
      try { localStorage.setItem('solanaNetwork', target); } catch {}
    }
  }, [caipNetwork]);

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
    try {
      const target = network === 'mainnet' ? solana : network === 'testnet' ? solanaTestnet : solanaDevnet;
      await reownSwitchNetwork(target);
    } catch (e) {
      console.error('Reown switchNetwork failed:', e);
    }
    setState(prev => ({ ...prev, network }));
    localStorage.setItem("solanaNetwork", network);
    toast.success(`Switched to ${network}`);
  }, [reownSwitchNetwork]);

  // Extremely important: This returns the Reown Solana Provider so existing Umi/Metaplex hooks don't break.
  // On Phantom mobile in-app browsers, Reown's AppKit adapter sometimes doesn't expose a provider
  // even though the wallet is connected (address visible in header). Fall back to the directly
  // injected window.phantom.solana / window.solana provider so signing flows (batch mint,
  // candy machine mint, transfers) keep working on mobile.
  const getSolanaProviderCallback = useCallback(() => {
    if (reownProvider && (reownProvider as any).publicKey) return reownProvider;
    const injected = (window as any).phantom?.solana || (window as any).solana;
    if (injected?.publicKey && typeof injected.signTransaction === 'function') {
      return injected;
    }
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
        ensureSupabaseSession,
        isPhantomAvailable: true, // Legacy flag, always true now via AppKit
        discoveredWallets: [],
        connection,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
