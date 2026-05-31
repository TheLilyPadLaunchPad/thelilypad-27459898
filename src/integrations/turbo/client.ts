/**
 * Turbo (ArDrive) Arweave Uploader
 * ─────────────────────────────────
 * Drop-in replacement for the Irys upload backend. Uses the same user wallet
 * (Phantom / Solana) but routes uploads through Turbo's infrastructure instead
 * of the (frequently unreliable) Irys node.
 *
 * Payment model: OnDemandFunding — each upload is paid with a small SOL debit
 * from the user's connected wallet at upload time. Uploads < 100 KiB are free.
 *
 * Docs: https://docs.ardrive.io/docs/turbo/turbo-sdk/
 */

import { TurboFactory, OnDemandFunding, type SolanaWalletAdapter } from '@ardrive/turbo-sdk/web';

export type TurboTag = { name: string; value: string };

interface CachedTurbo {
    client: any;
    address: string;
}

let _cachedTurbo: CachedTurbo | null = null;

/** Clear the cached Turbo client (e.g. on wallet disconnect / network switch). */
export function clearTurboCache() {
    _cachedTurbo = null;
}

/**
 * Build a Turbo SolanaWalletAdapter from a Phantom-shaped provider.
 * Phantom already exposes `publicKey.toString()`, `signMessage`, and `signTransaction`,
 * so the adapter is effectively a pass-through with binding for `this` safety.
 */
function buildSolanaAdapter(provider: any): SolanaWalletAdapter {
    if (!provider?.publicKey) {
        throw new Error(
            'Solana wallet not connected. Please connect Phantom or another Solana wallet before uploading.'
        );
    }

    return {
        publicKey: {
            toString: () => provider.publicKey.toString(),
            // toBuffer is optional / deprecated; only surface it if the provider has it
            ...(typeof provider.publicKey.toBuffer === 'function'
                ? { toBuffer: () => provider.publicKey.toBuffer() }
                : {}),
        },
        signMessage: async (message: Uint8Array) => {
            // Phantom returns either a Uint8Array or { signature: Uint8Array }; both are accepted by Turbo.
            return await provider.signMessage(message);
        },
        signTransaction: async (transaction: any) => {
            return await provider.signTransaction(transaction);
        },
    };
}

/**
 * Get (or reuse) an authenticated Turbo client for the given wallet.
 * Cached per wallet address so a single launch flow only authenticates once.
 */
export async function getTurboClient(solanaProvider: any): Promise<any> {
    const walletAdapter = buildSolanaAdapter(solanaProvider);
    const address = walletAdapter.publicKey.toString();

    if (_cachedTurbo && _cachedTurbo.address === address) {
        return _cachedTurbo.client;
    }

    const client = TurboFactory.authenticated({
        walletAdapter,
        token: 'solana',
    });

    _cachedTurbo = { client, address };
    return client;
}

/**
 * Upload raw bytes to Arweave via Turbo.
 * Returns the full Arweave gateway URL (`https://arweave.net/<txid>`).
 *
 * When `prefunded` is true, skips OnDemandFunding so no wallet popup is
 * triggered. The caller must have called `preFundTurboForBatch` first.
 */
export async function uploadBytesViaTurbo(
    data: Uint8Array,
    tags: TurboTag[],
    solanaProvider: any,
    prefunded = false,
): Promise<string> {
    const turbo = await getTurboClient(solanaProvider);

    const uploadOpts: any = {
        fileStreamFactory: () => {
            return new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
        },
        fileSizeFactory: () => data.byteLength,
        dataItemOpts: { tags },
    };

    // Only use OnDemandFunding if NOT pre-funded.
    // When pre-funded, the Turbo credit balance already covers the upload.
    if (!prefunded) {
        uploadOpts.fundingMode = new OnDemandFunding({ topUpBufferMultiplier: 1.1 });
    }

    const response = await turbo.uploadFile(uploadOpts);

    if (!response?.id) {
        throw new Error('Turbo upload returned no transaction ID');
    }

    return `https://arweave.net/${response.id}`;
}

/**
 * Upload a File or Blob to Arweave via Turbo.
 * Convenience wrapper that reads the file to bytes and delegates to `uploadBytesViaTurbo`.
 */
export async function uploadFileViaTurbo(
    file: File | Blob,
    solanaProvider: any,
    customTags: TurboTag[] = [],
): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());

    const tags: TurboTag[] = [
        { name: 'Content-Type', value: file.type || 'application/octet-stream' },
        { name: 'application-id', value: 'The Lily Pad' },
        { name: 'generator', value: 'Lily Pad Launchpad (Turbo)' },
        ...customTags,
    ];

    return uploadBytesViaTurbo(bytes, tags, solanaProvider);
}

/**
 * Upload a JSON metadata object to Arweave via Turbo.
 */
export async function uploadMetadataViaTurbo(
    metadata: any,
    solanaProvider: any,
    customTags: TurboTag[] = [],
): Promise<string> {
    const json = JSON.stringify(metadata, null, 2);
    const bytes = new TextEncoder().encode(json);

    const tags: TurboTag[] = [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'application-id', value: 'The Lily Pad' },
        { name: 'generator', value: 'Lily Pad Launchpad (Turbo)' },
        ...customTags,
    ];

    return uploadBytesViaTurbo(bytes, tags, solanaProvider);
}

/**
 * Best-effort health check for the Turbo service.
 * Used so we can proactively detect outages and surface a helpful error.
 */
export async function isTurboReachable(): Promise<boolean> {
    try {
        const res = await fetch('https://upload.ardrive.io/info', { method: 'GET' });
        return res.ok;
    } catch {
        return false;
    }
}

// ── Batch pre-funding ────────────────────────────────────────────────────

/**
 * Pre-fund Turbo credits for an entire batch in ONE wallet signature.
 *
 * Without this, every individual `uploadBytesViaTurbo` call triggers
 * OnDemandFunding which requires a separate wallet `signMessage` popup.
 * For a 130-item collection that means 130 wallet approvals.
 *
 * By calling this ONCE before the batch:
 *   1. Calculate the total upload cost for all files
 *   2. Call `turbo.topUpWithTokens()` — ONE wallet signature
 *   3. All subsequent uploads draw from the credit balance silently
 *
 * @param files The files that will be uploaded (used to calculate total cost)
 * @param solanaProvider The wallet provider for signing the funding tx
 * @param onStatus Optional status callback for UI
 */
export async function preFundTurboForBatch(
    files: (File | Blob | { size: number })[],
    solanaProvider: any,
    onStatus?: (status: string) => void,
): Promise<void> {
    if (!files.length) return;

    const turbo = await getTurboClient(solanaProvider);

    // Calculate total bytes across all files + metadata overhead (~4KB per item)
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalWithOverhead = totalBytes + (files.length * 4096);

    onStatus?.(`Calculating storage cost for ${files.length} items (${(totalWithOverhead / 1_048_576).toFixed(1)} MB)...`);

    try {
        // Get the Winc (Turbo credits) cost for the total upload size
        const [wincForBytes] = await turbo.getUploadCosts({
            bytes: [totalWithOverhead],
        });

        const wincNeeded = wincForBytes?.winc ?? 0;

        // Check current balance
        const { winc: currentBalance } = await turbo.getBalance();

        console.log(`[Turbo] Pre-fund: need ${wincNeeded} winc, have ${currentBalance} winc`);

        if (BigInt(currentBalance) >= BigInt(wincNeeded)) {
            onStatus?.('Turbo balance sufficient — no additional funding needed.');
            return;
        }

        // Calculate SOL amount to top up (add 15% buffer)
        // topUpWithTokens accepts tokenAmount in SOL
        // We use getWincForToken to find how much SOL we need
        const deficit = BigInt(wincNeeded) - BigInt(currentBalance);

        // Turbo's topUpWithTokens handles the SOL→winc conversion internally.
        // We pass the raw token amount — Turbo will convert and sign ONE tx.
        onStatus?.('Funding Turbo credits (1 wallet signature for all uploads)...');

        await turbo.topUpWithTokens({
            tokenAmount: wincToApproxSol(Number(deficit)),
        });

        onStatus?.('Turbo credits funded — uploads will proceed without further signing.');
        console.log('[Turbo] Pre-fund complete. Subsequent uploads will be silent.');
    } catch (err: any) {
        // If topUpWithTokens fails (user rejected, network error), fall back to
        // per-upload OnDemandFunding. Log a warning so devs know what happened.
        console.warn('[Turbo] Pre-fund failed, falling back to per-upload funding:', err.message);
        onStatus?.('Pre-funding skipped — each upload will prompt individually.');
    }
}

/**
 * Rough winc-to-SOL conversion. Turbo credits ("winc") map approximately
 * to USD micro-cents; 1 SOL ≈ various amounts of winc depending on
 * SOL price. This provides a conservative estimate with a 15% buffer.
 */
function wincToApproxSol(winc: number): number {
    // Turbo's conversion rate varies with SOL price.
    // A conservative approach: request slightly more than needed.
    // topUpWithTokens will calculate the exact conversion server-side.
    // We use 0.001 SOL as a minimum to avoid dust transactions.
    const MIN_SOL = 0.001;
    // Rough estimate: 1 SOL ≈ 5_000_000_000 winc (varies with market price)
    // Add 15% buffer
    const approxSol = (winc / 5_000_000_000) * 1.15;
    return Math.max(MIN_SOL, approxSol);
}
