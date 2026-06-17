/**
 * XRPL Client - WebSocket client factory
 */

import { Client, Wallet } from 'xrpl';
import type { XRPLNetwork } from './types';

export type XRPLNetworkType = XRPLNetwork;

/**
 * Get XRPL WebSocket endpoint for network
 */
export function getXRPLEndpoint(network: XRPLNetwork): string {
    switch (network) {
        case 'mainnet':
            return 'wss://xrplcluster.com';
        case 'testnet':
            return 'wss://s.altnet.rippletest.net:51233';
        default:
            throw new Error(`Unsupported XRPL network: ${network}`);
    }
}

/**
 * Get XRPL HTTP endpoint for network (fallback)
 */
export function getXRPLHttpEndpoint(network: XRPLNetwork): string {
    switch (network) {
        case 'mainnet':
            return 'https://xrplcluster.com';
        case 'testnet':
            return 'https://s.altnet.rippletest.net:51234';
        default:
            throw new Error(`Unsupported XRPL network: ${network}`);
    }
}

/**
 * Create XRPL client
 */
export async function createXRPLClient(network: XRPLNetwork = 'testnet'): Promise<Client> {
    const endpoint = getXRPLEndpoint(network);
    const client = new Client(endpoint);
    await client.connect();
    return client;
}

/**
 * Create XRPL wallet from seed
 */
export function createXRPLWallet(seed: string): Wallet {
    return Wallet.fromSeed(seed);
}

/**
 * Generate new XRPL wallet
 */
export function generateXRPLWallet(): Wallet {
    return Wallet.generate();
}

/**
 * Get network type from string
 */
export function getXRPLNetwork(network: string): XRPLNetwork {
    if (network === 'mainnet' || network === 'xrpl') return 'mainnet';
    if (network === 'testnet' || network === 'xrpl-testnet') return 'testnet';
    return 'testnet'; // Default to testnet for safety
}
