// RPC Failover Hook - Solana focused
// Provides Solana RPC health checking and failover across all configured providers

import { useState, useEffect, useCallback } from "react";
import { NetworkType, getSolanaRpcUrl, getSolanaRpcList, getBestRpc, checkRpcHealth, RpcHealthStatus } from "@/config/solana";

interface UseRpcFailoverReturn {
  currentRpc: string;
  isHealthy: boolean;
  isFailingOver: boolean;
  healthStatuses: RpcHealthStatus[];
  failover: () => Promise<string | null>;
  checkHealth: () => Promise<void>;
  resetFailedRpcs: () => void;
}

export const useRpcFailover = (network: NetworkType = "testnet"): UseRpcFailoverReturn => {
  const [currentRpc, setCurrentRpc] = useState(() => getSolanaRpcUrl(network));
  const [isHealthy, setIsHealthy] = useState(true);
  const [isFailingOver, setIsFailingOver] = useState(false);
  const [healthStatuses, setHealthStatuses] = useState<RpcHealthStatus[]>([]);

  const checkHealthAsync = useCallback(async () => {
    try {
      const rpcList = getSolanaRpcList(network);
      const statuses = await Promise.all(rpcList.map(url => checkRpcHealth(url)));
      setHealthStatuses(statuses);
      const healthyStatuses = statuses.filter(s => s.healthy);
      setIsHealthy(healthyStatuses.length > 0);
      if (healthyStatuses.length > 0) {
        const best = healthyStatuses.sort((a, b) => (a.latency ?? 9999) - (b.latency ?? 9999))[0];
        setCurrentRpc(best.url);
      }
    } catch (e) {
      console.error("Health check failed:", e);
      setIsHealthy(false);
    }
  }, [network]);

  useEffect(() => {
    checkHealthAsync();
    const interval = setInterval(checkHealthAsync, 120_000);
    return () => clearInterval(interval);
  }, [checkHealthAsync]);

  const failover = useCallback(async () => {
    setIsFailingOver(true);
    try {
      const best = await getBestRpc(network);
      setCurrentRpc(best);
      setIsHealthy(true);
      return best;
    } catch {
      setIsHealthy(false);
      return null;
    } finally {
      setIsFailingOver(false);
    }
  }, [network]);

  const resetFailedRpcs = useCallback(() => {
    setIsHealthy(true);
    setCurrentRpc(getSolanaRpcUrl(network));
  }, [network]);

  return {
    currentRpc,
    isHealthy,
    isFailingOver,
    healthStatuses,
    failover,
    checkHealth: checkHealthAsync,
    resetFailedRpcs,
  };
};
