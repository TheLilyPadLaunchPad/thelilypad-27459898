import { WebUploader } from "@irys/web-upload";
import { WebSolana } from "@irys/web-upload-solana";
import { WebEthereum } from "@irys/web-upload-ethereum";
import { ethers } from "ethers";
import { getRpcUrl } from "@/config/solana";

/**
 * Irys (Arweave) Integration Client
 * Handles permanent storage for Solana and Monad (EVM).
 *
 * ── Optimised for bulk uploads ────────────────────────────────────────────
 * • Caches the WebIrys instance per wallet address so we don't reinitialise
 *   for every file (the old code created a fresh instance per upload).
 * • Pre-funds the node for the entire batch upfront instead of checking
 *   price/balance individually.
 * • Adds exponential-backoff retry (up to 3 attempts) per upload so a
 *   transient network hiccup doesn't kill a 500-item upload.
 * • `uploadBatchToArweave` processes items in small windows with progress
 *   callbacks and yields to the event loop between windows.
 */

export const IRYS_NODE_DEV = "https://devnet.irys.xyz";
export const IRYS_NODE_MAIN = "https://node1.irys.xyz";
export const IRYS_GATEWAY = "https://gateway.irys.xyz";

// ── Irys Programmability / Datachain Config ──────────────────────────────

/** Irys Testnet EVM-compatible JSON-RPC endpoint */
export const IRYS_TESTNET_RPC = "https://testnet-rpc.irys.xyz/v1/execution-rpc";
/** Irys Testnet RPC base (for IrysClient SDK) */
export const IRYS_TESTNET_RPC_BASE = "https://testnet-rpc.irys.xyz/v1";
/** Irys Testnet Chain ID for MetaMask / EVM wallets */
export const IRYS_CHAIN_ID = 1270;
/** Irys Testnet ticker symbol */
export const IRYS_TICKER = "IRYS";
/** Irys Testnet Explorer */
export const IRYS_TESTNET_EXPLORER = "https://testnet-explorer.irys.xyz";
/** Irys Testnet Wallet faucet */
export const IRYS_TESTNET_WALLET = "https://wallet.irys.xyz";

/**
 * Returns the MetaMask-compatible chain config for adding the Irys Testnet
 * to a user's EVM wallet via `wallet_addEthereumChain`.
 */
export function getIrysTestnetChainConfig() {
    return {
        chainId: `0x${IRYS_CHAIN_ID.toString(16)}`,
        chainName: "Irys Testnet",
        nativeCurrency: {
            name: "IRYS",
            symbol: "IRYS",
            decimals: 18,
        },
        rpcUrls: [IRYS_TESTNET_RPC],
        blockExplorerUrls: [IRYS_TESTNET_EXPLORER],
    };
}

/**
 * Creates an ethers.js JsonRpcProvider connected to the Irys Testnet.
 * The Irys datachain is EVM-compatible, so all standard EVM tooling works.
 * Useful for querying balances, sending transactions, and interacting with
 * smart contracts deployed on the Irys L1.
 *
 * @returns An ethers JsonRpcProvider pointed at the Irys Testnet RPC
 */
export function getIrysTestnetProvider() {
    return new ethers.JsonRpcProvider(IRYS_TESTNET_RPC, {
        chainId: IRYS_CHAIN_ID,
        name: "irys-testnet",
    });
}

/**
 * Prompts the user's MetaMask (or compatible) wallet to add the Irys Testnet chain.
 * If the chain is already added, this is a no-op.
 */
export async function addIrysTestnetToWallet() {
    const ethereum = (window as any).ethereum;
    if (!ethereum) throw new Error("No EVM wallet detected (MetaMask required).");

    try {
        await ethereum.request({
            method: "wallet_addEthereumChain",
            params: [getIrysTestnetChainConfig()],
        });
        console.log("[Irys] Testnet chain added to wallet successfully.");
    } catch (e) {
        console.error("[Irys] Failed to add testnet chain to wallet:", e);
        throw e;
    }
}

// ── Programmable Data (Irys Guide: Programmable Data) ────────────────────

/**
 * Defines a read range for Irys Programmable Data.
 * This specifies which bytes of a permanent ledger transaction to make
 * accessible inside a Solidity smart contract via the ProgrammableData precompile.
 *
 * Note: Only transactions uploaded to the permanent ledger (ledgerId 0) are supported.
 * DataItems uploaded through Irys bundlers are NOT yet supported.
 */
export interface ProgrammableDataReadRange {
    /** The Irys transaction ID containing the permanent data */
    transactionId: string;
    /** Byte offset to start reading from */
    startOffset: number;
    /** Number of bytes to read from startOffset */
    length: number;
}

/**
 * Builds an EIP-2930/EIP-1559 access list entry for Irys Programmable Data.
 * This access list is attached to an EVM transaction so that the target
 * Solidity contract can call `readBytes()` via the ProgrammableData precompile
 * to access on-chain permanent storage data.
 *
 * Usage with @irys/js (IrysClient):
 * ```
 * const irysClient = await new IrysClient(IRYS_TESTNET_RPC_BASE);
 * const accessList = await irysClient.programmable_data
 *     .read(transactionId, startOffset, length)
 *     .toAccessList();
 * ```
 *
 * This utility provides a lightweight alternative when @irys/js is not available,
 * constructing a placeholder access list structure that follows the EIP-1559 format.
 *
 * @param ranges One or more read ranges specifying which permanent data to access
 * @returns An array of access list entries to attach to an EVM transaction
 */
export function buildProgrammableDataAccessList(ranges: ProgrammableDataReadRange[]) {
    // Each range maps to an access list entry the precompile uses
    // In production, use @irys/js `irysClient.programmable_data.read().toAccessList()`
    // This provides the structural shape for reference and testing
    return ranges.map(range => ({
        transactionId: range.transactionId,
        startOffset: range.startOffset,
        length: range.length,
        // The actual precompile address and storage keys are resolved by @irys/js
        // This serves as metadata for the transaction builder
    }));
}

/**
 * Sends a Programmable Data transaction on the Irys Testnet.
 * The transaction must be EIP-1559 (type 2) or higher and include
 * the access list generated from `irysClient.programmable_data.read().toAccessList()`.
 *
 * This calls a smart contract method (e.g. `readPdBytesIntoStorage()`) that
 * uses the ProgrammableData precompile to read permanent data on-chain.
 *
 * IMPORTANT: You are charged for every chunk you request in the access list,
 * even if the contract doesn't read them. Only attach access lists to
 * transactions that will actually use programmatic data reads.
 *
 * @param contractAddress The address of the deployed ProgrammableData contract
 * @param encodedFunctionCall ABI-encoded function call data (e.g. contract.interface.encodeFunctionData())
 * @param accessList The access list generated by @irys/js for programmable data reads
 * @param signer Optional ethers Signer; if omitted, uses window.ethereum
 */
export async function sendProgrammableDataTransaction(
    contractAddress: string,
    encodedFunctionCall: string,
    accessList: any[],
    signer?: ethers.Signer,
): Promise<string> {
    let txSigner = signer;

    if (!txSigner) {
        const ethereum = (window as any).ethereum;
        if (!ethereum) throw new Error("No EVM wallet detected.");
        const provider = new ethers.BrowserProvider(ethereum);
        txSigner = await provider.getSigner();
    }

    const tx = {
        to: contractAddress,
        data: encodedFunctionCall,
        accessList,
        type: 2, // EIP-1559 — required for programmable data
    };

    const txResponse = await txSigner.sendTransaction(tx);
    console.log(`[Irys] Programmable Data TX sent: ${txResponse.hash}`);

    const receipt = await txResponse.wait();
    console.log(`[Irys] Programmable Data TX confirmed in block ${receipt?.blockNumber}`);

    return txResponse.hash;
}

// ── Gateway Download Helpers (Irys Guide: Downloading Data) ──────────────

/**
 * Constructs a permanent gateway download URL for a given Irys/Arweave transaction ID.
 * Data uploaded to Irys is instantly accessible via GET requests to this URL.
 *
 * @param txId The transaction ID returned from an Irys upload
 * @returns The full gateway URL (e.g. https://gateway.irys.xyz/{txId})
 */
export function getIrysDownloadUrl(txId: string): string {
    return `${IRYS_GATEWAY}/${txId}`;
}

/**
 * Constructs a mutable gateway URL for Dynamic NFTs.
 * This URL always resolves to the LATEST version in the mutable reference chain.
 *
 * @param rootTxId The root transaction ID (first upload in the mutable chain)
 * @returns The mutable gateway URL (e.g. https://gateway.irys.xyz/mutable/{rootTxId})
 */
export function getIrysMutableUrl(rootTxId: string): string {
    return `${IRYS_GATEWAY}/mutable/${rootTxId}`;
}

/**
 * Downloads data from the Irys gateway by transaction ID.
 * Returns the raw response so the caller can handle it as text, JSON, blob, etc.
 *
 * @param txId The transaction ID of the data to download
 * @returns The fetch Response object
 */
export async function downloadFromIrys(txId: string): Promise<Response> {
    const url = getIrysDownloadUrl(txId);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`[Irys] Download failed for ${txId}: HTTP ${response.status}`);
    return response;
}

/**
 * Downloads and parses JSON metadata from the Irys gateway.
 * Convenience wrapper for fetching NFT metadata by transaction ID.
 *
 * @param txId The transaction ID of the JSON metadata
 * @returns The parsed JSON object
 */
export async function downloadMetadataFromIrys(txId: string): Promise<any> {
    const response = await downloadFromIrys(txId);
    return response.json();
}

/**
 * Downloads a file as a Blob from the Irys gateway.
 * Useful for displaying images or saving files locally.
 *
 * @param txId The transaction ID of the file
 * @returns A Blob containing the file data
 */
export async function downloadFileFromIrys(txId: string): Promise<Blob> {
    const response = await downloadFromIrys(txId);
    return response.blob();
}

// ── Irys instance cache ──────────────────────────────────────────────────

interface CachedIrys {
    irys: any;
    address: string;
    chainType: string;
    network: string;
}

let _cachedIrys: CachedIrys | null = null;

/**
 * Get (or reuse) a WebIrys instance for the given wallet.
 * The instance is cached per wallet address + chain so it survives
 * across multiple uploads in the same session.
 */
export async function getWebIrys(
    wallet: {
        address: string | null;
        chainType: string;
        network: string;
    },
): Promise<any> {
    // Return cached if it matches
    if (
        _cachedIrys &&
        _cachedIrys.address === wallet.address &&
        _cachedIrys.chainType === wallet.chainType &&
        _cachedIrys.network === wallet.network
    ) {
        return _cachedIrys.irys;
    }

    const isMainnet = wallet.network === "mainnet";
    const nodeUrl = isMainnet ? IRYS_NODE_MAIN : IRYS_NODE_DEV;

    let irys: any;

    // TODO: Temporary override for Monad storage testing. 
    // Always use Phantom/Solana to pay for Irys storage across all chains for now.
    const effectiveChainType = "solana";

    if (effectiveChainType === "solana") {
        const provider = (window as any).phantom?.solana || (window as any).solana;
        if (!provider) throw new Error("Solana wallet not detected");

        // Wrap provider to ensure sendTransaction exists (Phantom exposes
        // signAndSendTransaction but not sendTransaction, which Irys expects)
        const wrappedProvider = Object.create(provider);
        if (!wrappedProvider.sendTransaction && wrappedProvider.signAndSendTransaction) {
            wrappedProvider.sendTransaction = async (transaction: any, connection?: any) => {
                const result = await provider.signAndSendTransaction(transaction);
                return result.signature;
            };
        }

        const rpcUrl = getRpcUrl("devnet");
        let builder = WebUploader(WebSolana).withProvider(wrappedProvider);
        if (!isMainnet) {
            builder = builder.withRpc(rpcUrl);
        }
        irys = await (isMainnet ? builder.mainnet() : builder.devnet());
    } else if (wallet.chainType === "monad" || wallet.chainType === "ethereum") {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        let builder = WebUploader(WebEthereum).withProvider(provider);
        if (!isMainnet) {
            builder = builder.withRpc(getRpcUrl("devnet"));
        }
        irys = await (isMainnet ? builder.mainnet() : builder.devnet());
    } else {
        throw new Error(
            `Irys storage payment not yet configured for ${wallet.chainType}. Please use Solana or Monad for payment.`
        );
    }

    _cachedIrys = {
        irys,
        address: wallet.address || "",
        chainType: wallet.chainType,
        network: wallet.network,
    };

    return irys;
}

/** Clear the cached Irys instance (e.g. on wallet disconnect). */
export function clearIrysCache() {
    _cachedIrys = null;
}

// ── Timeout helper ───────────────────────────────────────────────────────

const UPLOAD_TIMEOUT_MS = 60_000;   // 60s per file upload
const METADATA_TIMEOUT_MS = 30_000; // 30s per metadata upload
const FUNDING_TIMEOUT_MS = 120_000; // 120s for funding

class UploadTimeoutError extends Error {
    constructor(label: string, timeoutMs: number) {
        super(`Upload timed out after ${timeoutMs / 1000}s: ${label}`);
        this.name = "UploadTimeoutError";
    }
}

async function withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    label: string,
): Promise<T> {
    return Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new UploadTimeoutError(label, timeoutMs)), timeoutMs)
        ),
    ]);
}

// ── Retry helper ─────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_500;

async function withRetry<T>(
    fn: () => Promise<T>,
    label: string,
    retries = MAX_RETRIES,
    timeoutMs?: number,
): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const exec = timeoutMs ? () => withTimeout(fn, timeoutMs, label) : fn;
            return await exec();
        } catch (err: any) {
            if (attempt === retries) throw err;

            const delay = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 500;
            console.warn(
                `[Irys] ${label} failed (attempt ${attempt}/${retries}), retrying in ${Math.round(delay)}ms…`,
                err.message
            );
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw new Error("Unreachable"); // for TS
}

// ── Funding amount coercion ──────────────────────────────────────────────

/**
 * Irys requires an integer (atomic units) for funding.
 * BigNumber arithmetic (e.g. `.minus`, `.multipliedBy`) can produce decimals.
 * This helper rounds UP so we never under-fund.
 */
function toIntegerFundAmount(amount: any): any {
    if (typeof amount?.integerValue === 'function') {
        // BigNumber.js ROUND_CEIL = 2
        return amount.integerValue(2);
    }
    if (typeof amount === 'number') {
        return Math.ceil(amount);
    }
    // If it's already a string or something else, parse and ceil
    const n = Number(amount);
    if (!isNaN(n)) return Math.ceil(n);
    return amount; // last resort — pass through
}

// ── Upload progress persistence ──────────────────────────────────────────

const PROGRESS_KEY_PREFIX = "lilypad_upload_progress_";

export interface SavedUploadProgress {
    completedItems: BatchUploadResult[];
    totalItems: number;
    timestamp: number;
}

export function saveUploadProgress(collectionKey: string, results: BatchUploadResult[], totalItems: number) {
    try {
        const data: SavedUploadProgress = {
            completedItems: results.filter(Boolean),
            totalItems,
            timestamp: Date.now(),
        };
        localStorage.setItem(PROGRESS_KEY_PREFIX + collectionKey, JSON.stringify(data));
    } catch (e) {
        console.warn("[Irys] Failed to save upload progress:", e);
    }
}

export function loadUploadProgress(collectionKey: string): SavedUploadProgress | null {
    try {
        const raw = localStorage.getItem(PROGRESS_KEY_PREFIX + collectionKey);
        if (!raw) return null;
        const data: SavedUploadProgress = JSON.parse(raw);
        // Expire after 24 hours
        if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
            clearUploadProgress(collectionKey);
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

export function clearUploadProgress(collectionKey: string) {
    try {
        localStorage.removeItem(PROGRESS_KEY_PREFIX + collectionKey);
    } catch {}
}

// ── Single-file upload ───────────────────────────────────────────────────

/**
 * Upload a single file to Arweave via Irys.
 * Includes automatic retry on transient failures.
 */
export async function uploadToArweave(
    file: File | Blob,
    wallet: any,
    isMutable = false,
    rootTx?: string,
    feeMultiplier?: number,
    customTags?: { name: string; value: string }[]
): Promise<string> {
    const irys = await getWebIrys(wallet);

    // Check price and balance — fund if needed
    const price = await irys.getPrice(file.size);
    const balance = await irys.getLoadedBalance();

    if (balance.lt(price)) {
        // Round UP and add 10% buffer to cover potential network fee spikes during settlement
        let toFund = toIntegerFundAmount(price.minus(balance));
        if (typeof toFund.multipliedBy === 'function') {
            toFund = toIntegerFundAmount(toFund.multipliedBy(1.1));
        } else {
            toFund = Math.ceil(Number(toFund) * 1.1);
        }
        
        console.log(`[Irys] Funding node with ${toFund.toString()} (multiplier: ${feeMultiplier || 1})…`);
        await withTimeout(
            () => irys.fund(toFund, feeMultiplier),
            FUNDING_TIMEOUT_MS,
            "Arweave funding"
        );
    }

    const tags = [
        { name: "Content-Type", value: file.type || "application/octet-stream" },
        { name: "application-id", value: "The Lily Pad" },
        ...(customTags || [])
    ];

    if (isMutable && rootTx) {
        tags.push({ name: "Root-TX", value: rootTx });
    }

    const data = await file.arrayBuffer();

    return withRetry(async () => {
        const response = await irys.upload(new Uint8Array(data) as any, { tags });
        return isMutable
            ? `https://gateway.irys.xyz/mutable/${rootTx || response.id}`
            : `https://arweave.net/${response.id}`;
    }, `upload ${(file as File).name || "blob"}`);
}

// ── Large-file chunked upload ────────────────────────────────────────────

export interface ChunkedUploadInstance {
    urlPromise: Promise<string>;
    pause: () => void;
    resume: () => void;
    getResumeData: () => string | undefined;
}

/**
 * Uploads a large file to Irys using the dedicated Chunked Uploader.
 * Great for massive video/audio/3D files as it avoids hitting bundle limits.
 * Provides fine-grained progress feedback through `uploader.on("chunkUpload")`.
 * 
 * @param file The large file to upload
 * @param wallet The wallet instance to initialize Irys
 * @param onProgress Callback function for chunk-by-chunk progress percentage (0-100)
 * @param isMutable Whether the upload is part of a mutable series
 * @param feeMultiplier Optional network fee multiplier
 * @param chunkSize Optional size of each chunk to upload at once (defaults to 25MB)
 * @param batchSize Optional number of chunks to upload at once (defaults to 5)
 * @param resumeData Optional base64 string provided by a previous failed instance to skip already uploaded chunks
 */
export async function uploadFileChunkedToArweave(
    file: File | Blob,
    wallet: any,
    onProgress?: (progressPct: number, uploadedBytes: number, totalBytes: number) => void,
    isMutable = false,
    rootTx?: string,
    feeMultiplier?: number,
    chunkSize = 25_000_000,
    batchSize = 5,
    resumeData?: string,
    customTags?: { name: string; value: string }[]
): Promise<ChunkedUploadInstance> {
    const irys = await getWebIrys(wallet);

    // Check price and balance — fund if needed
    const price = await irys.getPrice(file.size);
    const balance = await irys.getLoadedBalance();

    if (balance.lt(price)) {
        const toFund = toIntegerFundAmount(price.minus(balance));
        console.log(`[Irys] Funding node for chunked upload with ${toFund.toString()} (multiplier: ${feeMultiplier || 1})…`);
        await irys.fund(toFund, feeMultiplier);
    }

    const tags = [
        { name: "Content-Type", value: file.type || "application/octet-stream" },
        { name: "application-id", value: "The Lily Pad" },
        ...(customTags || [])
    ];

    if (isMutable && rootTx) {
        tags.push({ name: "Root-TX", value: rootTx });
    }

    const data = await file.arrayBuffer();

    // Create the chunked uploader object specific to this file as per Irys best practices
    const uploader = irys.uploader.chunkedUploader;

    // Adjust chunk size and batch size for network conditions.
    uploader.setChunkSize(chunkSize);
    uploader.setBatchSize(batchSize);

    // If a previous upload failed or expired, we can resume exactly where it left off
    if (resumeData) {
        uploader.setResumeData(resumeData);
    }

    if (onProgress) {
        uploader.on("chunkUpload", (info: any) => {
            const progress = (info.totalUploaded / file.size) * 100;
            onProgress(Math.max(0, Math.min(100, progress)), info.totalUploaded, file.size);
        });

        uploader.on("chunkError", (e: any) => {
            console.error(`[Irys] Error uploading chunk:`, e);
        });
    }

    // Return an unawaited promise alongside controls so the host app can pause/resume
    const urlPromise = withRetry(async () => {
        // Note: The Web Irys chunkedUploader expects Buffer/Uint8Array in the browser.
        // It returns an AxiosResponse wrapping the generic UploadResponse data object.
        const res: any = await uploader.uploadData(new Uint8Array(data) as any, { tags });
        const txId = res?.data?.id || res?.id;

        if (!txId) {
            throw new Error("Failed to receive valid transaction ID from Chunked Uploader.");
        }

        return isMutable
            ? `https://gateway.irys.xyz/mutable/${rootTx || txId}`
            : `https://arweave.net/${txId}`;
    }, `chunked upload ${(file as File).name || "blob"}`);

    return {
        urlPromise,
        pause: () => uploader.pause(),
        resume: () => uploader.resume(),
        getResumeData: () => {
            // Check if getResumeData is available internally on the chunked uploader
            if (typeof uploader.getResumeData === 'function') {
                return uploader.getResumeData();
            }
            return undefined;
        }
    };
}

/**
 * Uploads a large file to Irys using the Chunked Uploader in Transaction Mode.
 * This is useful if you want to sign the transaction first, verify it or defer it,
 * and then upload the chunks.
 * 
 * @param file The large file to upload
 * @param wallet The wallet instance to initialize Irys
 * @param onProgress Callback function for chunk-by-chunk progress percentage (0-100)
 * @param isMutable Whether the upload is part of a mutable series
 * @param rootTx Origin transaction for mutables
 * @param feeMultiplier Optional network fee multiplier
 * @param chunkSize Optional size of each chunk to upload at once (defaults to 25MB)
 * @param batchSize Optional number of chunks to upload at once (defaults to 5)
 * @param resumeData Optional base64 string provided by a previous failed instance to skip already uploaded chunks
 */
export async function uploadChunkedTransactionToArweave(
    file: File | Blob,
    wallet: any,
    onProgress?: (progressPct: number, uploadedBytes: number, totalBytes: number) => void,
    isMutable = false,
    rootTx?: string,
    feeMultiplier?: number,
    chunkSize = 25_000_000,
    batchSize = 5,
    resumeData?: string,
    customTags?: { name: string; value: string }[]
): Promise<ChunkedUploadInstance> {
    const irys = await getWebIrys(wallet);

    // Check price and balance — fund if needed
    const price = await irys.getPrice(file.size);
    const balance = await irys.getLoadedBalance();

    if (balance.lt(price)) {
        const toFund = toIntegerFundAmount(price.minus(balance));
        console.log(`[Irys] Funding node for chunked tx upload with ${toFund.toString()} (multiplier: ${feeMultiplier || 1})…`);
        await irys.fund(toFund, feeMultiplier);
    }

    const tags = [
        { name: "Content-Type", value: file.type || "application/octet-stream" },
        { name: "application-id", value: "The Lily Pad" },
        ...(customTags || [])
    ];

    if (isMutable && rootTx) {
        tags.push({ name: "Root-TX", value: rootTx });
    }

    const data = await file.arrayBuffer();

    // 1. Transaction Mode: Create & Sign First
    const transaction = irys.createTransaction(new Uint8Array(data) as any, { tags });
    await transaction.sign();

    // Create the chunked uploader object specific to this file
    const uploader = irys.uploader.chunkedUploader;
    uploader.setChunkSize(chunkSize);
    uploader.setBatchSize(batchSize);

    // Resume from expired or paused session if provided
    if (resumeData) {
        uploader.setResumeData(resumeData);
    }

    if (onProgress) {
        uploader.on("chunkUpload", (info: any) => {
            const progress = (info.totalUploaded / file.size) * 100;
            onProgress(Math.max(0, Math.min(100, progress)), info.totalUploaded, file.size);
        });

        uploader.on("chunkError", (e: any) => {
            console.error(`[Irys] Error uploading chunk via TX:`, e);
        });
    }

    // Return an unawaited promise alongside controls so the host app can pause/resume
    const urlPromise = withRetry(async () => {
        // 2. Upload the fully signed transaction bundle via chunked uploader
        const res: any = await uploader.uploadTransaction(transaction);
        const txId = res?.data?.id || res?.id || transaction.id;

        if (!txId) {
            throw new Error("Failed to receive transaction ID from Chunked TX Uploader.");
        }

        return isMutable
            ? `https://gateway.irys.xyz/mutable/${rootTx || txId}`
            : `https://arweave.net/${txId}`;
    }, `chunked tx upload ${(file as File).name || "blob"}`);

    return {
        urlPromise,
        pause: () => uploader.pause(),
        resume: () => uploader.resume(),
        getResumeData: () => {
            if (typeof uploader.getResumeData === 'function') {
                return uploader.getResumeData();
            }
            return undefined;
        }
    };
}

export async function uploadMetadataToArweave(
    metadata: any,
    wallet: any,
    isMutable = false,
    rootTx?: string,
    customTags?: { name: string; value: string }[]
): Promise<string> {
    const json = JSON.stringify(metadata, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const file = new File([blob], "metadata.json", { type: "application/json" });

    return uploadToArweave(file, wallet, isMutable, rootTx, 1.0, customTags);
}

// ── Single NFT Upload (Irys Guide: Uploading NFTs) ──────────────────────

/**
 * Convenience wrapper implementing the full Irys NFT upload pipeline in a single call.
 * Follows the official guide: https://docs.irys.xyz/build/d/guides/uploading-nfts
 *
 * Pipeline:
 *   1. Upload the image asset to Arweave → receives a permanent gateway URL
 *   2. (Optional) Upload an animation file (video/audio/3D) → receives a second gateway URL
 *   3. Build metadata JSON embedding the asset URLs into { name, description, image, animation_url }
 *   4. Upload the metadata JSON to Arweave → returns the mint-ready metadata URI
 *
 * @param imageFile       The primary image file for the NFT
 * @param wallet          The wallet instance to initialize Irys
 * @param metadata        Object containing { name, symbol?, description, attributes?, ... }
 * @param animationFile   Optional animation file (video, audio, HTML, 3D model) for animation_url
 * @param isMutable       Whether the uploads should use mutable references
 * @param rootTx          Root transaction ID for mutable updates
 * @param feeMultiplier   Optional multiplier to prioritize funding transactions
 * @returns Object with the final metadataUri plus individual asset URIs
 */
export async function uploadNFTToArweave(
    imageFile: File | Blob,
    wallet: any,
    metadata: {
        name: string;
        symbol?: string;
        description: string;
        attributes?: { trait_type: string; value: string | number }[];
        [key: string]: any;
    },
    animationFile?: File | Blob,
    isMutable = false,
    rootTx?: string,
    feeMultiplier?: number,
): Promise<{
    metadataUri: string;
    imageUri: string;
    animationUri?: string;
}> {
    // Step 1: Upload the primary image asset
    const imageUri = await uploadToArweave(imageFile, wallet, isMutable, rootTx, feeMultiplier);
    console.log(`[Irys] NFT image uploaded → ${imageUri}`);

    // Step 2 (optional): Upload animation file if provided
    let animationUri: string | undefined;
    if (animationFile) {
        animationUri = await uploadToArweave(animationFile, wallet, isMutable, rootTx, feeMultiplier);
        console.log(`[Irys] NFT animation uploaded → ${animationUri}`);
    }

    // Step 3: Build the final metadata JSON with embedded asset URLs
    const nftMetadata: any = {
        name: metadata.name,
        description: metadata.description,
        image: imageUri,
        ...(metadata.symbol && { symbol: metadata.symbol }),
        ...(animationUri && { animation_url: animationUri }),
        ...(metadata.attributes && { attributes: metadata.attributes }),
    };

    // Spread any additional custom fields the caller passed (e.g. external_url, seller_fee_basis_points)
    const { name: _n, symbol: _s, description: _d, attributes: _a, ...extraFields } = metadata;
    Object.assign(nftMetadata, extraFields);

    // Step 4: Upload metadata JSON
    const metadataUri = await uploadMetadataToArweave(nftMetadata, wallet, isMutable, rootTx);
    console.log(`[Irys] NFT metadata uploaded → ${metadataUri}`);

    return { metadataUri, imageUri, animationUri };
}

// ── Dynamic NFT Mutation (Irys Guide: Dynamic NFTs) ─────────────────────

/**
 * Mutates an existing Dynamic NFT by uploading a new version of its metadata
 * chained to the original Root-TX. The mutable gateway URL will automatically
 * resolve to this newest version.
 *
 * Follows the official guide: https://docs.irys.xyz/build/d/guides/dynamic-nft
 *
 * Important: The mutation MUST be signed by the same wallet that created
 * the original upload, otherwise the chain will be rejected.
 *
 * On Irys, metadata uploads < 100 KiB are FREE — so evolving NFTs costs
 * nothing in storage fees for typical metadata updates!
 *
 * @param rootTxId       The transaction ID of the FIRST (original) metadata upload
 * @param wallet         The wallet instance (must be the same wallet that created the original)
 * @param newMetadata    The updated metadata object (name, description, image, attributes, etc.)
 * @param newImageFile   Optional new image file if the NFT's visual is also changing
 * @param newAnimFile    Optional new animation file
 * @returns Object with the updated metadataUri (same mutable URL, now points to new data)
 */
export async function mutateNFTMetadata(
    rootTxId: string,
    wallet: any,
    newMetadata: {
        name: string;
        symbol?: string;
        description: string;
        image?: string;
        attributes?: { trait_type: string; value: string | number }[];
        [key: string]: any;
    },
    newImageFile?: File | Blob,
    newAnimFile?: File | Blob,
): Promise<{
    metadataUri: string;
    imageUri?: string;
    animationUri?: string;
}> {
    let imageUri = newMetadata.image;
    let animationUri: string | undefined;

    // If a new image is provided, upload it (immutable — the image itself is permanent)
    if (newImageFile) {
        imageUri = await uploadToArweave(newImageFile, wallet, false);
        console.log(`[Irys] Dynamic NFT new image uploaded → ${imageUri}`);
    }

    // If a new animation is provided, upload it
    if (newAnimFile) {
        animationUri = await uploadToArweave(newAnimFile, wallet, false);
        console.log(`[Irys] Dynamic NFT new animation uploaded → ${animationUri}`);
    }

    // Build the mutated metadata — this replaces the previous version in the chain
    const mutatedMetadata: any = {
        ...newMetadata,
        ...(imageUri && { image: imageUri }),
        ...(animationUri && { animation_url: animationUri }),
    };

    // Upload the new metadata with Root-TX tag pointing to the original transaction
    // This is the key mechanism: the mutable gateway URL resolves to the latest in the chain
    const metadataUri = await uploadMetadataToArweave(mutatedMetadata, wallet, true, rootTxId);
    console.log(`[Irys] Dynamic NFT metadata mutated → ${metadataUri} (Root-TX: ${rootTxId})`);

    return {
        metadataUri,
        imageUri,
        animationUri,
    };
}

// ── Batch upload with thumbnail generation ───────────────────────────────

import { generateThumbnails, type ProcessedImage } from "@/lib/thumbnailGenerator";

export interface BatchUploadItem {
    /** The image file to upload */
    file: File | Blob;
    /**
     * Metadata builder — receives all image URIs so you can embed them.
     * `imageUri` = full-res original, `thumbUri` = 512px, `previewUri` = 1200px.
     */
    buildMetadata: (imageUri: string, thumbUri?: string, previewUri?: string) => any;
}

export interface BatchUploadResult {
    tokenId: number;
    arweaveUri: string;           // metadata URI
    arweaveImageUri: string;      // full-res image URI
    arweaveThumbUri: string;      // 512px thumbnail URI
    arweavePreviewUri: string;    // 1200px preview URI
}

export interface BatchUploadResponse {
    items: BatchUploadResult[];
    manifestUri?: string;         // The Irys Onchain Folder base URI
}

/**
 * Upload an entire collection to Arweave in optimised batches.
 *
 * Pipeline per item:
 *   1. Generate 512px WebP thumbnail + 1200px WebP preview (client-side)
 *   2. Upload full-res original, thumbnail, & preview to Arweave
 *   3. Build metadata JSON (with all 3 URIs) and upload it
 *
 * Features:
 * • Pre-funds the Irys node for the estimated total size upfront
 *   (original + thumb + preview + metadata per item).
 * • Processes items in small windows (default 3 concurrent) with
 *   progress callbacks so the UI stays responsive.
 * • Retries each individual upload up to 3 times with exponential backoff.
 * • Yields to the event loop between windows to prevent UI freeze.
 * • Thumbnail generation uses Web Workers so it doesn't block the main thread.
 *
 * @param enableThumbnails  Set to false to skip thumbnail generation
 * @param enableThumbnails  Set to false to skip thumbnail generation
 * @param customTags        Additional Irys/Arweave tags to attach to each upload
 * @param isMutable         Set to true to generate a mutable manifest URI
 * @param rootTx            The transaction ID of the original manifest (required for updating mutables)
 * @param feeMultiplier     Optional multiplier (e.g. 1.2) to prioritize funding transactions
 */
export async function uploadBatchToArweave(
    items: BatchUploadItem[],
    wallet: any,
    onProgress?: (completed: number, total: number, status: string) => void,
    concurrency = 25,
    enableThumbnails = true,
    customTags: { name: string; value: string }[] = [],
    isMutable = false,
    rootTx?: string,
    feeMultiplier?: number,
    signal?: AbortSignal,
    resumeKey?: string,
): Promise<BatchUploadResponse> {
    if (items.length === 0) return { items: [] };

    // ── Resume: load previous progress ───────────────────────────────────
    let previousResults: BatchUploadResult[] = [];
    const completedIndices = new Set<number>();
    if (resumeKey) {
        const saved = loadUploadProgress(resumeKey);
        if (saved && saved.completedItems.length > 0) {
            previousResults = saved.completedItems;
            saved.completedItems.forEach(r => completedIndices.add(r.tokenId));
            onProgress?.(previousResults.length, items.length, `Resuming — ${previousResults.length}/${items.length} already uploaded`);
            console.log(`[Irys] Resuming upload: ${previousResults.length}/${items.length} items already complete`);
        }
    }

    const irys = await getWebIrys(wallet);

    // ── Phase 1: Pipelined Execution ─────────────────────────────────────
    const results: BatchUploadResult[] = new Array(items.length);
    // Pre-populate with resumed results
    for (const r of previousResults) {
        results[r.tokenId] = r;
    }

    // Estimate total size for pre-funding (avoids waiting for all thumbnails)
    const totalEstimatedBytes = items.reduce((sum, item, idx) => {
        if (completedIndices.has(idx)) return sum;
        const origSize = item.file.size || 5_000_000;
        const thumbSize = 250_000; // Average 512px WebP
        const previewSize = 1_200_000; // Average 1200px WebP
        return sum + origSize + thumbSize + previewSize + 4096;
    }, 0);

    if (totalEstimatedBytes > 0) {
        onProgress?.(previousResults.length, items.length, "Estimating storage cost…");
        const price = await irys.getPrice(totalEstimatedBytes);
        const balance = await irys.getLoadedBalance();

        if (balance.lt(price)) {
            // Fund with 15% buffer for safety
            const toFund = toIntegerFundAmount(price.minus(balance).multipliedBy(1.15));
            onProgress?.(previousResults.length, items.length, "Funding Arweave node…");
            await withRetry(
                () => withTimeout(() => irys.fund(toFund, feeMultiplier), FUNDING_TIMEOUT_MS, "batch pre-fund"),
                "pre-fund"
            );
        }
    }

    const makeTags = (type: string) => [
        { name: "Content-Type", value: type || "application/octet-stream" },
        { name: "application-id", value: "The Lily Pad" },
        { name: "generator", value: "Lily Pad Launchpad" },
        ...customTags
    ];

    let uploadedCount = previousResults.length;
    const uploadConcurrency = Math.min(concurrency, 10); // Increased from 5 to 10 for speed

    for (let i = 0; i < items.length; i += uploadConcurrency) {
        if (signal?.aborted) break;

        const window = items.slice(i, i + uploadConcurrency);
        const windowIndices = Array.from({ length: window.length }, (_, k) => i + k);

        // Process window: Thumbnail → Upload in parallel for each item in window
        const windowResults = await Promise.all(
            window.map(async (item, idx) => {
                const globalIdx = windowIndices[idx];
                if (completedIndices.has(globalIdx)) return null;

                try {
                    onProgress?.(uploadedCount, items.length, `Processing item ${globalIdx + 1}/${items.length}…`);
                    
                    // 1. Generate thumbnails for THIS item only (just-in-time)
                    let processed: ProcessedImage | undefined;
                    if (enableThumbnails) {
                        const file = item.file instanceof File 
                            ? item.file 
                            : new File([item.file], `item_${globalIdx}.png`, { type: item.file.type });
                        processed = await generateThumbnails(file);
                    }

                    // 2. Upload full-res image
                    const imgData = await item.file.arrayBuffer();
                    const imgUri = await withRetry(async () => {
                        const res = await irys.upload(new Uint8Array(imgData) as any, {
                            tags: makeTags(item.file.type),
                        });
                        return `https://arweave.net/${res.id}`;
                    }, `image #${globalIdx + 1}`, MAX_RETRIES, UPLOAD_TIMEOUT_MS);

                    // 3. Upload thumbnail
                    let thumbUri = imgUri;
                    if (processed?.thumb && processed.thumb !== processed.original) {
                        const thumbData = await processed.thumb.arrayBuffer();
                        thumbUri = await withRetry(async () => {
                            const res = await irys.upload(new Uint8Array(thumbData) as any, {
                                tags: makeTags("image/webp"),
                            });
                            return `https://arweave.net/${res.id}`;
                        }, `thumb #${globalIdx + 1}`, MAX_RETRIES, UPLOAD_TIMEOUT_MS);
                    }

                    // 4. Upload preview
                    let previewUri = imgUri;
                    if (processed?.preview && processed.preview !== processed.original) {
                        const prevData = await processed.preview.arrayBuffer();
                        previewUri = await withRetry(async () => {
                            const res = await irys.upload(new Uint8Array(prevData) as any, {
                                tags: makeTags("image/webp"),
                            });
                            return `https://arweave.net/${res.id}`;
                        }, `preview #${globalIdx + 1}`, MAX_RETRIES, UPLOAD_TIMEOUT_MS);
                    }

                    // 5. Build & upload metadata
                    const metadata = item.buildMetadata(imgUri, thumbUri, previewUri);
                    const metaData = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
                    const metaUri = await withRetry(async () => {
                        const res = await irys.upload(metaData as any, {
                            tags: makeTags("application/json"),
                        });
                        return `https://arweave.net/${res.id}`;
                    }, `metadata #${globalIdx + 1}`, MAX_RETRIES, METADATA_TIMEOUT_MS);

                    return {
                        tokenId: globalIdx,
                        arweaveUri: metaUri,
                        arweaveImageUri: imgUri,
                        arweaveThumbUri: thumbUri,
                        arweavePreviewUri: previewUri,
                    } satisfies BatchUploadResult;
                } catch (err) {
                    console.error(`[Irys] Item ${globalIdx + 1} failed:`, err);
                    return null;
                }
            })
        );

        for (const r of windowResults) {
            if (r) {
                results[r.tokenId] = r;
                uploadedCount++;
            }
        }

        onProgress?.(uploadedCount, items.length, `Uploaded ${uploadedCount} / ${items.length}…`);
        if (resumeKey) saveUploadProgress(resumeKey, results.filter(Boolean), items.length);
        
        // Short yield for UI responsiveness
        await new Promise((r) => setTimeout(r, 0));
    }

    // Filter out nulls in case any items failed
    const finalResults = results.filter(Boolean);

    // ── Phase 4: Create Onchain Folder (Manifest) ────────────────────────
    let manifestUri: string | undefined = undefined;

    if (finalResults.length > 0) {
        try {
            onProgress?.(finalResults.length, items.length, "Creating onchain folder manifest…");
            const map = new Map<string, string>();

            finalResults.forEach((r, i) => {
                // Add metadata 
                const metaId = r.arweaveUri.split("/").pop();
                if (metaId) map.set(`${i}.json`, metaId);

                // Add images
                const imgId = r.arweaveImageUri.split("/").pop();
                if (imgId) {
                    const originalExt = items[i]?.file instanceof File ? items[i].file.name.split('.').pop() || 'png' : 'png';
                    map.set(`${i}.${originalExt}`, imgId);
                }

                if (r.arweaveThumbUri && r.arweaveThumbUri !== r.arweaveImageUri) {
                    const thumbId = r.arweaveThumbUri.split("/").pop();
                    if (thumbId) map.set(`${i}_thumb.webp`, thumbId);
                }

                if (r.arweavePreviewUri && r.arweavePreviewUri !== r.arweaveImageUri) {
                    const previewId = r.arweavePreviewUri.split("/").pop();
                    if (previewId) map.set(`${i}_preview.webp`, previewId);
                }
            });

            // Need to generate folder via Irys uploader
            // ensure uploader and generateFolder are available
            const uploaderAny = irys.uploader as any;
            if (uploaderAny && typeof uploaderAny.generateFolder === 'function') {
                const manifestObj = await uploaderAny.generateFolder({ items: map });

                const tags = [
                    { name: "Type", value: "manifest" },
                    { name: "Content-Type", value: "application/x.irys-manifest+json" },
                    { name: "application-id", value: "The Lily Pad" },
                    ...customTags
                ];

                // For mutability: link subsequent updates to the original manifest ID via Root-TX
                if (isMutable && rootTx) {
                    tags.push({ name: "Root-TX", value: rootTx });
                }

                const receipt = await withRetry(async () => {
                    return await irys.upload(JSON.stringify(manifestObj), { tags });
                }, "manifest upload");

                // Output a mutable reference gateway URI if mutability is requested
                manifestUri = isMutable
                    ? `https://gateway.irys.xyz/mutable/${rootTx || receipt.id}`
                    : `https://arweave.net/${receipt.id}`;
                console.log(`[Irys] Onchain folder created at ${manifestUri}`);
            } else {
                console.warn("[Irys] irys.uploader.generateFolder is not available in this SDK version.");
            }
        } catch (err) {
            console.error("[Irys] Failed to create onchain folder manifest:", err);
            // Non-fatal, just log it. We still have all the individual URIs.
        }
    }

    return { items: finalResults, manifestUri };
}

// ── Receipt Verification ─────────────────────────────────────────────────

/**
 * Retrieves the cryptographically signed receipt and accurate timestamp generated by Irys.
 * Receipts prove the exact millisecond a file/transaction was verified.
 * 
 * @param transactionId The Arweave/Irys transaction ID (e.g. from arweave.net/<txId>)
 * @param wallet The wallet instance to initialize Irys
 */
export async function getIrysReceipt(transactionId: string, wallet: any) {
    const irys = await getWebIrys(wallet);
    try {
        const receipt = await irys.utils.getReceipt(transactionId);
        return receipt;
    } catch (e) {
        console.error(`[Irys] Error getting receipt for TX ${transactionId}:`, e);
        throw e;
    }
}

/**
 * Validates a receipt's deep hash signature to cryptographically guarantee timestamp integrity.
 * 
 * @param receipt The receipt object previously fetched from getIrysReceipt
 * @param wallet The wallet instance to initialize Irys
 */
export async function verifyIrysReceipt(receipt: any, wallet: any): Promise<boolean> {
    const irys = await getWebIrys(wallet);
    try {
        // verifyReceipt returns a boolean indicating whether the signature check passed
        const isValid = await irys.utils.verifyReceipt(receipt);
        return isValid;
    } catch (e) {
        console.error(`[Irys] Error verifying receipt:`, e);
        return false;
    }
}

// ── Manual Node Funding ──────────────────────────────────────────────────

/**
 * Manually tops up the connected wallet's Irys node balance using standard crypto units (e.g. 0.05 SOL).
 * Automatically converts the standard amount to atomic units (lamports/wei) before funding.
 * 
 * @param amountStandard The amount of crypto to fund in standard readable units (e.g. 0.1)
 * @param wallet The wallet instance to initialize Irys
 * @param feeMultiplier Optional multiplier to prioritize the funding transaction (e.g. 1.2)
 */
export async function fundIrysNode(amountStandard: number, wallet: any, feeMultiplier?: number) {
    const irys = await getWebIrys(wallet);
    try {
        const amountAtomic = toIntegerFundAmount(irys.utils.toAtomic(amountStandard));
        console.log(`[Irys] Manually funding node with ${amountStandard} ${irys.token} (${amountAtomic.toString()} atomic)…`);

        const fundTx = await irys.fund(amountAtomic, feeMultiplier);

        console.log(`[Irys] Successfully funded ${irys.utils.fromAtomic(fundTx.quantity)} ${irys.token}`);
        return fundTx;
    } catch (e) {
        console.error(`[Irys] Error manually funding node:`, e);
        throw e;
    }
}

/**
 * Gets the current loaded balance in the Irys node.
 * 
 * @param wallet The wallet instance to initialize Irys
 * @returns The balance in standard units (e.g. SOL) as a string
 */
export async function getIrysBalance(wallet: any): Promise<string> {
    const irys = await getWebIrys(wallet);
    const atomicBalance = await irys.getLoadedBalance();
    return irys.utils.fromAtomic(atomicBalance).toString();
}

/**
 * Monitors the current loaded balance in the Irys node against a predefined standard threshold.
 * Useful for alerting a UI when a user's prepay balance falls dangerously low (e.g. < 0.1 SOL).
 * 
 * @param wallet The wallet instance to initialize Irys
 * @param thresholdStandard The threshold in standard units (e.g., 0.1) under which the function returns true.
 * @returns An object containing the current standard balance and a boolean `isBelowThreshold`.
 */
export async function checkIrysBalanceThreshold(wallet: any, thresholdStandard: number = 0.1): Promise<{
    balanceStandard: number;
    isBelowThreshold: boolean;
}> {
    const irys = await getWebIrys(wallet);
    const atomicBalance = await irys.getLoadedBalance();
    const balanceStandard = Number(irys.utils.fromAtomic(atomicBalance).toString());

    const isBelowThreshold = Math.abs(balanceStandard) <= thresholdStandard;

    if (isBelowThreshold) {
        console.warn(`[Irys] Node balance (${balanceStandard} ${irys.token}) is at or below the threshold of ${thresholdStandard}! Please fund.`);
    } else {
        console.log(`[Irys] Node balance (${balanceStandard} ${irys.token}) is healthy. Minimum threshold is ${thresholdStandard}.`);
    }

    return { balanceStandard, isBelowThreshold };
}

/**
 * Initiates a withdrawal of the user's funded node balance.
 * 
 * @param amountStandard The amount of crypto to withdraw in standard units (e.g. 0.1), or "all" to drain completely.
 * @param wallet The wallet instance to initialize Irys
 */
export async function withdrawIrysNodeBalance(amountStandard: number | "all", wallet: any) {
    const irys = await getWebIrys(wallet);
    try {
        let amountToWithdraw: any = "all";

        if (amountStandard !== "all") {
            amountToWithdraw = irys.utils.toAtomic(amountStandard);
            console.log(`[Irys] Withdrawing ${amountStandard} ${irys.token} (${amountToWithdraw.toString()} atomic)…`);
        } else {
            console.log(`[Irys] Withdrawing ALL available ${irys.token} funds…`);
        }

        const withdrawTx = await irys.withdrawBalance(amountToWithdraw);

        console.log(`[Irys] Successfully requested withdrawal for ${irys.token}.`);
        return withdrawTx;
    } catch (e) {
        console.error(`[Irys] Error withdrawing node balance:`, e);
        throw e;
    }
}

// ── General REST API ─────────────────────────────────────────────────────

/**
 * Queries the Irys general REST API for bundler information, including version and network configuration.
 *
 * @param network The target network ("mainnet" | "devnet")
 */
export async function getIrysNodeInfo(network: "mainnet" | "devnet" = "mainnet") {
    const url = network === "mainnet" ? IRYS_NODE_MAIN : IRYS_NODE_DEV;
    try {
        const response = await fetch(`${url}/info`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error(`[Irys] Failed to fetch node info:`, e);
        throw e;
    }
}

/**
 * Queries the Irys general REST API for public-facing data such as bundler public keys.
 *
 * @param network The target network ("mainnet" | "devnet")
 */
export async function getIrysNodePublic(network: "mainnet" | "devnet" = "mainnet") {
    const url = network === "mainnet" ? IRYS_NODE_MAIN : IRYS_NODE_DEV;
    try {
        const response = await fetch(`${url}/public`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error(`[Irys] Failed to fetch node public data:`, e);
        throw e;
    }
}

/**
 * Queries the Irys general REST API to check the health and operational status of the node.
 *
 * @param network The target network ("mainnet" | "devnet")
 */
export async function getIrysNodeStatus(network: "mainnet" | "devnet" = "mainnet") {
    const url = network === "mainnet" ? IRYS_NODE_MAIN : IRYS_NODE_DEV;
    try {
        const response = await fetch(`${url}/status`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        // Sometimes /status just returns 'OK' plain text instead of JSON on some Arweave/Irys nodes
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await response.json();
        } else {
            return await response.text();
        }
    } catch (e) {
        console.error(`[Irys] Failed to fetch node status:`, e);
        throw e;
    }
}

/**
 * Queries the Irys general REST API to retrieve a list of historical withdrawals for the connected wallet's token.
 * Mapping for GET /account/withdrawals/{token}?address={address}
 *
 * @param wallet The wallet instance referencing the target address and config 
 * @param network The target network ("mainnet" | "devnet")
 */
export async function getIrysAccountWithdrawals(wallet: any, network: "mainnet" | "devnet" = "mainnet") {
    // We get the WebIrys instance just to easily identify the active address and token 
    const irys = await getWebIrys(wallet);
    const url = network === "mainnet" ? IRYS_NODE_MAIN : IRYS_NODE_DEV;

    try {
        const response = await fetch(`${url}/account/withdrawals/${irys.token}?address=${irys.address}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error(`[Irys] Failed to fetch account withdrawals:`, e);
        throw e;
    }
}

/**
 * Queries the Irys general REST API to determine the cost to upload a set number of bytes using a specific token.
 * Mapping for GET /price/{token}/{size}
 *
 * @param token The token used for payment (e.g., "ethereum", "solana", "matic"). If missing, tries to extract from wallet.
 * @param sizeInBytes The total size of the data to be uploaded, expressed in bytes
 * @param wallet Optional: If the token is not passed generically, it will extract it from the WebIrys instance connected to this wallet.
 * @param network The target network ("mainnet" | "devnet")
 */
export async function getIrysUploadPrice(
    sizeInBytes: number,
    token?: string,
    wallet?: any,
    network: "mainnet" | "devnet" = "mainnet"
) {
    let resolvedToken = token;

    // If no token string is provided, attempt to derive from the wallet instance
    if (!resolvedToken && wallet) {
        const irys = await getWebIrys(wallet);
        resolvedToken = irys.token;
    }

    if (!resolvedToken) {
        throw new Error("You must provide either a 'token' string or a valid 'wallet' instance to query the price API.");
    }

    const url = network === "mainnet" ? IRYS_NODE_MAIN : IRYS_NODE_DEV;

    try {
        const response = await fetch(`${url}/price/${resolvedToken}/${sizeInBytes}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        // Irys typically returns the raw price as an atomic unit numeric string (e.g. Lamports/Wei)
        return await response.text();
    } catch (e) {
        console.error(`[Irys] Failed to fetch upload price via REST:`, e);
        throw e;
    }
}

// ── Transaction REST API ─────────────────────────────────────────────────

/**
 * Queries the Irys general REST API to retrieve full transaction metadata.
 * Mapping for GET /tx/{txId}
 * 
 * @param txId The unique ID of the transaction on Irys/Arweave
 * @param network The target network ("mainnet" | "devnet")
 */
export async function getIrysTransactionMetadata(txId: string, network: "mainnet" | "devnet" = "mainnet") {
    const url = network === "mainnet" ? IRYS_NODE_MAIN : IRYS_NODE_DEV;
    try {
        const response = await fetch(`${url}/tx/${txId}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error(`[Irys] Failed to fetch transaction metadata for ${txId}:`, e);
        throw e;
    }
}

/**
 * Queries the Irys general REST API to retrieve the current status/confirmations of a transaction.
 * Mapping for GET /tx/{txId}/status
 * 
 * @param txId The unique ID of the transaction on Irys/Arweave
 * @param network The target network ("mainnet" | "devnet")
 */
export async function getIrysTransactionStatus(txId: string, network: "mainnet" | "devnet" = "mainnet") {
    const url = network === "mainnet" ? IRYS_NODE_MAIN : IRYS_NODE_DEV;
    try {
        const response = await fetch(`${url}/tx/${txId}/status`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error(`[Irys] Failed to fetch transaction status for ${txId}:`, e);
        throw e;
    }
}

/**
 * Queries the Irys general REST API to retrieve just the uploaded tags for a transaction.
 * Mapping for GET /tx/{txId}/tags
 * 
 * @param txId The unique ID of the transaction on Irys/Arweave
 * @param network The target network ("mainnet" | "devnet")
 */
export async function getIrysTransactionTags(txId: string, network: "mainnet" | "devnet" = "mainnet") {
    const url = network === "mainnet" ? IRYS_NODE_MAIN : IRYS_NODE_DEV;
    try {
        const response = await fetch(`${url}/tx/${txId}/tags`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error(`[Irys] Failed to fetch transaction tags for ${txId}:`, e);
        throw e;
    }
}

/**
 * Queries the Irys general REST API to retrieve the raw data buffer of a transaction.
 * Mapping for GET /tx/{txId}/data
 * Note: Use with caution as this can fetch the entire raw file buffer into memory.
 * 
 * @param txId The unique ID of the transaction on Irys/Arweave
 * @param network The target network ("mainnet" | "devnet")
 */
export async function getIrysTransactionData(txId: string, network: "mainnet" | "devnet" = "mainnet") {
    const url = network === "mainnet" ? IRYS_NODE_MAIN : IRYS_NODE_DEV;
    try {
        const response = await fetch(`${url}/tx/${txId}/data`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.arrayBuffer();
    } catch (e) {
        console.error(`[Irys] Failed to fetch raw transaction data for ${txId}:`, e);
        throw e;
    }
}

// ── Chunks REST API ──────────────────────────────────────────────────────

/**
 * Manually uploads a specific data chunk to the Irys bundler for a given transaction.
 * Mapping for POST /chunks/{token}/{txid}/{offset}
 * 
 * Note: Consider using the ChunkedUploader API (uploadFileChunkedToArweave) for automatic chunk orchestration.
 * This is provided for low-level manual chunk management.
 * 
 * @param token The token used (e.g., "ethereum", "solana")
 * @param txId The unique ID of the transaction
 * @param offset The byte offset representing the position of this chunk
 * @param data The raw binary chunk data
 * @param network The target network ("mainnet" | "devnet")
 */
export async function postIrysChunk(
    token: string,
    txId: string,
    offset: number | string,
    data: ArrayBuffer | Blob | Uint8Array,
    network: "mainnet" | "devnet" = "mainnet"
) {
    const url = network === "mainnet" ? IRYS_NODE_MAIN : IRYS_NODE_DEV;
    try {
        const response = await fetch(`${url}/chunks/${token}/${txId}/${offset}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/octet-stream",
            },
            body: data as BodyInit,
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return true;
    } catch (e) {
        console.error(`[Irys] Failed to post chunk at offset ${offset} for ${txId}:`, e);
        throw e;
    }
}

/**
 * Retrieves a previously uploaded data chunk from the Irys bundler.
 * Mapping for GET /chunks/{token}/{txid}/{offset}
 * 
 * @param token The token used (e.g., "ethereum", "solana")
 * @param txId The unique ID of the transaction
 * @param offset The byte offset of the chunk to retrieve
 * @param network The target network ("mainnet" | "devnet")
 */
export async function getIrysChunk(
    token: string,
    txId: string,
    offset: number | string,
    network: "mainnet" | "devnet" = "mainnet"
) {
    const url = network === "mainnet" ? IRYS_NODE_MAIN : IRYS_NODE_DEV;
    try {
        const response = await fetch(`${url}/chunks/${token}/${txId}/${offset}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.arrayBuffer();
    } catch (e) {
        console.error(`[Irys] Failed to get chunk at offset ${offset} for ${txId}:`, e);
        throw e;
    }
}

// ── GraphQL Query Layer (Irys Guide: Querying With GraphQL) ──────────────

export const IRYS_GRAPHQL_ENDPOINT = "https://uploader.irys.xyz/graphql";

/** Shape of a single transaction node returned by the Irys GraphQL API. */
export interface IrysGqlTransaction {
    id: string;
    address: string;
    token: string;
    timestamp: number;
    tags: { name: string; value: string }[];
    receipt?: {
        deadlineHeight: number;
        signature: string;
        version: string;
    };
}

/** Shape of a single edge (node + cursor) returned by the Irys GraphQL API. */
export interface IrysGqlEdge {
    node: IrysGqlTransaction;
    cursor: string;
}

/** Full response shape from the Irys GraphQL transactions query. */
export interface IrysGqlResponse {
    data: {
        transactions: {
            edges: IrysGqlEdge[];
        };
    };
}

/** Options for building an Irys GraphQL query. */
export interface IrysGqlQueryOptions {
    /** Filter by specific transaction IDs */
    ids?: string[];
    /** Filter by wallet owner addresses */
    owners?: string[];
    /** Filter by tag name/value pairs */
    tags?: { name: string; values: string[] }[];
    /** Filter by timestamp range (milliseconds) */
    timestamp?: { from?: number; to?: number };
    /** Max results per page (max 100) */
    limit?: number;
    /** Cursor for pagination — pass the last cursor from a previous query */
    after?: string;
    /** Sort order: ASC or DESC by timestamp */
    order?: "ASC" | "DESC";
}

/**
 * Low-level GraphQL query executor for the Irys uploader endpoint.
 * Builds and sends a `transactions` query from the provided options.
 * 
 * @param options Query filters, pagination, and sorting options
 * @returns The full GraphQL response with edges containing transaction nodes
 */
export async function queryIrysGraphQL(options: IrysGqlQueryOptions = {}): Promise<IrysGqlResponse> {
    // Build the arguments string dynamically
    const args: string[] = [];

    if (options.ids?.length) {
        args.push(`ids: ${JSON.stringify(options.ids)}`);
    }
    if (options.owners?.length) {
        args.push(`owners: ${JSON.stringify(options.owners)}`);
    }
    if (options.tags?.length) {
        const tagsStr = options.tags.map(t => `{ name: ${JSON.stringify(t.name)}, values: ${JSON.stringify(t.values)} }`).join(", ");
        args.push(`tags: [${tagsStr}]`);
    }
    if (options.timestamp) {
        const tsParts: string[] = [];
        if (options.timestamp.from != null) tsParts.push(`from: ${options.timestamp.from}`);
        if (options.timestamp.to != null) tsParts.push(`to: ${options.timestamp.to}`);
        if (tsParts.length) args.push(`timestamp: { ${tsParts.join(", ")} }`);
    }
    if (options.limit != null) {
        args.push(`limit: ${Math.min(options.limit, 100)}`);
    }
    if (options.after) {
        args.push(`after: ${JSON.stringify(options.after)}`);
    }
    if (options.order) {
        args.push(`order: ${options.order}`);
    }

    const argsStr = args.length > 0 ? `(${args.join(", ")})` : "";

    const query = `
        query {
            transactions${argsStr} {
                edges {
                    node {
                        id
                        address
                        token
                        timestamp
                        tags {
                            name
                            value
                        }
                        receipt {
                            deadlineHeight
                            signature
                            version
                        }
                    }
                    cursor
                }
            }
        }
    `;

    try {
        const response = await fetch(IRYS_GRAPHQL_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
        });

        if (!response.ok) throw new Error(`GraphQL HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error(`[Irys] GraphQL query failed:`, e);
        throw e;
    }
}

/**
 * Queries all Irys transactions uploaded by a specific wallet address.
 * Useful for showing a creator's upload history on the Launchpad dashboard.
 */
export async function queryIrysByOwner(
    ownerAddress: string,
    limit = 20,
    order: "ASC" | "DESC" = "DESC",
    after?: string,
): Promise<IrysGqlEdge[]> {
    const result = await queryIrysGraphQL({ owners: [ownerAddress], limit, order, after });
    return result.data.transactions.edges;
}

/**
 * Queries Irys transactions by tag filters.
 * Extremely useful for finding all uploads from "The Lily Pad" or a specific collection.
 *
 * @example
 * // Find all Lily Pad uploads:
 * queryIrysByTags([{ name: "application-id", values: ["The Lily Pad"] }])
 *
 * // Find all PNGs from a specific collection:
 * queryIrysByTags([
 *   { name: "Content-Type", values: ["image/png"] },
 *   { name: "Collection-Name", values: ["My Collection"] },
 * ])
 */
export async function queryIrysByTags(
    tags: { name: string; values: string[] }[],
    limit = 20,
    order: "ASC" | "DESC" = "DESC",
    after?: string,
): Promise<IrysGqlEdge[]> {
    const result = await queryIrysGraphQL({ tags, limit, order, after });
    return result.data.transactions.edges;
}

/**
 * Queries Irys transactions by their specific transaction IDs.
 * Useful for batch-verifying uploads after a collection launch.
 */
export async function queryIrysByIds(ids: string[]): Promise<IrysGqlEdge[]> {
    const result = await queryIrysGraphQL({ ids });
    return result.data.transactions.edges;
}

/**
 * Queries Irys transactions within a specific timestamp range.
 * Timestamps must be in milliseconds (Irys is millisecond-accurate).
 */
export async function queryIrysByTimestamp(
    from: number,
    to: number,
    limit = 20,
    order: "ASC" | "DESC" = "DESC",
    after?: string,
): Promise<IrysGqlEdge[]> {
    const result = await queryIrysGraphQL({ timestamp: { from, to }, limit, order, after });
    return result.data.transactions.edges;
}
