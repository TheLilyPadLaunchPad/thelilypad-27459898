import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

type SupportedSymbol = "SOL" | "ETH" | "MON";

interface PriceData {
    /** USD price */
    usd: number;
    /** Timestamp of the fetch */
    fetchedAt: number;
}

interface UseCryptoPriceReturn {
    /** USD price of the token, or null while loading */
    price: number | null;
    /** Whether the price is currently being fetched */
    isLoading: boolean;
    /** Any error message */
    error: string | null;
    /** Convert a token amount to its USD equivalent */
    toUSD: (amount: number | string) => string;
    /** Manually refresh the price */
    refresh: () => void;
}

// ── Cache ────────────────────────────────────────────────────────────────────

/** In-memory cache so multiple components sharing the same symbol don't re-fetch */
const priceCache = new Map<string, PriceData>();

/** Cache lifetime: 60 seconds */
const CACHE_TTL = 60_000;

// ── CoinGecko ID mapping ────────────────────────────────────────────────────

const COINGECKO_IDS: Record<SupportedSymbol, string> = {
    SOL: "solana",
    ETH: "ethereum",
    MON: "monad",       // Placeholder — update when CoinGecko lists Monad
};

// ── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchPrice(symbol: SupportedSymbol): Promise<number> {
    // Check cache first
    const cached = priceCache.get(symbol);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
        return cached.usd;
    }

    // Try CoinGecko (free, no API key needed)
    try {
        const id = COINGECKO_IDS[symbol];
        const res = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
            { signal: AbortSignal.timeout(5000) },
        );
        if (res.ok) {
            const data = await res.json();
            const price = data[id]?.usd;
            if (typeof price === "number") {
                priceCache.set(symbol, { usd: price, fetchedAt: Date.now() });
                return price;
            }
        }
    } catch {
        // Fall through to Binance fallback
    }

    // Fallback: Binance ticker
    try {
        const pair = symbol === "MON" ? null : `${symbol}USDT`;
        if (pair) {
            const res = await fetch(
                `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`,
                { signal: AbortSignal.timeout(5000) },
            );
            if (res.ok) {
                const data = await res.json();
                const price = parseFloat(data.price);
                if (!isNaN(price)) {
                    priceCache.set(symbol, { usd: price, fetchedAt: Date.now() });
                    return price;
                }
            }
        }
    } catch {
        // Both APIs failed
    }

    throw new Error(`Failed to fetch ${symbol} price`);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useCryptoPrice — live USD price for a cryptocurrency.
 *
 * Fetches from CoinGecko (primary) or Binance (fallback).
 * Results are cached in-memory for 60 s so multiple consumers
 * don't trigger redundant requests.
 *
 * @example
 *   const { price, toUSD } = useCryptoPrice("SOL");
 *   <span>{toUSD(balance)}</span>  // "$12.34"
 */
export function useCryptoPrice(symbol: SupportedSymbol): UseCryptoPriceReturn {
    const [price, setPrice] = useState<number | null>(() => {
        const cached = priceCache.get(symbol);
        return cached && Date.now() - cached.fetchedAt < CACHE_TTL ? cached.usd : null;
    });
    const [isLoading, setIsLoading] = useState(price === null);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const p = await fetchPrice(symbol);
            if (mountedRef.current) {
                setPrice(p);
            }
        } catch (err: any) {
            if (mountedRef.current) {
                setError(err.message || "Price fetch failed");
            }
        } finally {
            if (mountedRef.current) {
                setIsLoading(false);
            }
        }
    }, [symbol]);

    useEffect(() => {
        mountedRef.current = true;
        load();

        // Auto-refresh every 60 s
        const interval = setInterval(load, CACHE_TTL);
        return () => {
            mountedRef.current = false;
            clearInterval(interval);
        };
    }, [load]);

    const toUSD = useCallback(
        (amount: number | string): string => {
            if (price === null) return "—";
            const num = typeof amount === "string" ? parseFloat(amount) : amount;
            if (isNaN(num)) return "—";
            const usd = num * price;
            return usd < 0.01
                ? `<$0.01`
                : `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        },
        [price],
    );

    return { price, isLoading, error, toUSD, refresh: load };
}
