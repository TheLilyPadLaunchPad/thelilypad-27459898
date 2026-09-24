import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/providers/WalletProvider";

const CACHE_MS = 5 * 60 * 1000;
const key = (addr: string, contracts: string[]) => `lp_holder:${addr.toLowerCase()}:${contracts.map((c) => c.toLowerCase()).sort().join(",")}`;

export function useMonadHolder(contracts: string[]) {
  const { address } = useWallet() as any;
  const [isHolder, setIsHolder] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEvm = typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address);
  const list = contracts.filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c));

  // Re-read cache whenever the wallet or collection list changes
  useEffect(() => {
    setError(null);
    if (!isEvm || list.length === 0) return setIsHolder(null);
    try {
      const raw = sessionStorage.getItem(key(address, list));
      const cached = raw ? JSON.parse(raw) : null;
      setIsHolder(cached && Date.now() - cached.at < CACHE_MS ? cached.holder : null);
    } catch {
      setIsHolder(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, list.join(",")]);

  const verify = useCallback(async () => {
    if (!isEvm || list.length === 0) return;
    const eth = (window as any).ethereum;
    if (!eth) return setError("No Monad wallet found in this browser.");
    setChecking(true);
    setError(null);
    try {
      const message = `TheLilyPad holder check\nAddress: ${address}\nIssued: ${Date.now()}`;
      const signature = await eth.request({ method: "personal_sign", params: [message, address] });
      const { data, error } = await supabase.functions.invoke("verify-monad-holder", {
        body: { address, contracts: list, message, signature },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setIsHolder(!!data.holder);
      sessionStorage.setItem(key(address, list), JSON.stringify({ holder: !!data.holder, at: Date.now() }));
    } catch (e: any) {
      setError(e?.code === 4001 ? "Signature cancelled." : e?.message || "Couldn't verify ownership.");
    } finally {
      setChecking(false);
    }
  }, [address, isEvm, list]);

  return { isHolder, checking, error, verify, canCheck: isEvm && list.length > 0 };
}
