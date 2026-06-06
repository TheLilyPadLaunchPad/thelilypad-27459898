/**
 * Native Arweave client (no bundler).
 *
 * Replaces `@/integrations/irys/client` for upload + read paths. Every upload
 * is a real Arweave transaction signed by the user's ArConnect / Wander
 * browser extension and paid for in AR tokens by the user. The platform holds
 * no Arweave keys and pays for nothing.
 *
 * ⚠️ Hard differences from the old Irys client:
 *   • No platform pre-funding. `fund()` / `getBalance()` operate on the
 *     user's AR balance, not a bundler node balance.
 *   • No free devnet. Every upload costs real AR.
 *   • Confirmations take 2-20 minutes — callers that need a URI to be
 *     resolvable (e.g. Candy Machine create) MUST call
 *     `waitForConfirmation(txId)` before proceeding.
 *   • Sub-100KB uploads should use `dispatch()` (bundled by the wallet,
 *     near-instant). Larger uploads go through `sign()` + `post()`.
 *   • All EVM/Irys-testnet helpers from the old client are gone.
 *
 * Public surface kept intentionally small so callers depend on stable
 * primitives rather than implementation details.
 */

import Arweave from "arweave";
import type Transaction from "arweave/web/lib/transaction";

// ───────────────────────────── Configuration ─────────────────────────────

export const ARWEAVE_GATEWAY = "https://arweave.net";

const arweave = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
  timeout: 60_000,
});

/** Returns the canonical public gateway URL for a confirmed tx id. */
export function getArweaveUrl(txId: string): string {
  return `${ARWEAVE_GATEWAY}/${txId}`;
}

// ───────────────────────────── Wallet access ─────────────────────────────

export class ArweaveWalletMissingError extends Error {
  constructor() {
    super(
      "Arweave wallet not detected. Install Wander (https://www.wander.app/) " +
        "or ArConnect to upload."
    );
    this.name = "ArweaveWalletMissingError";
  }
}

const REQUIRED_PERMISSIONS = [
  "ACCESS_ADDRESS",
  "ACCESS_PUBLIC_KEY",
  "SIGN_TRANSACTION",
  "DISPATCH",
  "SIGNATURE",
] as const;

function getWallet() {
  if (typeof window === "undefined" || !window.arweaveWallet) {
    throw new ArweaveWalletMissingError();
  }
  return window.arweaveWallet;
}

/** True if the ArConnect/Wander extension is installed in this browser. */
export function isArweaveWalletAvailable(): boolean {
  return typeof window !== "undefined" && !!window.arweaveWallet;
}

/**
 * Request the permissions we need. Safe to call multiple times — ArConnect
 * silently no-ops if all requested permissions are already granted.
 */
export async function ensureArweaveWalletConnected(): Promise<string> {
  const wallet = getWallet();
  const granted = await wallet.getPermissions().catch(() => [] as string[]);
  const missing = REQUIRED_PERMISSIONS.filter((p) => !granted.includes(p));
  if (missing.length > 0) {
    await wallet.connect(REQUIRED_PERMISSIONS as unknown as any, {
      name: "The Lily Pad",
    });
  }
  return wallet.getActiveAddress();
}

/** Disconnect the active wallet session. */
export async function disconnectArweaveWallet(): Promise<void> {
  if (!isArweaveWalletAvailable()) return;
  await window.arweaveWallet!.disconnect();
}

// ────────────────────────────── Balance / price ──────────────────────────

/** User's AR balance, in AR (not winston). */
export async function getArBalance(address?: string): Promise<number> {
  const addr = address ?? (await ensureArweaveWalletConnected());
  const winston = await arweave.wallets.getBalance(addr);
  return Number(arweave.ar.winstonToAr(winston));
}

/**
 * Cost in AR to upload `bytes` of data right now. Equivalent to the price
 * the gateway will charge when the tx is posted.
 */
export async function getUploadPriceAr(bytes: number): Promise<number> {
  const winston = await arweave.transactions.getPrice(bytes);
  return Number(arweave.ar.winstonToAr(winston));
}

// ─────────────────────────────── Uploads ─────────────────────────────────

export interface ArweaveTag {
  name: string;
  value: string;
}

export interface ArweaveUploadResult {
  id: string;
  url: string;
  /** "BUNDLED" via wallet dispatch (instant) or "BASE" L1 (slow). */
  type: "BUNDLED" | "BASE";
  /** Bytes uploaded — useful for cost accounting. */
  bytes: number;
}

/**
 * Size threshold below which we prefer wallet `dispatch` (bundled). The
 * wallet bundler handles the AR payment internally and the tx is near-
 * instantly retrievable. Above this we fall back to a base L1 tx that the
 * caller MUST wait on with `waitForConfirmation`.
 */
const DISPATCH_BYTE_LIMIT = 95 * 1024; // ArConnect caps dispatch at ~100 KiB.

async function buildTransaction(
  data: Uint8Array,
  contentType: string | undefined,
  tags: ArweaveTag[]
): Promise<Transaction> {
  const tx = await arweave.createTransaction({ data });
  if (contentType) tx.addTag("Content-Type", contentType);
  for (const t of tags) tx.addTag(t.name, t.value);
  return tx;
}

/**
 * Upload arbitrary bytes. Uses wallet `dispatch` for small payloads
 * (≤~95 KiB) and a base L1 tx otherwise.
 *
 * For base L1 txs the returned URL will 404 until the network confirms —
 * call `waitForConfirmation(id)` before pointing on-chain references at it.
 */
export async function uploadBytes(
  data: Uint8Array,
  opts: { contentType?: string; tags?: ArweaveTag[] } = {}
): Promise<ArweaveUploadResult> {
  const wallet = getWallet();
  await ensureArweaveWalletConnected();
  const tags = opts.tags ?? [];
  const tx = await buildTransaction(data, opts.contentType, tags);

  if (data.byteLength <= DISPATCH_BYTE_LIMIT) {
    const res = await wallet.dispatch(tx);
    return {
      id: res.id,
      url: getArweaveUrl(res.id),
      type: res.type ?? "BUNDLED",
      bytes: data.byteLength,
    };
  }

  await wallet.sign(tx);
  const uploader = await arweave.transactions.getUploader(tx);
  while (!uploader.isComplete) {
    await uploader.uploadChunk();
  }
  return {
    id: tx.id,
    url: getArweaveUrl(tx.id),
    type: "BASE",
    bytes: data.byteLength,
  };
}

/** Convenience: upload a JS object as application/json. */
export async function uploadJson(
  obj: unknown,
  opts: { tags?: ArweaveTag[] } = {}
): Promise<ArweaveUploadResult> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return uploadBytes(bytes, {
    contentType: "application/json",
    tags: opts.tags,
  });
}

/** Convenience: upload a Blob / File preserving its MIME type. */
export async function uploadBlob(
  blob: Blob,
  opts: { tags?: ArweaveTag[]; filename?: string } = {}
): Promise<ArweaveUploadResult> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const tags = [...(opts.tags ?? [])];
  if (opts.filename) tags.push({ name: "File-Name", value: opts.filename });
  return uploadBytes(buf, {
    contentType: blob.type || "application/octet-stream",
    tags,
  });
}

// ───────────────────────────── Confirmation ──────────────────────────────

export interface ConfirmationStatus {
  confirmed: boolean;
  numberOfConfirmations: number;
  blockHeight?: number;
}

/** One-shot status check. Returns `confirmed: false` for pending / unknown. */
export async function getConfirmationStatus(
  txId: string
): Promise<ConfirmationStatus> {
  try {
    const res = await arweave.transactions.getStatus(txId);
    if (res.status !== 200 || !res.confirmed) {
      return { confirmed: false, numberOfConfirmations: 0 };
    }
    return {
      confirmed: true,
      numberOfConfirmations: res.confirmed.number_of_confirmations,
      blockHeight: res.confirmed.block_height,
    };
  } catch {
    return { confirmed: false, numberOfConfirmations: 0 };
  }
}

export interface WaitForConfirmationOptions {
  /** Confirmations required before we treat the tx as durable. Default 1. */
  minConfirmations?: number;
  /** Total time budget in ms. Default 25 minutes. */
  timeoutMs?: number;
  /** Poll interval in ms. Default 15 seconds. */
  pollIntervalMs?: number;
  /** Called every poll with progress info — useful for UI spinners. */
  onPoll?: (status: ConfirmationStatus, elapsedMs: number) => void;
}

/**
 * Poll the gateway until a tx is confirmed. Throws on timeout. Used by the
 * Candy Machine deploy path before creating the on-chain machine.
 */
export async function waitForConfirmation(
  txId: string,
  options: WaitForConfirmationOptions = {}
): Promise<ConfirmationStatus> {
  const minConfirmations = options.minConfirmations ?? 1;
  const timeoutMs = options.timeoutMs ?? 25 * 60 * 1000;
  const pollIntervalMs = options.pollIntervalMs ?? 15_000;
  const startedAt = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const status = await getConfirmationStatus(txId);
    const elapsed = Date.now() - startedAt;
    options.onPoll?.(status, elapsed);
    if (status.confirmed && status.numberOfConfirmations >= minConfirmations) {
      return status;
    }
    if (elapsed >= timeoutMs) {
      throw new Error(
        `Arweave tx ${txId} not confirmed after ${Math.round(
          elapsed / 1000
        )}s (have ${status.numberOfConfirmations}/${minConfirmations}).`
      );
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

// ────────────────────────────── Downloads ────────────────────────────────

export class ArweaveGatewayError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ArweaveGatewayError";
  }
}

async function fetchFromGateway(txId: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(getArweaveUrl(txId));
  } catch (e) {
    throw new ArweaveGatewayError(
      `Arweave gateway unreachable while fetching ${txId}. Check your internet connection or try again in a moment.`,
      e
    );
  }
  if (res.status === 404) {
    throw new ArweaveGatewayError(
      `Arweave tx ${txId} is not yet retrievable (404). Base L1 uploads take 2–20 minutes to propagate — call waitForConfirmation() before fetching.`
    );
  }
  if (!res.ok) {
    throw new ArweaveGatewayError(
      `Arweave gateway returned ${res.status} for ${txId}.`
    );
  }
  return res;
}

/** Fetch a tx's raw bytes via the public gateway. */
export async function downloadBlob(txId: string): Promise<Blob> {
  const res = await fetchFromGateway(txId);
  return res.blob();
}

/** Convenience: fetch a tx and JSON-parse it. */
export async function downloadJson<T = unknown>(txId: string): Promise<T> {
  const res = await fetchFromGateway(txId);
  return (await res.json()) as T;
}

// Re-export the low-level `arweave-js` instance for callers that need
// advanced features (GraphQL search, raw tx inspection, etc.).
export { arweave };

