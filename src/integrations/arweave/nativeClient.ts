/**
 * Arweave client — Solana-funded via Irys.
 *
 * Phantom (and other Solana wallets) sign and pay for permanent Arweave
 * uploads in SOL through the Irys network node. No second wallet, no AR
 * token, no ArConnect/Wander required.
 *
 * The public surface intentionally mirrors the previous ArConnect-based
 * `nativeClient` so all existing callers (Candy Machine deploys,
 * uploadMetadataToArweave, profile/messaging clients, etc.) keep working
 * unchanged. AR-denominated names are preserved for compatibility but the
 * underlying funding currency is SOL.
 *
 *  • `uploadBytes / uploadJson / uploadBlob`  → Irys upload paid in SOL
 *  • `isArweaveWalletAvailable / ensureArweaveWalletConnected`
 *                                              → Solana wallet (Phantom)
 *  • `getArBalance`                            → Irys node balance (SOL)
 *  • `getUploadPriceAr`                        → upload price (SOL)
 *  • `waitForConfirmation`                     → Irys returns instantly-
 *                                                retrievable gateway URLs,
 *                                                so this is a fast no-op
 *                                                that just hits the gateway
 *                                                once to confirm.
 */

import Arweave from "arweave";
import { WebUploader } from "@irys/web-upload";
import { WebSolana } from "@irys/web-upload-solana";
import { getRpcUrl, type NetworkType } from "@/config/solana";

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
      "Solana wallet not detected. Install Phantom (https://phantom.app/) " +
        "or another Solana wallet to upload."
    );
    this.name = "ArweaveWalletMissingError";
  }
}

interface SolanaWalletProvider {
  isConnected?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect?: () => Promise<void>;
  signTransaction: (tx: unknown) => Promise<unknown>;
  signAllTransactions?: (txs: unknown[]) => Promise<unknown[]>;
  signMessage?: (msg: Uint8Array) => Promise<{ signature: Uint8Array } | Uint8Array>;
}

function getSolanaProvider(): SolanaWalletProvider {
  if (typeof window === "undefined") throw new ArweaveWalletMissingError();
  const w = window as any;
  const provider: SolanaWalletProvider | undefined =
    w.phantom?.solana || w.solana;
  if (!provider) throw new ArweaveWalletMissingError();
  return provider;
}

/** True if a Solana wallet provider is detected in this browser. */
export function isArweaveWalletAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return !!(w.phantom?.solana || w.solana);
}

/**
 * Ensure the Solana wallet is connected (used by Irys to sign upload
 * receipts and fund the node). Returns the connected public key.
 */
export async function ensureArweaveWalletConnected(): Promise<string> {
  const provider = getSolanaProvider();
  if (provider.isConnected && provider.publicKey) {
    return provider.publicKey.toString();
  }
  const res = await provider.connect();
  return res.publicKey.toString();
}

/**
 * Compat no-op. We never want to silently disconnect the user's Solana
 * wallet from inside an Arweave helper — that would break the rest of the
 * app. Callers that truly want to disconnect should use the WalletProvider.
 */
export async function disconnectArweaveWallet(): Promise<void> {
  /* no-op */
}

// ────────────────────────────── Irys uploader ───────────────────────────

// Use Solana mainnet endpoint by default; Irys also accepts a devnet
// configuration but the gateway URL is identical, so callers don't care.
const IRYS_NODE = "https://node1.irys.xyz";

let cachedUploader: any = null;
let cachedFor: string | null = null;

async function getIrysUploader() {
  const provider = getSolanaProvider();
  await ensureArweaveWalletConnected();
  const pk = provider.publicKey?.toString() ?? null;
  if (cachedUploader && cachedFor === pk) return cachedUploader;

  const rpcUrl =
    (typeof window !== "undefined" &&
      (window as any).__SOLANA_RPC_URL__) ||
    "https://api.mainnet-beta.solana.com";

  // @irys/web-upload-solana adapts a browser Solana provider (signTransaction)
  // into Irys's signer. Funding is paid from the connected SOL wallet.
  const uploader = await WebUploader(WebSolana)
    .withProvider(provider as any)
    .withRpc(rpcUrl);
  cachedUploader = uploader;
  cachedFor = pk;
  return uploader;
}

async function ensureFundedFor(bytes: number) {
  const uploader = await getIrysUploader();
  // Sub-100KiB uploads on Irys are free.
  if (bytes < 100 * 1024) return uploader;
  const price = await uploader.getPrice(bytes);
  const balance = await uploader.getLoadedBalance();
  if (balance.lt(price)) {
    const needed = price.minus(balance).multipliedBy(1.1).integerValue();
    await uploader.fund(needed);
  }
  return uploader;
}

// ────────────────────────────── Balance / price ──────────────────────────

/**
 * User's funded balance on the Irys node, returned in SOL. (Name kept as
 * `getArBalance` for back-compat with existing callers.)
 */
export async function getArBalance(_address?: string): Promise<number> {
  try {
    const uploader = await getIrysUploader();
    const atomic = await uploader.getLoadedBalance();
    // Token returns atomic units — convert to standard SOL.
    return Number(uploader.utils.fromAtomic(atomic));
  } catch {
    return 0;
  }
}

/**
 * Cost in SOL to upload `bytes` of data right now via Irys. (Name kept as
 * `getUploadPriceAr` for back-compat.)
 */
export async function getUploadPriceAr(bytes: number): Promise<number> {
  if (bytes < 100 * 1024) return 0;
  const uploader = await getIrysUploader();
  const atomic = await uploader.getPrice(bytes);
  return Number(uploader.utils.fromAtomic(atomic));
}

// ─────────────────────────────── Uploads ─────────────────────────────────

export interface ArweaveTag {
  name: string;
  value: string;
}

export interface ArweaveUploadResult {
  id: string;
  url: string;
  /** "BUNDLED" — all Irys uploads are bundled and instantly retrievable. */
  type: "BUNDLED" | "BASE";
  bytes: number;
}

function buildTags(contentType: string | undefined, tags: ArweaveTag[]) {
  const out: ArweaveTag[] = [...tags];
  if (contentType && !out.some((t) => t.name === "Content-Type")) {
    out.push({ name: "Content-Type", value: contentType });
  }
  return out;
}

/**
 * Upload arbitrary bytes via Irys, signed and paid for by the connected
 * Solana wallet. URI returned is immediately retrievable from
 * arweave.net/<id>.
 */
export async function uploadBytes(
  data: Uint8Array,
  opts: { contentType?: string; tags?: ArweaveTag[] } = {}
): Promise<ArweaveUploadResult> {
  const uploader = await ensureFundedFor(data.byteLength);
  const tags = buildTags(opts.contentType, opts.tags ?? []);
  // Irys SDK accepts Buffer; in browser, Uint8Array works via the bundled polyfill.
  const buf = Buffer.from(data);
  const res = await uploader.upload(buf, { tags });
  return {
    id: res.id,
    url: getArweaveUrl(res.id),
    type: "BUNDLED",
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

/**
 * One-shot status check. Irys URIs are retrievable instantly, so we treat
 * any 200 from the gateway as confirmed.
 */
export async function getConfirmationStatus(
  txId: string
): Promise<ConfirmationStatus> {
  try {
    const res = await fetch(getArweaveUrl(txId), { method: "HEAD" });
    if (res.ok) return { confirmed: true, numberOfConfirmations: 1 };
    return { confirmed: false, numberOfConfirmations: 0 };
  } catch {
    return { confirmed: false, numberOfConfirmations: 0 };
  }
}

export interface WaitForConfirmationOptions {
  minConfirmations?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  onPoll?: (status: ConfirmationStatus, elapsedMs: number) => void;
}

/**
 * Polling helper kept for API compat. Since Irys bundles are retrievable
 * immediately, this almost always resolves on the first poll.
 */
export async function waitForConfirmation(
  txId: string,
  options: WaitForConfirmationOptions = {}
): Promise<ConfirmationStatus> {
  const timeoutMs = options.timeoutMs ?? 2 * 60 * 1000;
  const pollIntervalMs = options.pollIntervalMs ?? 3_000;
  const startedAt = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const status = await getConfirmationStatus(txId);
    const elapsed = Date.now() - startedAt;
    options.onPoll?.(status, elapsed);
    if (status.confirmed) return status;
    if (elapsed >= timeoutMs) {
      throw new Error(
        `Arweave tx ${txId} not retrievable after ${Math.round(elapsed / 1000)}s.`
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
      `Arweave gateway unreachable while fetching ${txId}.`,
      e
    );
  }
  if (res.status === 404) {
    throw new ArweaveGatewayError(`Arweave tx ${txId} not found (404).`);
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

export { arweave };
