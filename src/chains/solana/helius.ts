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
 * All Helius Enhanced API calls go through the `helius-proxy` edge function
 * so the Helius API key never ships to the browser.
 */
const PROJECT_URL = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "");
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const PROXY_URL = `${PROJECT_URL}/functions/v1/helius-proxy`;

// The proxy requires a signed-in user; guests get an empty result.
const proxyHeaders = async (): Promise<Record<string, string> | null> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    return { apikey: ANON_KEY, Authorization: `Bearer ${token}` };
};

export async function getAddressTransactions(address: string): Promise<HeliusParsedTransaction[]> {
    try {
        const headers = await proxyHeaders();
        if (!headers) return [];
        const r = await fetch(
            `${PROXY_URL}?action=address-history&address=${encodeURIComponent(address)}`,
            { headers },
        );
        if (!r.ok) throw new Error(`helius-proxy ${r.status}`);
        return await r.json();
    } catch (error) {
        console.error("Failed to fetch Helius address history:", error);
        return [];
    }
}

export async function parseTransactions(signatures: string[]): Promise<HeliusParsedTransaction[]> {
    if (signatures.length === 0) return [];
    try {
        const headers = await proxyHeaders();
        if (!headers) return [];
        const r = await fetch(`${PROXY_URL}?action=parse-transactions`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ transactions: signatures }),
        });
        if (!r.ok) throw new Error(`helius-proxy ${r.status}`);
        return await r.json();
    } catch (error) {
        console.error("Failed to parse transactions via Helius:", error);
        return [];
    }
}
