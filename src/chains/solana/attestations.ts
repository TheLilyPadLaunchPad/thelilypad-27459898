/**
 * Client helpers for The Lily Pad verified-creator attestations.
 *
 * The on-chain attestation is currently a memo transaction signed by the
 * platform issuer wallet (see `supabase/functions/attest-creator`). The tx
 * signature is the canonical attestation identifier and is what the rest of
 * the app stores on `user_profiles.verification_attestation`.
 */

import { supabase } from '@/integrations/supabase/client';

export interface AttestationInfo {
    signature: string;
    network: 'devnet' | 'mainnet-beta';
    explorerUrl: string;
}

export function getExplorerUrl(signature: string, network: 'devnet' | 'mainnet-beta' = 'devnet') {
    const cluster = network === 'devnet' ? '?cluster=devnet' : '';
    return `https://solscan.io/tx/${signature}${cluster}`;
}

/** Admin-only: issue a verified-creator attestation. */
export async function attestCreator(params: {
    target_user_id: string;
    wallet: string;
    tier?: number;
    network?: 'devnet' | 'mainnet-beta';
}): Promise<AttestationInfo> {
    const { data, error } = await supabase.functions.invoke('attest-creator', { body: params });
    if (error) throw new Error(error.message);
    if (!data?.signature) throw new Error('No signature returned');
    return {
        signature: data.signature,
        network: data.network,
        explorerUrl: data.explorer ?? getExplorerUrl(data.signature, data.network),
    };
}

/** Admin-only: revoke a previously issued attestation. */
export async function revokeAttestation(params: {
    target_user_id: string;
    reason?: string;
    network?: 'devnet' | 'mainnet-beta';
}): Promise<{ signature: string; network: string }> {
    const { data, error } = await supabase.functions.invoke('revoke-attestation', { body: params });
    if (error) throw new Error(error.message);
    return data;
}
