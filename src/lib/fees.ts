/**
 * Unified Fee Calculation Library for The Lily Pad
 * 
 * Provides lamport-precise fee calculations using BigInt to avoid
 * floating-point precision issues in financial transactions.
 */

import { TREASURY_CONFIG, PLATFORM_WALLETS } from '@/config/treasury';

// 1 SOL = 1,000,000,000 Lamports
export const LAMPORTS_PER_SOL = 1_000_000_000n;

// Platform fee in basis points (250 = 2.5%)
export const PLATFORM_FEE_BPS = TREASURY_CONFIG.fees.marketplace.platformFee;

// Treasury address - uses config or env override
export const PLATFORM_TREASURY_ADDRESS = 
    import.meta.env.VITE_TREASURY_ADDRESS || PLATFORM_WALLETS.solana.treasury;

/**
 * Calculate the platform fee for a given price in lamports
 * @param priceLamports Price in Lamports
 * @param feeBps Fee in basis points (optional, defaults to marketplace fee)
 * @returns Fee in Lamports
 */
export function calculatePlatformFee(
    priceLamports: number | bigint, 
    feeBps: number = PLATFORM_FEE_BPS
): bigint {
    const price = BigInt(priceLamports);
    return (price * BigInt(feeBps)) / BigInt(10000);
}

/**
 * Calculate the net amount the seller/creator receives
 * @param priceLamports Price in Lamports
 * @param feeBps Fee in basis points (optional)
 * @returns Net amount in Lamports
 */
export function calculateSellerNet(
    priceLamports: number | bigint, 
    feeBps: number = PLATFORM_FEE_BPS
): bigint {
    const price = BigInt(priceLamports);
    const fee = calculatePlatformFee(price, feeBps);
    return price - fee;
}

/**
 * Convert SOL to Lamports
 * @param sol Amount in SOL
 * @returns Amount in Lamports
 */
export function solToLamports(sol: number): bigint {
    return BigInt(Math.round(sol * Number(LAMPORTS_PER_SOL)));
}

/**
 * Convert Lamports to SOL
 * @param lamports Amount in Lamports
 * @returns Amount in SOL
 */
export function lamportsToSol(lamports: bigint | number): number {
    return Number(BigInt(lamports)) / Number(LAMPORTS_PER_SOL);
}

/**
 * Format fee details for UI display
 * @param priceSol Price in SOL
 * @param feeBps Fee in basis points (optional)
 */
export function getFeeDetails(priceSol: number, feeBps: number = PLATFORM_FEE_BPS) {
    const priceLamports = solToLamports(priceSol);
    const feeLamports = calculatePlatformFee(priceLamports, feeBps);
    const netLamports = calculateSellerNet(priceLamports, feeBps);

    return {
        price: priceSol,
        priceLamports,
        fee: lamportsToSol(feeLamports),
        feeLamports,
        net: lamportsToSol(netLamports),
        netLamports,
        bps: feeBps,
        treasuryAddress: PLATFORM_TREASURY_ADDRESS,
    };
}

/**
 * Get fee breakdown for different transaction types.
 * Returns the headline fee + the internal 3-way Treasury/Team/Buyback split.
 */
export function getFeeBreakdown(
    amount: number,
    type: keyof typeof TREASURY_CONFIG.fees
) {
    const feeConfig = TREASURY_CONFIG.fees[type] as any;

    // Tiered surfaces (launchpad / secondary)
    const isTiered = 'premiumFee' in feeConfig;
    const feeBps = isTiered && amount >= 0.3 ? feeConfig.premiumFee : feeConfig.platformFee ?? 0;

    const base = getFeeDetails(amount, feeBps);

    // Internal split (only meaningful for surfaces that publish allocations)
    const teamBpsBase = feeConfig.teamAllocation ?? Math.round((feeConfig.platformFee ?? 0) * 0.125);
    const buybackBpsBase = feeConfig.buybackAllocation ?? Math.round((feeConfig.platformFee ?? 0) * 0.125);
    const scale = feeConfig.platformFee ? feeBps / feeConfig.platformFee : 1;
    const teamFee = (amount * teamBpsBase * scale) / 10000;
    const buybackFee = (amount * buybackBpsBase * scale) / 10000;
    const treasuryFee = base.fee - teamFee - buybackFee;

    return {
        ...base,
        treasuryFee,
        teamFee,
        buybackFee,
        treasuryBps: Math.max(0, feeBps - teamBpsBase * scale - buybackBpsBase * scale),
        teamBps: teamBpsBase * scale,
        buybackBps: buybackBpsBase * scale,
    };
}

/**
 * Secondary sale breakdown including creator royalty enforcement.
 * Buyer pays `price`. Returns the platform 3-way split, the royalty paid to
 * the original creator, and the seller's net proceeds.
 */
export function getSecondarySaleBreakdown(price: number, royaltyBps: number = 0) {
    const fb = getFeeBreakdown(price, 'secondary');
    const royalty = (price * royaltyBps) / 10000;
    const sellerNet = price - fb.fee - royalty;
    return {
        ...fb,
        royalty,
        royaltyBps,
        sellerNet,
    };
}


/**
 * Validate minimum transaction amount
 */
export function validateMinAmount(
    amount: number,
    type: keyof typeof TREASURY_CONFIG.minimums
): { valid: boolean; minimum: number; message?: string } {
    const minimum = TREASURY_CONFIG.minimums[type];
    
    if (amount < minimum) {
        return {
            valid: false,
            minimum,
            message: `Minimum amount is ${minimum} SOL`,
        };
    }
    
    return { valid: true, minimum };
}
