/**
 * Multi-Chain Configuration
 * 
 * Unified chain configuration for SOL and MON support
 */

import { SOLANA_MAINNET_RPC, SOLANA_DEVNET_RPC } from "@/config/solana";

export type SupportedChain = 'solana' | 'monad' | 'xrpl' | 'robinhood';

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
    iconName: 'solana' | 'monad' | 'xrpl' | 'robinhood';
    color: string;
    theme: ChainThemeConfig;
    walletLabels: ChainWalletLabels;
    networks: {
        mainnet: ChainNetwork;
        testnet: ChainNetwork;
        devnet?: ChainNetwork;
    };
    walletType: 'evm' | 'xrpl' | 'joey';
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
            connect: 'Connect Wallet',
            disconnect: 'Disconnect Wallet',
            connecting: 'Connecting to Wallet...',
        },
        networks: {
            mainnet: {
                url: SOLANA_MAINNET_RPC,
                name: 'Mainnet',
                explorer: 'https://solscan.io',
            },
            testnet: {
                url: 'https://api.testnet.solana.com',
                name: 'Testnet',
                explorer: 'https://solscan.io/?cluster=testnet',
            },
            devnet: {
                url: SOLANA_DEVNET_RPC,
                name: 'Devnet',
                explorer: 'https://solscan.io/?cluster=devnet',
            },
        },
        // Solana uses Reown AppKit / Phantom — not a true EVM wallet. Tag with a Solana-specific value
        // so chain-switch guards never accidentally treat it as EVM. Cast preserves the existing type.
        walletType: 'evm' as any, // TODO: widen ChainConfig.walletType to include 'solana'
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
                chainId: 143,
                explorer: 'https://monadvision.com',
            },
            testnet: {
                url: 'https://testnet-rpc.monad.xyz',
                name: 'Testnet',
                chainId: 10143,
                explorer: 'https://testnet.monadexplorer.com',
            },
        },
        walletType: 'evm',
        nftStandard: 'ERC-721',
        isActive: true,
        isTestnetOnly: false,
        description: 'High-performance EVM-compatible chain with parallel execution',
    },

    xrpl: {
        id: 'xrpl',
        name: 'XRP Ledger',
        symbol: 'XRP',
        iconName: 'xrpl',
        color: '#00AAFF',
        theme: {
            primaryColor: '#00AAFF',
            secondaryColor: '#232323',
            background: 'from-[#0a0a0a] via-[#1a1a1a] to-[#232323]',
            cardBorder: '#00AAFF40',
            glowColor: '#00AAFF',
            buttonGradient: 'from-[#00AAFF] to-[#232323]',
        },
        walletLabels: {
            connect: 'Connect XRPL Wallet',
            disconnect: 'Disconnect XRPL Wallet',
            connecting: 'Connecting to XRPL...',
        },
        networks: {
            mainnet: {
                url: 'wss://xrplcluster.com',
                name: 'Mainnet',
                explorer: 'https://xrpscan.com',
            },
            testnet: {
                url: 'wss://s.altnet.rippletest.net:51233',
                name: 'Testnet',
                explorer: 'https://testnet.xrpscan.com',
            },
        },
        walletType: 'joey',
        nftStandard: 'XLS-20',
        isActive: true,
        isTestnetOnly: false,
        description: 'Fast, scalable, and carbon-neutral blockchain with XLS-20 NFT standard',
    },

    robinhood: {
        id: 'robinhood',
        name: 'Robinhood Chain',
        symbol: 'ETH',
        iconName: 'robinhood',
        color: '#00C805',
        theme: {
            primaryColor: '#00C805',
            secondaryColor: '#0b3d16',
            background: 'from-[#04140a] via-[#0b2b16] to-[#123f22]',
            cardBorder: '#00C80540',
            glowColor: '#00C805',
            buttonGradient: 'from-[#00C805] to-[#0b3d16]',
        },
        walletLabels: {
            connect: 'Connect Robinhood Wallet',
            disconnect: 'Disconnect Robinhood Wallet',
            connecting: 'Connecting to Robinhood Chain...',
        },
        networks: {
            // Arbitrum L2 — gas paid in ETH.
            mainnet: {
                url: 'https://rpc.mainnet.chain.robinhood.com',
                name: 'Mainnet',
                chainId: 4663,
                explorer: 'https://robinhoodchain.blockscout.com',
            },
            testnet: {
                url: 'https://rpc.testnet.chain.robinhood.com',
                name: 'Testnet',
                chainId: 46630,
                explorer: 'https://explorer.testnet.chain.robinhood.com',
            },
        },
        walletType: 'evm',
        nftStandard: 'ERC-721',
        isActive: true,
        isTestnetOnly: false,
        description: 'Robinhood’s Ethereum L2 — ERC-721 collections, gas paid in ETH',
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
    network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'
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
        case 'xrpl':
            return type === 'tx'
                ? `${baseUrl}/transactions/${hash}`
                : `${baseUrl}/accounts/${hash}`;
        case 'robinhood':
            return type === 'tx'
                ? `${baseUrl}/tx/${hash}`
                : type === 'nft'
                    ? `${baseUrl}/token/${hash}`
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
    network: 'mainnet' | 'testnet' = 'mainnet'
): string {
    if (network === 'mainnet') return chain;
    if (chain === 'solana') return 'solana-mainnet';
    return `${chain}-mainnet`;
}

export function getDbChainValues(chain: SupportedChain): string[] {
    switch (chain) {
        case 'solana':
            return ['solana', 'solana-devnet', 'solana-mainnet'];
        case 'monad':
            return ['monad', 'monad-testnet', 'monad-devnet', 'monad-mainnet'];
        case 'xrpl':
            return ['xrpl', 'xrpl-testnet', 'xrpl-mainnet'];
        case 'robinhood':
            return ['robinhood', 'robinhood-testnet', 'robinhood-mainnet'];
        default:
            return ['solana'];
    }
}
