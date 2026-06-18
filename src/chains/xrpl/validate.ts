/**
 * XRPL Chain Validation — Address, Royalty, and URI Checks
 */

/**
 * Validate XRPL address format (base58, starts with 'r')
 */
export function validateXRPLAddress(addr: string): boolean {
    return /^r[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr);
}

/**
 * Convert a percent value (0–50) to the XRPL TransferFee integer (0–50000).
 * Per XLS-20, TransferFee max is 50000 == 50%. 1 unit = 0.001%.
 *
 * @param pct Transfer fee percent (0–50)
 * @returns TransferFee integer (0–50000)
 */
export function validateXRPLTransferFee(pct: number): number {
    if (!Number.isFinite(pct) || pct < 0 || pct > 50) {
        throw new Error('XRPL transfer fee must be between 0% and 50%');
    }
    return Math.round(pct * 1000);
}

/**
 * Validate XRPL URI: must be hex-encoded on-chain, max 256 bytes (= 512 hex chars).
 * Accepts raw strings (ipfs://, https://, ar://) — caller is responsible for hex-encoding.
 */
export function validateXRPLUri(uri: string): boolean {
    if (!uri || typeof uri !== 'string') return false;
    // If already hex, check length cap directly.
    if (/^[0-9a-fA-F]+$/.test(uri)) return uri.length <= 512 && uri.length % 2 === 0;
    // Otherwise, check the UTF-8 byte length of the raw string.
    try {
        const byteLen = new TextEncoder().encode(uri).length;
        return byteLen <= 256;
    } catch {
        return false;
    }
}
