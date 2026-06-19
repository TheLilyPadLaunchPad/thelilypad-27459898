import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { NetworkType, getSolanaRpcUrl } from "@/config/solana";
import { toast } from "sonner";
import { Connection, PublicKey } from "@solana/web3.js";
import { useChain } from "./ChainProvider";
import { setStoredChain } from "@/config/chains";
import { supabase } from "@/integrations/supabase/client";
import { signInWithSolana } from "@/auth/supabaseWeb3";
import { connectJoeyWallet, disconnectJoeyWallet, isJoeyWalletConnected } from "@/lib/joeyWalletConnection";
import { connectXRPLWallet, type XRPLWalletProvider } from "@/lib/xrplWalletConnect";

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
export type WalletType = "reown" | "joey";
export type ChainType = "solana" | "monad" | "xrpl";
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
  discoveredWallets: any[];
  connection: Connection;
  connectXRPL: () => Promise<void>;
  connectXRPLNonCustodial: (provider: XRPLWalletProvider, address?: string, network?: 'mainnet' | 'testnet') => Promise<void>;
  connectMonad: () => Promise<void>;
  signXRPLTransaction: (txJson: any, network?: 'mainnet' | 'testnet') => Promise<any>;
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
          chainType: "solana",
          isConnecting: false
        }));
        try { localStorage.setItem("walletConnected", "true"); } catch {}
        await ensureSupabaseSession();
      } else {
        // GUARD: Do NOT wipe state for non-Reown wallets (XRPL: crossmark/gem/cold/generated,
        // Joey, Monad injected). Reown's "disconnected" status is irrelevant to those flows —
        // wiping here would log out XRPL users whenever the Reown modal opens/closes
        // (e.g. user cancels a Phantom prompt) and bounce them back to /auth.
        setState(prev => {
          if (prev.walletType && prev.walletType !== "reown") return prev;
          return {
            ...prev,
            address: null,
            isConnected: false,
            balance: null,
            isConnecting: reownStatus === 'connecting'
          };
        });
        if (reownStatus !== 'connecting' && reownStatus !== 'reconnecting') {
          try {
            // Only clear the persisted flag if no non-Reown wallet is currently active.
            // (setState above already preserved non-Reown state.)
          } catch {}
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

  // XRPL Connection using Joey Wallet
  const connectXRPL = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isConnecting: true }));
      toast.loading('Connecting to Joey Wallet...', { id: 'xrpl-connect' });

      const result = await connectJoeyWallet();
      
      setState(prev => ({
        ...prev,
        address: result.address,
        isConnected: true,
        isConnecting: false,
        walletType: 'joey',
        chainType: 'xrpl',
      }));

      toast.success('Connected to Joey Wallet', { id: 'xrpl-connect' });
    } catch (error: any) {
      console.error('XRPL connection failed:', error);
      setState(prev => ({ ...prev, isConnecting: false }));
      toast.error(error.message || 'Failed to connect to Joey Wallet', { id: 'xrpl-connect' });
      throw error;
    }
  }, []);
  // Non-custodial XRPL wallets (Crossmark, GemWallet, Cold Storage) — user controls keys.
  const connectXRPLNonCustodial = useCallback(async (provider: XRPLWalletProvider, address?: string, network?: 'mainnet' | 'testnet') => {
    const label = provider === 'crossmark' ? 'Crossmark' : provider === 'gem' ? 'GemWallet' : provider === 'generated' ? 'New XRPL Wallet' : 'Cold Storage';
    try {
      setState(prev => ({ ...prev, isConnecting: true }));
      toast.loading(`Connecting to ${label}...`, { id: 'xrpl-nc' });

      const result = await connectXRPLWallet(provider, address, network);

      // Ensure a Supabase session exists so profile creation passes RLS
      // (auth.uid() must be non-null for `user_profiles` inserts).
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { error } = await supabase.auth.signInAnonymously();
          if (error) console.warn('[XRPL] anon session failed:', error.message);
        }
      } catch (e) {
        console.warn('[XRPL] supabase session bootstrap failed', e);
      }

      setState(prev => ({
        ...prev,
        address: result.address,
        isConnected: true,
        isConnecting: false,
        walletType: provider as any,
        chainType: 'xrpl',
        network: result.network,
      }));
      try { localStorage.setItem('walletConnected', 'true'); } catch {}
      try { localStorage.setItem('xrplNetwork', result.network); } catch {}

      toast.success(`Connected to ${label}`, { id: 'xrpl-nc' });
    } catch (error: any) {
      console.error(`${label} connection failed:`, error);
      setState(prev => ({ ...prev, isConnecting: false }));
      toast.error(error.message || `Failed to connect to ${label}`, { id: 'xrpl-nc' });
      throw error;
    }
  }, []);


  // Monad EVM connection via injected wallet (MetaMask, Rabby, etc.)
  const connectMonad = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isConnecting: true }));
      const eth = (typeof window !== 'undefined' ? (window as any).ethereum : null);
      if (!eth) {
        toast.error('No EVM wallet detected. Install MetaMask or Rabby.');
        setState(prev => ({ ...prev, isConnecting: false }));
        return;
      }
      toast.loading('Connecting to Monad...', { id: 'monad-connect' });
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      const address = accounts?.[0];
      if (!address) throw new Error('No account returned');

      setState(prev => ({
        ...prev,
        address,
        isConnected: true,
        isConnecting: false,
        walletType: 'reown',
        chainType: 'monad',
      }));
      try { localStorage.setItem('walletConnected', 'true'); } catch {}
      toast.success('Connected to Monad', { id: 'monad-connect' });
    } catch (error: any) {
      console.error('Monad connection failed:', error);
      setState(prev => ({ ...prev, isConnecting: false }));
      toast.error(error?.message || 'Failed to connect to Monad', { id: 'monad-connect' });
      throw error;
    }
  }, []);


  // Main connect function opens Reown AppKit Modal or Joey Wallet
  const connect = useCallback(async (walletType?: WalletType, _chainType?: ChainType) => {
    try {
      if (walletType === "joey") {
        // Connect via Joey Wallet
        await connectXRPL();
      } else {
        // Default to Reown AppKit
        await open();
      }
    } catch (error) {
       console.error("Failed to open wallet connection modal:", error);
       toast.error("Failed to open wallet connection modal");
    }
  }, [open, connectXRPL]);

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
    // Clear any in-memory XRPL generated-wallet signer.
    try {
      const { setActiveSigner } = await import('@/lib/xrplGeneratedWallet');
      setActiveSigner(null);
    } catch {}
    
    // Clear any Supabase session (anonymous sessions used by XRPL etc.)
    try { await supabase.auth.signOut(); } catch {}

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

  // Returns the Reown Solana Provider for Umi/Metaplex hooks
  const getSolanaProviderCallback = useCallback(() => {
    return reownProvider;
  }, [reownProvider]);

  const setTransactionPending = useCallback((pending: boolean) => {
    setState(prev => ({ ...prev, isTransactionPending: pending }));
  }, []);

  const signXRPLTransaction = useCallback(async (txJson: any, network?: 'mainnet' | 'testnet') => {
    try {
      // Resolve XRPL network: explicit arg > stored toggle > current wallet network.
      const stored = (typeof window !== 'undefined' && localStorage.getItem('xrplNetwork')) as 'mainnet' | 'testnet' | null;
      const net: 'mainnet' | 'testnet' = network || stored || (state.network === 'mainnet' ? 'mainnet' : 'testnet');

      // Generated (in-browser) wallet: sign locally with the in-memory Wallet.
      if (state.walletType === ('generated' as any)) {
        const { getActiveSigner } = await import('@/lib/xrplGeneratedWallet');
        const signer = getActiveSigner();
        if (!signer) throw new Error('Generated wallet signer not available. Please unlock the wallet again.');
        const signed = signer.sign(txJson);
        return { tx_blob: signed.tx_blob, hash: signed.hash };
      }

      const chainId = net === 'mainnet' ? 'xrpl:mainnet' : 'xrpl:testnet';
      const result = await (await import('@/lib/joeyWalletConnection')).signTransactionWithJoey(txJson, chainId);
      return result;
    } catch (error) {
      console.error('XRPL transaction signing failed:', error);
      throw error;
    }
  }, [state.network, state.walletType]);

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
        discoveredWallets: [],
        connection,
        connectXRPL,
        connectXRPLNonCustodial,
        connectMonad,
        signXRPLTransaction,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
