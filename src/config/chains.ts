/**
 * Multi-Chain Configuration
 * 
 * Unified chain configuration for SOL and MON support
 */

import { SOLANA_MAINNET_RPC, SOLANA_DEVNET_RPC } from "@/config/solana";

export type SupportedChain = 'solana' | 'monad';

export interface ChainNetwork {
    url: string;
    name: string;
    chainId?: number;
    explorer: string;
}

export interface ChainThemeConfig {
    primaryColor: string;
    secondaryColor: string;
    background: string;
    cardBorder: string;
    glowColor: string;
    buttonGradient: string;
}

export interface ChainWalletLabels {
    connect: string;
    disconnect: string;
    connecting: string;
}

export interface ChainConfig {
    id: SupportedChain;
    name: string;
    symbol: string;
    iconName: 'solana' | 'monad';
    color: string;
    theme: ChainThemeConfig;
    walletLabels: ChainWalletLabels;
    networks: {
        mainnet: ChainNetwork;
        testnet: ChainNetwork;
        devnet?: ChainNetwork;
    };
    walletType: 'phantom' | 'evm';
    nftStandard: string;
    isActive: boolean;
    isTestnetOnly: boolean;
    description: string;
}

export const CHAINS: Record<SupportedChain, ChainConfig> = {
    solana: {
        id: 'solana',
        name: 'Solana',
        symbol: 'SOL',
        iconName: 'solana',
        color: '#9945FF',
        theme: {
            primaryColor: '#14F195',
            secondaryColor: '#9945FF',
            background: 'from-[#0f2027] via-[#203a43] to-[#2c5364]',
            cardBorder: '#14F19540',
            glowColor: '#14F195',
            buttonGradient: 'from-[#14F195] to-[#9945FF]',
        },
        walletLabels: {
            connect: 'Connect Phantom',
            disconnect: 'Disconnect Phantom',
            connecting: 'Connecting to Phantom...',
        },
        networks: {
            mainnet: {
                url: 'https://api.mainnet-beta.solana.com',
                name: 'Mainnet',
                explorer: 'https://solscan.io',
            },
            testnet: {
                url: 'https://api.testnet.solana.com',
                name: 'Testnet',
                explorer: 'https://solscan.io/?cluster=testnet',
            },
            devnet: {
                url: 'https://api.devnet.solana.com',
                name: 'Devnet',
                explorer: 'https://solscan.io/?cluster=devnet',
            },
        },
        walletType: 'phantom',
        nftStandard: 'Metaplex Core',
        isActive: true,
        isTestnetOnly: false,
        description: 'Fast, low-cost NFTs with Metaplex Core and Candy Machine support',
    },

    monad: {
        id: 'monad',
        name: 'Monad',
        symbol: 'MON',
        iconName: 'monad',
        color: '#836EF9',
        theme: {
            primaryColor: '#A855F7',
            secondaryColor: '#F59E0B',
            background: 'from-[#1e1b4b] via-[#312e81] to-[#4c1d95]',
            cardBorder: '#A855F740',
            glowColor: '#A855F7',
            buttonGradient: 'from-[#A855F7] to-[#F59E0B]',
        },
        walletLabels: {
            connect: 'Connect Wallet',
            disconnect: 'Disconnect Wallet',
            connecting: 'Connecting to Monad...',
        },
        networks: {
            mainnet: {
                url: 'https://rpc.monad.xyz',
                name: 'Mainnet',
                chainId: 41455,
                explorer: 'https://explorer.monad.xyz',
            },
            testnet: {
                url: 'https://testnet.monad.xyz/v1',
                name: 'Testnet',
                chainId: 41454,
                explorer: 'https://testnet.explorer.monad.xyz',
            },
        },
        walletType: 'evm',
        nftStandard: 'ERC-721',
        isActive: true,
        isTestnetOnly: true,
        description: 'High-performance EVM-compatible chain with parallel execution',
    },
};

export function getActiveChains(): ChainConfig[] {
    return Object.values(CHAINS).filter(chain => chain.isActive);
}

export function getChainConfig(chainId: SupportedChain): ChainConfig {
    return CHAINS[chainId];
}

export function getChainDisplayName(chainId: SupportedChain, network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'): string {
    const chain = CHAINS[chainId];
    const networkConfig = chain.networks[network] || chain.networks.testnet;
    return `${chain.name} ${networkConfig.name}`;
}

export function getExplorerUrl(
    chainId: SupportedChain,
    hash: string,
    type: 'tx' | 'address' | 'nft' = 'tx',
    network: 'mainnet' | 'testnet' | 'devnet' = 'testnet'
): string {
    const chain = CHAINS[chainId];
    const networkConfig = chain.networks[network] || chain.networks.testnet;
    const baseUrl = networkConfig.explorer;

    switch (chainId) {
        case 'solana':
            return type === 'tx'
                ? `${baseUrl}/tx/${hash}`
                : `${baseUrl}/account/${hash}`;
        case 'monad':
            return type === 'tx'
                ? `${baseUrl}/tx/${hash}`
                : `${baseUrl}/address/${hash}`;
        default:
            return baseUrl;
    }
}

export const DEFAULT_CHAIN: SupportedChain = 'solana';
export const CHAIN_STORAGE_KEY = 'launchpad-selected-chain';

export function getStoredChain(): SupportedChain {
    if (typeof window === 'undefined') return DEFAULT_CHAIN;
    const stored = localStorage.getItem(CHAIN_STORAGE_KEY);
    if (stored && stored in CHAINS) {
        return stored as SupportedChain;
    }
    return DEFAULT_CHAIN;
}

export function setStoredChain(chain: SupportedChain): void {
    if (typeof window !== 'undefined') {
        localStorage.setItem(CHAIN_STORAGE_KEY, chain);
    }
}

export function getDbChainValue(
    chain: SupportedChain,
    network: 'mainnet' | 'testnet' = 'testnet'
): string {
    if (network === 'mainnet') return chain;
    if (chain === 'solana') return 'solana-devnet';
    return `${chain}-testnet`;
}

export function getDbChainValues(chain: SupportedChain): string[] {
    switch (chain) {
        case 'solana':
            return ['solana', 'solana-devnet', 'solana-mainnet'];
        case 'monad':
            return ['monad', 'monad-testnet', 'monad-devnet', 'monad-mainnet'];
        default:
            return ['solana'];
    }
}
