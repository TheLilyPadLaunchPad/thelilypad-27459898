/**
 * useMonadLaunch - Hook for Monad NFT launching
 * 
 * Provides EVM-compatible NFT deployment for Monad chain
 * Uses standard ERC-721 contracts
 */

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createMonadProvider, connectMonadWallet, deployMonadCollection, mintMonadNFT } from '@/chains';
import type { MonadCollectionParams, MonadDeployResult } from '@/chains';
import { MonadNetwork, DEFAULT_MONAD_NETWORK, switchToMonad, getMonadExplorerUrl } from '@/config/monad';
import { debugStep, debugTx, debugError, debugUri } from '@/lib/deployDebug';

/**
 * useMonadLaunch - Thin React adapter for Monad EVM chain operations
 * 
 * This hook provides React state management and delegates all chain logic
 * to the centralized chains/monad/* modules.
 */

export function useMonadLaunch(network: MonadNetwork = DEFAULT_MONAD_NETWORK) {
    const [isConnected, setIsConnected] = useState(false);
    const [address, setAddress] = useState<string | null>(null);
    const [balance, setBalance] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Check wallet connection
    useEffect(() => {
        const checkConnection = async () => {
            if (typeof window === 'undefined' || !window.ethereum) {
                return;
            }

            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts && accounts.length > 0) {
                    setAddress(accounts[0]);
                    setIsConnected(true);
                }
            } catch (err) {
                console.error('Error checking connection:', err);
            }
        };

        checkConnection();

        // Listen for account changes
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts: string[]) => {
                if (accounts.length > 0) {
                    setAddress(accounts[0]);
                    setIsConnected(true);
                } else {
                    setAddress(null);
                    setIsConnected(false);
                }
            });
        }
    }, [network]);

    /**
     * Connect EVM wallet (Phantom EVM or MetaMask)
     */
    const connect = useCallback(async (): Promise<boolean> => {
        try {
            const walletAddress = await connectMonadWallet();

            if (walletAddress) {
                setAddress(walletAddress);
                setIsConnected(true);

                // Try to switch to Monad network
                const switched = await switchToMonad(network);
                if (!switched) {
                    toast.warning('Please switch to Monad network in your wallet');
                }

                toast.success('Wallet connected');
                return true;
            }
            return false;
        } catch (err: any) {
            console.error('Error connecting:', err);
            toast.error(err.message || 'Failed to connect wallet');
            return false;
        }
    }, [network]);

    /**
     * Disconnect wallet
     */
    const disconnect = useCallback(() => {
        setAddress(null);
        setIsConnected(false);
        toast.success('Wallet disconnected');
    }, []);

    /**
     * Create/Deploy an NFT collection on Monad
     */
    const createCollection = useCallback(async (
        params: MonadCollectionParams
    ): Promise<MonadDeployResult> => {
        if (!isConnected || !address) {
            const error = 'Please connect your wallet first';
            toast.error(error);
            return { success: false, error };
        }

        setIsCreating(true);
        setError(null);

        try {
            // Ensure we're on Monad network
            const switched = await switchToMonad(network);
            if (!switched) {
                throw new Error('Please switch to Monad network');
            }

            const result = await deployMonadCollection(params);

            if (!result.success) {
                toast.error('Monad NFT deployment failed', {
                    description: result.error || 'Please check your wallet and try again.',
                });
            }

            return result;
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to create collection';
            setError(errorMessage);
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setIsCreating(false);
        }
    }, [isConnected, address, network]);

    /**
     * Mint NFTs from a deployed collection
     */
    const mintNFT = useCallback(async (
        contractAddress: string,
        quantity: number = 1,
        mintPrice?: string
    ): Promise<MonadDeployResult> => {
        if (!isConnected || !address) {
            const error = 'Please connect your wallet first';
            toast.error(error);
            return { success: false, error };
        }

        setIsCreating(true);
        setError(null);

        try {
            const result = await mintMonadNFT(contractAddress, quantity, mintPrice);

            if (!result.success) {
                toast.error(result.error || 'Monad minting failed');
            }

            return result;
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to mint NFT';
            setError(errorMessage);
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setIsCreating(false);
        }
    }, [isConnected, address]);

    return {
        // Connection
        connect,
        disconnect,
        isConnected,
        address,
        balance,
        network,

        // Collection actions
        createCollection,
        mintNFT,

        // State
        isCreating,
        error,

        // Helpers
        getExplorerUrl: (hash: string, type?: 'tx' | 'address') =>
            getMonadExplorerUrl(hash, type, network),
    };
}

export default useMonadLaunch;
