/**
 * Monad Chain Configuration
 * 
 * EVM-compatible high-performance blockchain configuration
 */

// Monad network configurations
export const MONAD_NETWORKS = {
    mainnet: {
        url: 'https://rpc.monad.xyz',
        chainId: 41455,
        name: 'Mainnet',
        explorer: 'https://explorer.monad.xyz',
        currency: {
            name: 'MON',
            symbol: 'MON',
            decimals: 18,
        },
    },
    testnet: {
        url: 'https://testnet.monad.xyz/v1',
        chainId: 41454,
        name: 'Testnet',
        explorer: 'https://testnet.explorer.monad.xyz',
        currency: {
            name: 'MON',
            symbol: 'MON',
            decimals: 18,
        },
    },
} as const;

export type MonadNetwork = keyof typeof MONAD_NETWORKS;

// Default network
export const DEFAULT_MONAD_NETWORK: MonadNetwork = 'mainnet';

// Contract addresses (to be deployed)
export const MONAD_CONTRACTS = {
    mainnet: {
        nftFactory: '', // To be deployed
        marketplace: '', // To be deployed
    },
    testnet: {
        nftFactory: '', // To be deployed
        marketplace: '', // To be deployed
    },
};

/**
 * Get Monad RPC URL
 */
export function getMonadRpcUrl(network: MonadNetwork = DEFAULT_MONAD_NETWORK): string {
    return MONAD_NETWORKS[network].url;
}

/**
 * Get Monad chain ID
 */
export function getMonadChainId(network: MonadNetwork = DEFAULT_MONAD_NETWORK): number {
    return MONAD_NETWORKS[network].chainId;
}

/**
 * Get Monad explorer URL
 */
export function getMonadExplorerUrl(
    hash: string,
    type: 'tx' | 'address' | 'token' = 'tx',
    network: MonadNetwork = DEFAULT_MONAD_NETWORK
): string {
    const baseUrl = MONAD_NETWORKS[network].explorer;
    return `${baseUrl}/${type}/${hash}`;
}

/**
 * Get network config for adding to wallet
 */
export function getMonadNetworkConfig(network: MonadNetwork = DEFAULT_MONAD_NETWORK) {
    const config = MONAD_NETWORKS[network];
    return {
        chainId: `0x${config.chainId.toString(16)}`,
        chainName: `Monad ${config.name}`,
        nativeCurrency: config.currency,
        rpcUrls: [config.url],
        blockExplorerUrls: [config.explorer],
    };
}

/**
 * Request to add Monad network to wallet
 */
export async function addMonadToWallet(network: MonadNetwork = DEFAULT_MONAD_NETWORK): Promise<boolean> {
    if (typeof window === 'undefined' || !window.ethereum) {
        console.error('No ethereum provider found');
        return false;
    }

    try {
        await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [getMonadNetworkConfig(network)],
        });
        return true;
    } catch (error: any) {
        console.error('Failed to add Monad network:', error);
        return false;
    }
}

/**
 * Request to switch to Monad network
 */
export async function switchToMonad(network: MonadNetwork = DEFAULT_MONAD_NETWORK): Promise<boolean> {
    if (typeof window === 'undefined' || !window.ethereum) {
        console.error('No ethereum provider found');
        return false;
    }

    try {
        const config = MONAD_NETWORKS[network];
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${config.chainId.toString(16)}` }],
        });
        return true;
    } catch (error: any) {
        // If chain not added, try to add it
        if (error.code === 4902) {
            return addMonadToWallet(network);
        }
        console.error('Failed to switch to Monad:', error);
        return false;
    }
}

// Type for ethereum window
declare global {
    interface Window {
        ethereum?: {
            request: (args: { method: string; params?: any[] }) => Promise<any>;
            on: (event: string, callback: (...args: any[]) => void) => void;
            removeListener: (event: string, callback: (...args: any[]) => void) => void;
            isMetaMask?: boolean;
        };
    }
}
