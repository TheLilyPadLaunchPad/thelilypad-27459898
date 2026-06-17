import { useCallback } from "react";
import { useWallet } from "@/providers/WalletProvider";
import { getSolanaRpcUrl, type NetworkType } from "@/config/solana";

interface SendSOLParams {
  to: string;
  amount: number; // in SOL (not lamports)
}

interface SendSPLParams {
  to: string;
  amount: number;
  mint: string;
  decimals: number;
}

interface TransactionResult {
  signature: string;
  success: boolean;
}

// Base58 alphabet
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Simple base58 validation
function isValidBase58(str: string): boolean {
  for (const char of str) {
    if (!BASE58_ALPHABET.includes(char)) return false;
  }
  return true;
}

export function useSolanaTransactions() {
  const { address, chainType, network, getSolanaProvider } = useWallet();

  const getRpcUrl = useCallback(() => {
    return getSolanaRpcUrl((network as NetworkType) || "mainnet");
  }, [network]);

  // Get recent blockhash for transaction
  const getRecentBlockhash = useCallback(async (): Promise<string> => {
    const response = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getLatestBlockhash",
        params: [{ commitment: "finalized" }],
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.result.value.blockhash;
  }, [getRpcUrl]);

  // Send SOL - Uses Reown wallet provider
  const sendSOL = useCallback(async ({ to, amount }: SendSOLParams): Promise<TransactionResult> => {
    if (chainType !== "solana" || !address) {
      throw new Error("Solana wallet not connected");
    }

    const provider = getSolanaProvider();
    if (!provider) {
      throw new Error("Solana provider not available");
    }

    // Note: For production, use @solana/web3.js to construct and sign transactions
    // This is a placeholder that indicates the wallet should handle the transfer
    throw new Error("Direct SOL transfers require @solana/web3.js transaction construction");
  }, [chainType, address, getSolanaProvider]);

  // Send SPL Token
  const sendSPLToken = useCallback(async ({ to, amount, mint, decimals }: SendSPLParams): Promise<TransactionResult> => {
    if (chainType !== "solana" || !address) {
      throw new Error("Solana wallet not connected");
    }

    const provider = getSolanaProvider();
    if (!provider) {
      throw new Error("Solana provider not available");
    }

    // Note: For production, use @solana/web3.js and @solana/spl-token for transaction construction
    throw new Error("SPL token transfers require @solana/web3.js transaction construction");
  }, [chainType, address, getSolanaProvider]);

  // Check if recipient address is valid Solana address
  const isValidSolanaAddress = useCallback((addr: string): boolean => {
    // Solana addresses are 32-44 characters and base58 encoded
    if (addr.length < 32 || addr.length > 44) return false;
    return isValidBase58(addr);
  }, []);

  // Get transaction status
  const getTransactionStatus = useCallback(async (signature: string) => {
    const response = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[signature]],
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.result?.value?.[0] || null;
  }, [getRpcUrl]);

  // Get SOL balance for an address
  const getSOLBalance = useCallback(async (addr: string): Promise<number> => {
    const response = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [addr],
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return (data.result?.value || 0) / 1_000_000_000;
  }, [getRpcUrl]);

  return {
    sendSOL,
    sendSPLToken,
    isValidSolanaAddress,
    getTransactionStatus,
    getSOLBalance,
    isSupported: chainType === "solana" && !!address,
    network,
    usesDeepLinks: false,
  };
}
