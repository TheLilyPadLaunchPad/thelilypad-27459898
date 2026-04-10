import { createUmi as createUmiClient } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplCandyMachine as mplCoreCandyMachine } from '@metaplex-foundation/mpl-core-candy-machine';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { Umi } from '@metaplex-foundation/umi';

/**
 * Solana Client - Centralized Umi initialization and connection management
 */

// RPC endpoints by network
// Public endpoints are often rate-limited; switching to a dedicated provider is recommended for production.
const RPC_ENDPOINTS = {
    mainnet: [
        'https://api.mainnet-beta.solana.com',
        'https://solana-mainnet.g.alchemy.com/v2/demo',
    ],
    devnet: [
        'https://api.devnet.solana.com',
        'https://devnet.helius-rpc.com/?api-key=demo',
        'https://solana-devnet.g.alchemy.com/v2/demo',
    ],
} as const;

export type SolanaNetwork = 'mainnet' | 'devnet';

// Wallet adapter interface (minimal subset needed)
interface WalletAdapterLike {
    publicKey: any;
    signTransaction?: (tx: any) => Promise<any>;
    signAllTransactions?: (txs: any[]) => Promise<any[]>;
    signMessage?: (msg: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Create and configure Umi client
 */
export function createUmi(
    network: SolanaNetwork = 'devnet',
    wallet?: WalletAdapterLike | null
): Umi {
    const endpoint = RPC_ENDPOINTS[network][0]; // Use primary RPC

    const umi = createUmiClient(endpoint)
        .use(mplCore())
        .use(mplCoreCandyMachine())
        .use(mplToolbox())
        .use(mplBubblegum())
        .use(irysUploader());

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
    return RPC_ENDPOINTS[network][0];
}

/**
 * Get all RPC endpoints for failover
 */
export function getAllRpcEndpoints(network: SolanaNetwork): string[] {
    return [...RPC_ENDPOINTS[network]];
}
