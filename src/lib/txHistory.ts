import type { TxState } from "@/hooks/useTxStatus";

export type TxKind = "launch" | "mint" | "marketplace" | "other";

export interface TxRecord {
  id: string;
  label: string;
  kind: TxKind;
  chain?: string;
  state: TxState;
  hash?: string;
  error?: string;
  wallet?: string;
  createdAt: number;
  updatedAt: number;
}

const KEY = "lp_tx_history_v1";
const MAX = 200;
const EVENT = "lp-tx-history";

export const inferKind = (label: string): TxKind => {
  const l = label.toLowerCase();
  if (/launch|deploy|create collection|candy/.test(l)) return "launch";
  if (/mint/.test(l)) return "mint";
  if (/buy|sell|list|bid|offer|purchase|pack|delist/.test(l)) return "marketplace";
  return "other";
};

export const readTxHistory = (): TxRecord[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TxRecord[]) : [];
  } catch {
    return [];
  }
};

const write = (list: TxRecord[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage full / unavailable */
  }
};

export const upsertTx = (rec: Partial<TxRecord> & { id: string }) => {
  const list = readTxHistory();
  const i = list.findIndex((r) => r.id === rec.id);
  const now = Date.now();
  if (i >= 0) list[i] = { ...list[i], ...rec, updatedAt: now };
  else
    list.unshift({
      label: "Transaction",
      kind: "other",
      state: "awaiting_signature",
      createdAt: now,
      ...rec,
      updatedAt: now,
    } as TxRecord);
  write(list);
};

export const clearTxHistory = () => write([]);

export const subscribeTxHistory = (cb: () => void) => {
  const h = (e: Event) => {
    if (e.type === EVENT || (e as StorageEvent).key === KEY) cb();
  };
  window.addEventListener(EVENT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(EVENT, h);
    window.removeEventListener("storage", h);
  };
};

/** Records left "pending" from a closed tab are shown as unknown after 30 min. */
export const isStale = (r: TxRecord) =>
  (r.state === "awaiting_signature" || r.state === "submitted") && Date.now() - r.updatedAt > 30 * 60 * 1000;
