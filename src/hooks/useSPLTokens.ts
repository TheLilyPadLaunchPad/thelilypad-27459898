import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/providers/WalletProvider";
import { getSolanaRpcUrl, type NetworkType } from "@/config/solana";

export interface SPLToken {
  mint: string;
  balance: number;
  decimals: number;
  uiAmount: string;
  symbol?: string;
  name?: string;
  logoURI?: string;
}

interface TokenListItem {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

// Popular token list for symbol/name resolution
const KNOWN_TOKENS: Record<string, { symbol: string; name: string; logoURI?: string }> = {
  "So11111111111111111111111111111111111111112": { symbol: "SOL", name: "Wrapped SOL" },
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC", name: "USD Coin" },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": { symbol: "USDT", name: "Tether USD" },
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": { symbol: "stSOL", name: "Lido Staked SOL" },
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": { symbol: "mSOL", name: "Marinade Staked SOL" },
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": { symbol: "BONK", name: "Bonk" },
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": { symbol: "JUP", name: "Jupiter" },
  "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof": { symbol: "RNDR", name: "Render Token" },
  "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": { symbol: "PYTH", name: "Pyth Network" },
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL": { symbol: "JTO", name: "Jito" },
};

export function useSPLTokens() {
  const { address, chainType, network, isConnected } = useWallet();
  const [tokens, setTokens] = useState<SPLToken[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    if (!address || chainType !== "solana" || !isConnected) {
      setTokens([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const rpcUrl = getSolanaRpcUrl((network as NetworkType) || "mainnet");

      // Fetch token accounts owned by the wallet
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenAccountsByOwner",
          params: [
            address,
            { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
            { encoding: "jsonParsed" },
          ],
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message);
      }

      const tokenAccounts = data.result?.value || [];
      
      const parsedTokens: SPLToken[] = tokenAccounts
        .map((account: any) => {
          const info = account.account.data.parsed.info;
          const mint = info.mint;
          const tokenAmount = info.tokenAmount;
          
          // Skip zero balances
          if (tokenAmount.uiAmount === 0) return null;

          const knownToken = KNOWN_TOKENS[mint];
          
          return {
            mint,
            balance: parseInt(tokenAmount.amount),
            decimals: tokenAmount.decimals,
            uiAmount: tokenAmount.uiAmountString || tokenAmount.uiAmount.toString(),
            symbol: knownToken?.symbol,
            name: knownToken?.name,
            logoURI: knownToken?.logoURI,
          };
        })
        .filter(Boolean) as SPLToken[];

      // Sort by balance (highest first), then by symbol
      parsedTokens.sort((a, b) => {
        if (a.symbol && !b.symbol) return -1;
        if (!a.symbol && b.symbol) return 1;
        return parseFloat(b.uiAmount) - parseFloat(a.uiAmount);
      });

      setTokens(parsedTokens);
    } catch (err) {
      console.error("Error fetching SPL tokens:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch tokens");
      setTokens([]);
    } finally {
      setIsLoading(false);
    }
  }, [address, chainType, network, isConnected]);

  // Fetch tokens when wallet connects or changes
  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // Refresh every 30 seconds if connected
  useEffect(() => {
    if (!isConnected || chainType !== "solana") return;

    const interval = setInterval(fetchTokens, 30000);
    return () => clearInterval(interval);
  }, [isConnected, chainType, fetchTokens]);

  return {
    tokens,
    isLoading,
    error,
    refetch: fetchTokens,
    totalTokens: tokens.length,
  };
}
