import { createUmi as createUmiClient } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplCandyMachine as mplCoreCandyMachine } from '@metaplex-foundation/mpl-core-candy-machine';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { arweaveUploader } from '@/integrations/arweave/umiArweaveUploader';
import { mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { mplAgentIdentity } from '@metaplex-foundation/mpl-agent-registry';
import { Umi } from '@metaplex-foundation/umi';
import { getBestRpc, getSolanaRpcList } from '@/config/solana';

/**
 * Solana Client - Centralized Umi initialization and connection management
 */

export type SolanaNetwork = 'mainnet' | 'devnet' | 'testnet';

// Wallet adapter interface (minimal subset needed)
interface WalletAdapterLike {
    publicKey: any;
    signTransaction?: (tx: any) => Promise<any>;
    signAllTransactions?: (txs: any[]) => Promise<any[]>;
    signMessage?: (msg: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Create and configure Umi client
 * Now asynchronous to allow for health-based RPC selection
 */
export async function createUmi(
    network: SolanaNetwork = 'devnet',
    wallet?: WalletAdapterLike | null
): Promise<Umi> {
    const endpoint = await getBestRpc(network as any);

    const umi = createUmiClient(endpoint)
        .use(mplCore())
        .use(mplCoreCandyMachine())
        .use(mplToolbox())
        .use(mplBubblegum())
        .use(mplAgentIdentity())
        .use(arweaveUploader());

    // Attach wallet if provided
    if (wallet) {
        umi.use(walletAdapterIdentity(wallet as any));
    }

    return umi;
}

/**
 * Get current RPC endpoint for a network
 */
export function getRpcEndpoint(network: SolanaNetwork): string {
    return getSolanaRpcList(network as any)[0];
}

/**
 * Get all RPC endpoints for failover
 */
export function getAllRpcEndpoints(network: SolanaNetwork): string[] {
    return getSolanaRpcList(network as any);
}
