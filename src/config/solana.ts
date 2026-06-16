import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplCandyMachine as mplCoreCandyMachinePlugin } from '@metaplex-foundation/mpl-core-candy-machine';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { arweaveUploader } from '@/integrations/arweave/umiArweaveUploader';
// Helius Configuration
// Keys must be supplied via env vars (VITE_HELIUS_API_KEY for devnet,
// VITE_HELIUS_MAINNET_API_KEY for mainnet). No hardcoded fallback — exposing
// a real Helius key in the client bundle allows anyone to drain quota/billing.
export const HELIUS_API_KEY =
    (import.meta.env.VITE_HELIUS_API_KEY as string | undefined) || "";

// Solana RPC endpoints — only include Helius URL when a key is configured.
export const DEVNET_RPC_LIST = [
    ...(HELIUS_API_KEY ? [`https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`] : []),
    "https://api.devnet.solana.com",
];

// Helius Enhanced API — correct host is api.helius.xyz (no devnet subdomain).
const HELIUS_ENHANCED_BASE = "https://api.helius.xyz";
export const HELIUS_DEVNET_URL = HELIUS_API_KEY
    ? `${HELIUS_ENHANCED_BASE}/v0/transactions?api-key=${HELIUS_API_KEY}`
    : "";
export const HELIUS_ADDRESS_HISTORY_URL = (address: string) =>
    HELIUS_API_KEY
        ? `${HELIUS_ENHANCED_BASE}/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}`
        : "";


// Mainnet Helius key — set VITE_HELIUS_MAINNET_API_KEY in .env for premium mainnet RPC.
export const HELIUS_MAINNET_API_KEY = import.meta.env.VITE_HELIUS_MAINNET_API_KEY as string | undefined;
export const HELIUS_MAINNET_URL = HELIUS_MAINNET_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_MAINNET_API_KEY}`
    : "";

export const MAINNET_RPC_LIST: string[] = [
    ...(HELIUS_MAINNET_URL ? [HELIUS_MAINNET_URL] : []),
    "https://api.mainnet-beta.solana.com",
    "https://solana-mainnet.rpc.extrnode.com",
];

export const SOLANA_DEVNET_RPC = DEVNET_RPC_LIST[0];

export const SOLANA_MAINNET_RPC = MAINNET_RPC_LIST[0];

// Metaplex Core Program ID (used for Candy Machine minting)
export const CORE_CANDY_MACHINE_ADDRESS = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";

export type NetworkType = "mainnet" | "devnet" | "testnet";

// Simple health check for Solana RPC
export interface RpcHealthStatus {
    url: string;
    healthy: boolean;
    latency: number | null;
    error?: string;
}

export const checkRpcHealth = async (rpcUrl: string, timeout = 5000): Promise<RpcHealthStatus> => {
    const start = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth", params: [] }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const latency = Date.now() - start;
        if (!response.ok) {
            return { url: rpcUrl, healthy: false, latency, error: `HTTP ${response.status}` };
        }
        const data = await response.json();
        if (data.result === "ok") {
            return { url: rpcUrl, healthy: true, latency };
        }
        return { url: rpcUrl, healthy: false, latency, error: "Unexpected response" };
    } catch (e) {
        return { url: rpcUrl, healthy: false, latency: null, error: (e as Error).message };
    }
};

export const getSolanaRpcUrl = (network: NetworkType): string => {
    const list = getSolanaRpcList(network);
    return list[0];
};

export const getSolanaRpcList = (network: NetworkType): string[] => {
    switch (network) {
        case "mainnet":
            return MAINNET_RPC_LIST;

        case "devnet":
        default:
            return DEVNET_RPC_LIST;
    }
};

// List of RPCs that have failed in the current session
const blacklistedRpcs = new Set<string>();

export const invalidateRpc = (url: string) => {
    console.warn(`[Solana] Blacklisting failing RPC: ${url}`);
    blacklistedRpcs.add(url);
};

export const clearRpcBlacklist = () => {
    blacklistedRpcs.clear();
};

export const getBestRpc = async (network: NetworkType): Promise<string> => {
    const preferred = getPreferredRpcUrl(network);
    if (preferred && !blacklistedRpcs.has(preferred)) {
        const health = await checkRpcHealth(preferred);
        if (health.healthy) return preferred;
    }

    const rpcList = getSolanaRpcList(network).filter(rpc => !blacklistedRpcs.has(rpc));

    // If all RPCs are blacklisted, clear blacklist and start over to avoid total failure
    if (rpcList.length === 0) {
        console.warn(`[Solana] All RPCs blacklisted. Resetting blacklist.`);
        blacklistedRpcs.clear();
        return getSolanaRpcList(network)[0];
    }

    // Check all RPCs in parallel and return the first healthy one with lowest latency
    const healthChecks = await Promise.all(rpcList.map(rpc => checkRpcHealth(rpc)));
    const healthyRpcs = healthChecks
        .filter(h => h.healthy)
        .sort((a, b) => (a.latency || 9999) - (b.latency || 9999));

    if (healthyRpcs.length > 0) {
        return healthyRpcs[0].url;
    }

    // Fallback if none are healthy
    return rpcList[0];
};

// Get preferred RPC from localStorage
export const getPreferredRpcUrl = (network: NetworkType = "devnet"): string | null => {
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(`preferredRpc_${network}`);
        // Auto-migrate: Alchemy endpoints have been removed because the demo keys are
        // unreliable for funding Irys / submitting NFT creation txs. Clear any stale
        // preference so the user falls back to auto-selection (Helius / public RPC).
        if (saved && /alchemy\.com/i.test(saved)) {
            localStorage.removeItem(`preferredRpc_${network}`);
            return null;
        }
        return saved;
    }
    return null;
};

// Get RPC URL based on network type
export const getRpcUrl = (network: NetworkType = "devnet"): string => {
    const preferred = getPreferredRpcUrl(network);
    if (preferred) return preferred;
    return getSolanaRpcUrl(network);
};

/**
 * Initialize Umi with all Metaplex plugins and proper RPC connection
 */
export const initializeUmi = (network: NetworkType) => {
    const rpcUrl = getSolanaRpcUrl(network);
    console.log(`Initializing Umi with Solana ${network}: ${rpcUrl}`);

    const umi = createUmi(rpcUrl)
        .use(mplCore())
        .use(mplCoreCandyMachinePlugin())
        .use(mplToolbox())
        .use(arweaveUploader());

    return umi;
};

/**
 * DAS API helper for fetching NFT assets on Solana
 * Uses the Digital Asset Standard API
 */
export const fetchSolanaAsset = async (
    nftAddress: string,
    network: NetworkType = 'devnet'
): Promise<any> => {
    const rpcUrl = getSolanaRpcUrl(network);

    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAsset',
            params: { id: nftAddress },
        }),
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message || 'Failed to fetch asset');
    }

    return data.result;
};

/**
 * Fetch multiple assets using DAS API
 */
export const fetchSolanaAssets = async (
    nftAddresses: string[],
    network: NetworkType = 'devnet'
): Promise<any[]> => {
    const rpcUrl = getSolanaRpcUrl(network);

    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAssetBatch',
            params: { ids: nftAddresses },
        }),
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message || 'Failed to fetch assets');
    }

    return data.result || [];
};

export type SolanaStandard = 'core';

export type CollectionType = 'generative' | 'one_of_one' | 'editions' | 'music';

export interface StandardFeatures {
    // Collection types supported by this standard
    supportedTypes: CollectionType[];
    // Feature flags
    supportsCompression: boolean;
    supportsMasterEdition: boolean;
    supportsCandyMachine: boolean;
    supportsOnChainMetadata: boolean;
    supportsRoyalties: boolean;
    supportsMusic: boolean;
    supportsBulkMint: boolean;
    supportsAllowlist: boolean;
    supportsReveal: boolean;
    // Cost info
    costPerMint: string;
    costDescription: string;
    // UI guidance
    recommendedFor: string[];
    notRecommendedFor: string[];
    tips: string[];
    // Badge info
    badge: { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' };
}

export interface SolanaStandardConfig {
    id: SolanaStandard;
    name: string;
    description: string;
    icon: 'sparkles' | 'file-text' | 'boxes' | 'gift' | 'layers';
    features: StandardFeatures;
}

export const SOLANA_STANDARDS_CONFIG: Record<SolanaStandard, SolanaStandardConfig> = {
    'core': {
        id: 'core',
        name: 'Metaplex Core',
        description: 'Modern NFT standard with low gas costs. Best for new collections.',
        icon: 'sparkles',
        features: {
            supportedTypes: ['generative', 'one_of_one', 'editions', 'music'],
            supportsCompression: false,
            supportsMasterEdition: false,
            supportsCandyMachine: true,
            supportsOnChainMetadata: false,
            supportsRoyalties: true,
            supportsMusic: true,
            supportsBulkMint: true,
            supportsAllowlist: true,
            supportsReveal: true,
            costPerMint: '~0.005 SOL',
            costDescription: 'Lowest cost for standard NFTs',
            recommendedFor: ['General collections', 'PFP projects', 'Music NFTs', 'Art drops'],
            notRecommendedFor: ['Large 10k+ collections needing ultra-low costs'],
            tips: [
                'Use Core for most new projects - it\'s the modern standard',
                'Perfect for collections of any size',
                'Full Candy Machine integration for fair launches'
            ],
            badge: { label: 'Recommended', variant: 'default' }
        }
    },


};

// Legacy format for backward compatibility
export const SOLANA_STANDARDS: { id: SolanaStandard; name: string; description: string }[] =
    Object.values(SOLANA_STANDARDS_CONFIG).map(config => ({
        id: config.id,
        name: config.name,
        description: config.description
    }));

// Helper: Get features for a standard
export const getStandardFeatures = (standard: SolanaStandard): StandardFeatures => {
    return SOLANA_STANDARDS_CONFIG[standard].features;
};

// Helper: Get supported collection types for a standard
export const getSupportedCollectionTypes = (standard: SolanaStandard): CollectionType[] => {
    return SOLANA_STANDARDS_CONFIG[standard].features.supportedTypes;
};

// Helper: Check if a standard supports a specific collection type
export const standardSupportsType = (standard: SolanaStandard, type: CollectionType): boolean => {
    return SOLANA_STANDARDS_CONFIG[standard].features.supportedTypes.includes(type);
};

// Helper: Get recommended standard for a collection type
export const getRecommendedStandard = (type: CollectionType): SolanaStandard => {
    switch (type) {
        case 'music':
        case 'generative':
        case 'one_of_one':
        case 'editions':
        default:
            return 'core';
    }
};
