export interface TokenConfig {
    symbol: string;
    name: string;
    mintAddress: string;
    decimals: number;
    iconUrl?: string;
    isPlaceholder?: boolean;
}

export const SUPPORTED_PAYMENT_TOKENS: Record<string, TokenConfig> = {
    SOL: {
        symbol: 'SOL',
        name: 'Solana',
        mintAddress: 'So11111111111111111111111111111111111111112', // Native wrapped SOL
        decimals: 9,
    },
    L3AP: {
        symbol: 'L3AP',
        name: 'The Lily Pad Token',
        // Real L3AP mint on Solana mainnet. Secret key for mint authority
        // is stored in the L3AP_MINT_SECRET_KEY Cloud secret.
        mintAddress: 'L3APdU7dRYSeUzJBAYRh6YayrK1dQzsmTGuABTaWbqG',
        decimals: 6,
    },

    USDC: {
        symbol: 'USDC',
        name: 'USD Coin',
        mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Mainnet USDC
        decimals: 6,
    },
    MON: {
        symbol: 'MON',
        name: 'Monad',
        mintAddress: 'MONxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // Placeholder
        decimals: 6,
        isPlaceholder: true,
    },
    wXRP: {
        symbol: 'wXRP',
        name: 'Wrapped XRP',
        mintAddress: 'wXRPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // Placeholder
        decimals: 6,
        isPlaceholder: true,
    }
};

export const getTokenBySymbol = (symbol: string): TokenConfig | undefined => {
    return SUPPORTED_PAYMENT_TOKENS[symbol];
};

export const getTokenByMint = (mint: string): TokenConfig | undefined => {
    return Object.values(SUPPORTED_PAYMENT_TOKENS).find(t => t.mintAddress === mint);
};
