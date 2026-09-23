import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { NetworkType, getSolanaRpcUrl } from "@/config/solana";
import { toast } from "sonner";
import { Connection, PublicKey } from "@solana/web3.js";
import { useChain } from "./ChainProvider";
import { setStoredChain, CHAINS } from "@/config/chains";
import { connectEvmChain, getEvmBalance } from "@/lib/evmWallets";
import { supabase } from "@/integrations/supabase/client";
import { signInWithSolana } from "@/auth/supabaseWeb3";
import { connectJoeyWallet, disconnectJoeyWallet, isJoeyWalletConnected } from "@/lib/joeyWalletConnection";
import { connectXRPLWallet, type XRPLWalletProvider } from "@/lib/xrplWalletConnect";

// Reown AppKit React hooks. The AppKit singleton is initialised exactly once
// in `src/integrations/reown/appkit.ts` (called from `src/main.tsx`). Do NOT
// call `createAppKit()` here — duplicate inits trigger the "WalletConnect
// Core is already initialized" warning and break pairing.
import { useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider, useDisconnect } from '@reown/appkit/react';
import type { Provider } from '@reown/appkit-adapter-solana/react';
import { solana } from '@reown/appkit/networks';
import "@/integrations/reown/appkit"; // ensures the singleton module is loaded


// Types
export type WalletType = "reown" | "joey" | "evm";
export type ChainType = "solana" | "monad" | "xrpl" | "robinhood";
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
  connectRobinhood: () => Promise<void>;
  /** Chain id the injected EVM wallet currently reports (null for non-EVM). */
  evmChainId: number | null;
  /** True when an EVM wallet is on a different network than the selected chain. */
  isWrongNetwork: boolean;
  switchToExpectedNetwork: () => Promise<void>;
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
      // Mainnet-only platform: devnet/testnet are not selectable.
      network: "mainnet" as NetworkType,
      walletType: "reown",
      chainType: "solana",
    };
  });

  // Injected EVM provider (Monad / Robinhood Chain) for the active session.
  const evmProviderRef = useRef<any>(null);

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
    // Mainnet-only: never adopt a test network from the wallet.
    if (id.includes('devnet') || name.includes('devnet') || id.includes('testnet') || name.includes('testnet')) next = null;
    else next = 'mainnet';
    if (next) {
      const target = next;
      setState(prev => prev.network === target ? prev : { ...prev, network: target });
      try { localStorage.setItem('solanaNetwork', target); } catch {}
    }
  }, [caipNetwork]);

  // WATCHDOG: Reown can stay in 'connecting'/'reconnecting' indefinitely when no
  // wallet responds. Every route gates on isConnecting, so that would freeze the
  // whole app on a loader. Force-clear the flag after a short grace period.
  useEffect(() => {
    if (!state.isConnecting) return;
    const t = setTimeout(() => {
      setState(prev => (prev.isConnecting && !prev.isConnected ? { ...prev, isConnecting: false } : prev));
    }, 2500);
    return () => clearTimeout(t);
  }, [state.isConnecting, state.isConnected]);


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


  // ---- EVM chains (Monad, Robinhood Chain) -------------------------------
  // One shared path: discover the injected wallet, request an account, then
  // switch (or add) the target network before we mark the wallet connected.
  const connectEvm = useCallback(async (chainId: 'monad' | 'robinhood') => {
    const cfg = CHAINS[chainId];
    const net = cfg.networks.mainnet;
    const toastId = `${chainId}-connect`;
    try {
      setState(prev => ({ ...prev, isConnecting: true }));
      toast.loading(`Connecting to ${cfg.name}...`, { id: toastId });

      const result = await connectEvmChain({
        chainId: net.chainId!,
        chainName: `${cfg.name}`,
        rpcUrls: [net.url],
        blockExplorerUrls: net.explorer ? [net.explorer] : undefined,
        nativeCurrency: { name: cfg.symbol, symbol: cfg.symbol, decimals: 18 },
      });

      evmProviderRef.current = result.provider;
      const balance = await getEvmBalance(result.provider, result.address);

      setState(prev => ({
        ...prev,
        address: result.address,
        isConnected: true,
        isConnecting: false,
        balance,
        walletType: 'evm',
        chainType: chainId,
        network: 'mainnet' as NetworkType,
      }));
      try { localStorage.setItem('walletConnected', 'true'); } catch {}
      setStoredChain(chainId);
      toast.success(`Connected to ${cfg.name} with ${result.providerName}`, { id: toastId });
    } catch (error: any) {
      console.error(`${cfg.name} connection failed:`, error);
      setState(prev => ({ ...prev, isConnecting: false }));
      const rejected = error?.code === 4001;
      toast[rejected ? 'info' : 'error'](
        rejected ? 'Connection cancelled' : (error?.message || `Failed to connect to ${cfg.name}`),
        { id: toastId },
      );
      if (!rejected) throw error;
    }
  }, []);

  const connectMonad = useCallback(() => connectEvm('monad'), [connectEvm]);
  const connectRobinhood = useCallback(() => connectEvm('robinhood'), [connectEvm]);

  // ---- Live EVM network detection ----------------------------------------
  // Track the wallet's actual chain so we can block actions on the wrong one.
  const [evmChainId, setEvmChainId] = useState<number | null>(null);
  const expectedEvmChainId =
    state.walletType === 'evm' && (state.chainType === 'monad' || state.chainType === 'robinhood')
      ? CHAINS[state.chainType].networks.mainnet.chainId ?? null
      : null;
  const isWrongNetwork = expectedEvmChainId !== null && evmChainId !== null && evmChainId !== expectedEvmChainId;

  useEffect(() => {
    const provider = evmProviderRef.current;
    if (state.walletType !== 'evm' || !state.isConnected || !provider?.on) {
      setEvmChainId(null);
      return;
    }
    let active = true;
    provider.request({ method: 'eth_chainId' })
      .then((hex: string) => { if (active) setEvmChainId(parseInt(hex, 16)); })
      .catch(() => {});

    const onChain = (hex: string) => {
      const id = parseInt(hex, 16);
      setEvmChainId(id);
      if (expectedEvmChainId !== null && id !== expectedEvmChainId) {
        toast.warning(`Wrong network — switch back to ${CHAINS[state.chainType].name} to continue.`, { id: 'evm-network' });
      } else {
        toast.success(`Back on ${CHAINS[state.chainType].name}`, { id: 'evm-network' });
      }
    };
    const onAccounts = async (accounts: string[]) => {
      const next = accounts?.[0];
      if (!next) {
        evmProviderRef.current = null;
        setState(prev => ({ ...prev, address: null, isConnected: false, balance: null }));
        toast.info('Wallet disconnected');
        return;
      }
      const balance = await getEvmBalance(provider, next);
      setState(prev => ({ ...prev, address: next, balance }));
    };
    provider.on('chainChanged', onChain);
    provider.on('accountsChanged', onAccounts);
    return () => {
      active = false;
      provider.removeListener?.('chainChanged', onChain);
      provider.removeListener?.('accountsChanged', onAccounts);
    };
  }, [state.walletType, state.isConnected, state.chainType, expectedEvmChainId]);

  const switchToExpectedNetwork = useCallback(async () => {
    if (state.chainType === 'monad' || state.chainType === 'robinhood') {
      await connectEvm(state.chainType);
    }
  }, [state.chainType, connectEvm]);


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


  // Mainnet-only platform: switching networks is intentionally a no-op.
  const switchNetwork = useCallback(async (_network: NetworkType) => {
    try {
      await reownSwitchNetwork(solana);
    } catch (e) {
      console.error('Reown switchNetwork failed:', e);
    }
    setState(prev => (prev.network === 'mainnet' ? prev : { ...prev, network: 'mainnet' }));
    localStorage.setItem("solanaNetwork", "mainnet");
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
      const net: 'mainnet' | 'testnet' = 'mainnet';

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
        connectRobinhood,
        evmChainId,
        isWrongNetwork,
        switchToExpectedNetwork,
        signXRPLTransaction,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
