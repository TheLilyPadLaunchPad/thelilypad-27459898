/**
 * Metaplex Agent Registry — LilyPad Launchpad Agent
 *
 * Mints and verifies an onchain AI agent via the Metaplex Agent Registry SDK.
 * The agent describes the full set of launchpad backend capabilities so that
 * other agents and tools (including Claude) can discover and reason about them.
 */

import { Umi } from '@metaplex-foundation/umi';
import { fetchAsset } from '@metaplex-foundation/mpl-core';
import { publicKey as toPublicKey } from '@metaplex-foundation/umi';
import {
    mintAndSubmitAgent,
    mintAgent,
    signAndSendAgentTransaction,
    type AgentMetadata,
    type MintAndSubmitAgentResult,
    type MintAgentResponse,
    type SvmNetwork,
} from '@metaplex-foundation/mpl-agent-registry';
import { buildMetaplexMetadata } from '@/lib/metaplexMetadata';

// ---------------------------------------------------------------------------
// Agent metadata generation
// ---------------------------------------------------------------------------

const AGENT_NAME = 'LilyPad Launchpad Agent';
const AGENT_DESCRIPTION =
    'TheLilyPad Launchpad backend agent — manages NFT collection creation, ' +
    'Candy Machine deployment (config-line & hidden-settings), metadata uploads ' +
    'to Arweave/IPFS, marketplace operations, buyback programs, streaming creator ' +
    'tools, and multi-chain (Solana + Monad) support. Does NOT manage NFT music ' +
    'tile card rendering.';

/**
 * Build the agentMetadata object that is stored off-chain by the Metaplex API.
 * Lists every service the LilyPad backend exposes.
 */
export function buildAgentMetadata(baseUrl = 'https://thelilypad.app'): AgentMetadata {
    return {
        type: 'agent',
        name: AGENT_NAME,
        description: AGENT_DESCRIPTION,
        services: [
            { name: 'launchpad',  endpoint: `${baseUrl}/api/launchpad` },
            { name: 'collections', endpoint: `${baseUrl}/api/collections` },
            { name: 'candy-machine', endpoint: `${baseUrl}/api/candy-machine` },
            { name: 'hidden-settings', endpoint: `${baseUrl}/api/hidden-settings` },
            { name: 'minting',    endpoint: `${baseUrl}/api/mint` },
            { name: 'metadata',   endpoint: `${baseUrl}/api/metadata` },
            { name: 'marketplace', endpoint: `${baseUrl}/api/marketplace` },
            { name: 'buyback',    endpoint: `${baseUrl}/api/buyback` },
            { name: 'streaming',  endpoint: `${baseUrl}/api/streaming` },
            { name: 'creator-tools', endpoint: `${baseUrl}/api/creator` },
        ],
        registrations: [],
        supportedTrust: [],
    };
}

/**
 * Build the Core-asset NFT metadata JSON (uploaded to Arweave as the `uri`).
 */
export function buildAgentNftMetadata(): Record<string, unknown> {
    return buildMetaplexMetadata({
        name: AGENT_NAME,
        symbol: 'LILY',
        description: AGENT_DESCRIPTION,
        image: '',
        externalUrl: 'https://thelilypad.app',
        attributes: [
            { trait_type: 'Agent Type', value: 'Backend Launchpad' },
            { trait_type: 'Chain', value: 'Solana' },
            { trait_type: 'Features', value: 'Collections, Candy Machine, Hidden Settings, Minting, Metadata, Marketplace, Buyback, Streaming' },
            { trait_type: 'SDK', value: '@metaplex-foundation/mpl-agent-registry' },
        ],
        category: 'agent',
        creators: [],
    });
}

// ---------------------------------------------------------------------------
// Mint helpers
// ---------------------------------------------------------------------------

export interface MintLilyPadAgentParams {
    /** Network to mint on (default: solana-devnet) */
    network?: SvmNetwork;
    /** Pre-uploaded metadata URI (Core asset NFT metadata JSON on Arweave) */
    metadataUri: string;
    /** Optional override for the base URL used in service endpoints */
    baseUrl?: string;
}

/**
 * Mint the LilyPad agent in a single call (sign + submit).
 * Returns the asset address and transaction signature.
 */
export async function mintLilyPadAgent(
    umi: Umi,
    params: MintLilyPadAgentParams,
): Promise<MintAndSubmitAgentResult> {
    const { network = 'solana-devnet', metadataUri, baseUrl } = params;

    console.log(`[Agent] Minting LilyPad agent on ${network}...`);
    console.log(`[Agent] Metadata URI: ${metadataUri}`);

    const result = await mintAndSubmitAgent(
        umi,
        {}, // default API config (https://api.metaplex.com)
        {
            wallet: umi.identity.publicKey,
            network,
            name: AGENT_NAME,
            uri: metadataUri,
            agentMetadata: buildAgentMetadata(baseUrl),
        },
    );

    console.log('[Agent] Asset address:', result.assetAddress);
    console.log('[Agent] Tx signature:', Buffer.from(result.signature).toString('base64').slice(0, 24) + '...');

    return result;
}

/**
 * Mint the LilyPad agent with manual signing control.
 * Returns the unsigned transaction and pre-computed asset address.
 */
export async function mintLilyPadAgentManual(
    umi: Umi,
    params: MintLilyPadAgentParams,
): Promise<MintAgentResponse> {
    const { network = 'solana-devnet', metadataUri, baseUrl } = params;

    console.log(`[Agent] Preparing unsigned agent tx on ${network}...`);

    const mintResult = await mintAgent(
        umi,
        {},
        {
            wallet: umi.identity.publicKey,
            network,
            name: AGENT_NAME,
            uri: metadataUri,
            agentMetadata: buildAgentMetadata(baseUrl),
        },
    );

    console.log('[Agent] Unsigned tx ready. Asset address:', mintResult.assetAddress);
    return mintResult;
}

/**
 * Sign and send an unsigned agent transaction (from mintLilyPadAgentManual).
 */
export async function submitAgentTransaction(
    umi: Umi,
    mintResult: MintAgentResponse,
): Promise<Uint8Array> {
    return signAndSendAgentTransaction(umi, mintResult);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface AgentVerificationResult {
    registered: boolean;
    registrationUri?: string;
    transferHook?: unknown;
    updateHook?: unknown;
    executeHook?: unknown;
}

/**
 * Verify that an agent identity was successfully registered on a Core asset.
 */
export async function verifyAgent(
    umi: Umi,
    assetAddress: string,
): Promise<AgentVerificationResult> {
    const asset = await fetchAsset(umi, toPublicKey(assetAddress));
    const agentIdentity = (asset as any).agentIdentities?.[0];

    if (!agentIdentity) {
        return { registered: false };
    }

    return {
        registered: true,
        registrationUri: agentIdentity.uri,
        transferHook: agentIdentity.lifecycleChecks?.transfer,
        updateHook: agentIdentity.lifecycleChecks?.update,
        executeHook: agentIdentity.lifecycleChecks?.execute,
    };
}
