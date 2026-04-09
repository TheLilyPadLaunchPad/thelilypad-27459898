import { SupportedChain } from "@/config/chains";
import { Phase, AllowlistEntry } from "./types";

/**
 * Verify if address is in allowlist
 */
export const verifyAllowlist = (address: string, allowlistEntries: any[]): boolean => {
    return allowlistEntries.some(e =>
        (e.walletAddress?.toLowerCase() === address?.toLowerCase()) ||
        (e.wallet_address?.toLowerCase() === address?.toLowerCase())
    );
};

/**
 * Check if a phase is currently live based on dates OR manual isActive flag
 */
export const isPhaseCurrentlyLive = (
    phase: Phase | null,
    collectionStatus?: string,
    hasContract?: boolean
): boolean => {
    if (!phase) return false;

    // If manually marked active, it's live
    if (phase.isActive) return true;

    // For deployed collections with "live" or "upcoming" status, default to allowing minting
    const isDeployedAndActive = hasContract && (collectionStatus === 'live' || collectionStatus === 'upcoming');

    const now = new Date();
    const startTime = phase.startTime ? new Date(phase.startTime) : null;
    const endTime = phase.endTime ? new Date(phase.endTime) : null;

    // Validate dates - if end is before start, treat as misconfigured
    const datesAreValid = !startTime || !endTime || endTime > startTime;

    if (!datesAreValid) {
        return isDeployedAndActive;
    }

    // If start time is set and we're past it
    const hasStarted = !startTime || now >= startTime;
    // If end time is set and we haven't passed it
    const hasNotEnded = !endTime || now <= endTime;

    if (startTime || endTime) {
        return hasStarted && hasNotEnded;
    }

    return isDeployedAndActive;
};

/**
 * Parse chain string to get the base chain type (e.g., 'solana-devnet' -> 'solana')
 */
export const getBaseChain = (chainStr: string): SupportedChain => {
    if (!chainStr) return 'solana';
    if (chainStr.startsWith('solana')) return 'solana';
    if (chainStr.startsWith('monad')) return 'monad';
    return 'solana'; // default
};
