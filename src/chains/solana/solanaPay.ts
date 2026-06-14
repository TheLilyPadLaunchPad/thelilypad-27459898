/**
 * Solana Pay integration
 *
 * Wraps the existing tip / shop SOL transfer intents in the Solana Pay URL spec
 * (`solana:<recipient>?amount=...&reference=...&memo=...&label=...&message=...`)
 * so mobile wallets (Phantom, Backpack, Solflare) can scan a QR and approve.
 *
 * The protocol memo format used by the rest of the app
 * (`TheLilyPad:v1:<action>:<meta>`) is preserved inside the `memo` field, so a
 * Pay-driven tx is indistinguishable from a connected-wallet tx for downstream
 * analytics, earnings attribution, and explorer search.
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { encodeURL, createQR } from '@solana/pay';
import type { Address } from '@solana/kit';
import QRCode from 'qrcode';

// Cast a base58 pubkey string to the branded `Address` type @solana/pay expects.
const asAddress = (s: string) => s as unknown as Address;
import { buildProtocolMemo, type ProtocolAction } from '@/lib/solanaProtocol';

export interface SolanaPayParams {
    /** Destination wallet (creator, shop treasury, etc.) */
    recipient: string;
    /** Amount in SOL */
    amountSol: number;
    /** Protocol action — same enum the on-chain memo uses */
    action: ProtocolAction;
    /** Short label shown in the wallet (e.g. "The Lily Pad") */
    label?: string;
    /** One-line message shown in the wallet (e.g. "Tip @creator") */
    message?: string;
    /** Optional protocol-memo metadata */
    meta?: Record<string, string>;
}

export interface SolanaPayIntent {
    /** `solana:` URL string — paste into wallet or render as QR */
    url: string;
    /** Unique reference pubkey (base58) for reconciliation */
    reference: string;
    /** Memo string embedded in the tx (matches LilyPad protocol format) */
    memo: string;
}

/**
 * Build a Solana Pay URL plus a fresh reference key.
 *
 * The reference key is unique per intent and lets us poll the chain (via
 * `getSignaturesForAddress`) to detect the matching transaction without
 * trusting any client-reported signature.
 */
export function buildSolanaPayIntent(params: SolanaPayParams): SolanaPayIntent {
    const reference = Keypair.generate().publicKey;
    const memo = buildProtocolMemo(params.action, {
        amount: params.amountSol.toString(),
        ref: reference.toBase58().slice(0, 8),
        ...(params.meta ?? {}),
    });

    // Validate recipient is a real pubkey before encoding
    new PublicKey(params.recipient);

    const url = encodeURL({
        recipient: asAddress(params.recipient),
        amount: params.amountSol,
        reference: asAddress(reference.toBase58()),
        label: params.label ?? 'The Lily Pad',
        message: params.message,
        memo,
    });

    return {
        url: url.toString(),
        reference: reference.toBase58(),
        memo,
    };
}

/**
 * Render a Solana Pay URL as a PNG data URL (works in <img src=...>).
 *
 * Uses the `qrcode` library directly — `@solana/pay`'s `createQR` returns a
 * browser-only `QRCodeStyling` instance that's painful to embed in React.
 */
export async function buildSolanaPayQrDataUrl(
    url: string,
    size = 320,
): Promise<string> {
    return QRCode.toDataURL(url, {
        width: size,
        margin: 1,
        color: {
            // Mint green on dark to match Lily Pad theme
            dark: '#0a1f15',
            light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
    });
}

/**
 * Return the @solana/pay native QR object (animated, styled). Useful if a
 * consumer wants advanced styling instead of the plain PNG.
 */
export function buildStyledPayQr(url: string, size = 320) {
    return createQR(url, size, 'transparent');
}
