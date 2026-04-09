export interface Collection {
    id: string;
    name: string;
    symbol: string;
    description: string | null;
    image_url: string | null;
    banner_url: string | null;
    unrevealed_image_url: string | null;
    is_revealed: boolean;
    scheduled_reveal_at: string | null;
    creator_id: string;
    creator_address: string;
    created_at: string;
    total_supply: number;
    minted: number;
    royalty_percent: number;
    contract_address: string | null;
    status: string;
    social_twitter: string | null;
    social_discord: string | null;
    social_website: string | null;
    social_telegram: string | null;
    collection_type?: string;
    /** @deprecated 'xrpl' kept only for backward-compat with existing DB rows */
    blockchain?: 'solana' | 'xrpl' | 'monad';
    chain?: string;
    solana_standard?: string;
    ipfs_base_cid?: string | null;
    layers_metadata?: any;
    artworks_metadata?: any;
    phases?: any;
}

export interface Phase {
    id: string;
    name: string;
    price: string;
    maxPerWallet: number;
    supply: number;
    minted?: number;
    isActive?: boolean;
    startTime: string | null;
    endTime: string | null;
    requiresAllowlist: boolean;
    candyMachineAddress?: string;
}

export interface AllowlistEntry {
    wallet_address: string;
    max_mints?: number;
}
