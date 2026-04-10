import { HELIUS_DEVNET_URL, HELIUS_ADDRESS_HISTORY_URL } from "@/config/solana";

/**
 * Helius Enhanced API Types
 */

export interface HeliusTokenTransfer {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
    mint: string;
}

export interface HeliusNftEvent {
    description: string;
    type: string;
    source: string;
    amount: number;
    fee: number;
    signature: string;
    timestamp: number;
    nfts: {
        mint: string;
        tokenStandard: string;
    }[];
}

export interface HeliusParsedTransaction {
    description: string;
    type: string;
    source: string;
    fee: number;
    signature: string;
    timestamp: number;
    nativeTransfers?: {
        fromUserAccount: string;
        toUserAccount: string;
        amount: number;
    }[];
    tokenTransfers?: HeliusTokenTransfer[];
    events?: {
        nft?: HeliusNftEvent;
    };
}

/**
 * Helius Solana Utility
 */

/**
 * Fetch human-readable transaction history for an address
 */
export async function getAddressTransactions(address: string): Promise<HeliusParsedTransaction[]> {
    try {
        const response = await fetch(HELIUS_ADDRESS_HISTORY_URL(address));
        if (!response.ok) {
            throw new Error(`Helius API Error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch Helius address history:", error);
        return [];
    }
}

/**
 * Parse specific transaction signatures
 */
export async function parseTransactions(signatures: string[]): Promise<HeliusParsedTransaction[]> {
    if (signatures.length === 0) return [];
    
    try {
        const response = await fetch(HELIUS_DEVNET_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                transactions: signatures,
            }),
        });

        if (!response.ok) {
            throw new Error(`Helius API Error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Failed to parse transactions via Helius:", error);
        return [];
    }
}
