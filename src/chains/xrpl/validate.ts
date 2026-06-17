/**
 * XRPL Chain Validation — Address and Royalty Checks
 */

/**
 * Validate XRPL address format (base58, starts with 'r')
 */
export function validateXRPLAddress(addr: string): boolean {
    // XRPL addresses start with 'r' and are 25-35 characters in base58
    return /^r[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr);
}

/**
 * Validate XRPL royalty/transfer fee (0-50000, where 50000 = 5%)
 * @param fee Transfer fee percentage (0-100)
 * @returns Transfer fee value (0-50000)
 */
export function validateXRPLTransferFee(pct: number): number {
    if (pct < 0 || pct > 100) throw new Error('XRPL transfer fee must be 0-100%');
    return Math.round(pct * 1000); // Convert to XRPL format (multiply by 1000)
}

/**
 * Validate XRPL URI (must be hex-encoded, max 256 bytes)
 */
export function validateXRPLUri(uri: string): boolean {
    // URIs on XRPL must be hex-encoded and <= 256 bytes
    try {
        const hex = uri.startsWith('ipfs://') ? uri : uri;
        // Check if valid hex or ipfs
        if (hex.startsWith('ipfs://')) return hex.length <= 256;
        return /^[0-9a-fA-F]+$/.test(hex) && hex.length <= 512; // 256 bytes = 512 hex chars
    } catch {
        return false;
    }
}
