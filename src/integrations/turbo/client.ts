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
 * Mirrors the shape of `irys.upload(bytes, { tags })` so callers can be
 * swapped with minimal changes.
 */
export async function uploadBytesViaTurbo(
    data: Uint8Array,
    tags: TurboTag[],
    solanaProvider: any,
): Promise<string> {
    const turbo = await getTurboClient(solanaProvider);

    const response = await turbo.uploadFile({
        // Web uploader expects a ReadableStream or Buffer-producing factory.
        fileStreamFactory: () => {
            // Build a one-shot ReadableStream from the bytes (cannot reuse across retries).
            return new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
        },
        fileSizeFactory: () => data.byteLength,
        dataItemOpts: { tags },
        // Per-upload OnDemandFunding: if the user has no Turbo credit balance,
        // pay the exact amount (+10% buffer) directly from their SOL wallet.
        fundingMode: new OnDemandFunding({ topUpBufferMultiplier: 1.1 }),
    });

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
