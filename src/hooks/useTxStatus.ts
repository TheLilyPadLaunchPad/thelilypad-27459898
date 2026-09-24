import { useCallback, useState } from "react";
import { upsertTx, inferKind, type TxKind } from "@/lib/txHistory";

export type TxState = "idle" | "awaiting_signature" | "submitted" | "confirmed" | "failed" | "cancelled";

export interface TxStatus {
  state: TxState;
  label?: string;
  hash?: string;
  error?: string;
}

const isUserRejection = (e: any) => {
  const msg = String(e?.message || e || "").toLowerCase();
  return e?.code === 4001 || msg.includes("user rejected") || msg.includes("rejected the request") || msg.includes("cancelled") || msg.includes("canceled") || msg.includes("denied");
};

const friendlyError = (e: any) => {
  const msg = String(e?.shortMessage || e?.message || e || "Transaction failed");
  if (/insufficient/i.test(msg)) return "Not enough funds in your wallet to cover this and the network fee.";
  if (/blockhash|expired/i.test(msg)) return "The network took too long. Please try again.";
  return msg.length > 180 ? msg.slice(0, 180) + "…" : msg;
};

/**
 * Tracks one on-chain action through pending → submitted → confirmed / failed.
 * `run` receives `markSubmitted(hash)` to call once the wallet has signed.
 */
export function useTxStatus() {
  const [status, setStatus] = useState<TxStatus>({ state: "idle" });

  const reset = useCallback(() => setStatus({ state: "idle" }), []);

  const run = useCallback(
    async <T,>(
      label: string,
      fn: (markSubmitted: (hash?: string) => void) => Promise<T>,
      meta?: { chain?: string; kind?: TxKind; wallet?: string },
    ): Promise<T | undefined> => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let lastHash: string | undefined;
      upsertTx({ id, label, kind: meta?.kind || inferKind(label), chain: meta?.chain, wallet: meta?.wallet, state: "awaiting_signature" });
      setStatus({ state: "awaiting_signature", label });
      try {
        const result: any = await fn((hash) => {
          lastHash = hash;
          upsertTx({ id, state: "submitted", hash });
          setStatus({ state: "submitted", label, hash });
        });
        const hash =
          typeof result === "string" ? result : result?.signature || result?.hash || result?.txHash || result?.transactionHash;
        if (result && typeof result === "object" && result.success === false) {
          throw new Error(result.error || "Transaction failed");
        }
        upsertTx({ id, state: "confirmed", hash: hash || lastHash });
        setStatus((s) => ({ state: "confirmed", label, hash: hash || s.hash }));
        return result as T;
      } catch (e: any) {
        if (isUserRejection(e)) {
          upsertTx({ id, state: "cancelled" });
          setStatus({ state: "cancelled", label });
        } else {
          const error = friendlyError(e);
          upsertTx({ id, state: "failed", error, hash: lastHash });
          setStatus((s) => ({ state: "failed", label, hash: s.hash, error }));
        }
        return undefined;
      }
    },
    [],
  );

  return { status, run, reset, isBusy: status.state === "awaiting_signature" || status.state === "submitted" };
}
