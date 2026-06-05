import { supabase } from "@/integrations/supabase/client";

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
 * All calls go through the `helius-proxy` edge function so the
 * Helius API key never ships to the browser.
 */

/**
 * Fetch human-readable transaction history for an address
 */
export async function getAddressTransactions(address: string): Promise<HeliusParsedTransaction[]> {
    try {
        const { data, error } = await supabase.functions.invoke("helius-proxy", {
            method: "GET" as any,
            // supabase-js v2 doesn't accept query params for GET; encode via path
            // by using `invoke` with a custom URL through fetch fallback:
        } as any);

        // Fallback: build URL manually if invoke shape changes
        if (error || data == null) {
            const projectUrl = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "");
            const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
            const r = await fetch(
                `${projectUrl}/functions/v1/helius-proxy?action=address-history&address=${encodeURIComponent(address)}`,
                { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
            );
            if (!r.ok) throw new Error(`helius-proxy ${r.status}`);
            return await r.json();
        }
        return data as HeliusParsedTransaction[];
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
        const projectUrl = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "");
        const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const r = await fetch(
            `${projectUrl}/functions/v1/helius-proxy?action=parse-transactions`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: anon,
                    Authorization: `Bearer ${anon}`,
                },
                body: JSON.stringify({ transactions: signatures }),
            },
        );
        if (!r.ok) throw new Error(`helius-proxy ${r.status}`);
        return await r.json();
    } catch (error) {
        console.error("Failed to parse transactions via Helius:", error);
        return [];
    }
}
