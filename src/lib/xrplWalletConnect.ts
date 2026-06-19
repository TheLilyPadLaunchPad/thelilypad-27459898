/**
 * Non-custodial XRPL wallet connectors.
 *
 * Supports browser-extension wallets where the user holds their own keys:
 *  - Crossmark (https://crossmark.io) via @crossmarkio/sdk
 *  - GemWallet (https://gemwallet.app)  via @gemwallet/api
 *
 * No seeds, no custody — the wallet signs in its own UI.
 */

export type XRPLWalletProvider = 'crossmark' | 'gem' | 'cold';

export interface XRPLConnectResult {
    provider: XRPLWalletProvider;
    address: string;
    network: 'mainnet' | 'testnet';
}

export async function connectCrossmark(): Promise<XRPLConnectResult> {
    const mod: any = await import('@crossmarkio/sdk');
    const sdk = mod.default ?? mod;

    const isInstalled = sdk?.sync?.isInstalled?.() ?? sdk?.methods?.isInstalled?.();
    if (isInstalled === false) {
        throw new Error('Crossmark extension not detected. Install it from https://crossmark.io');
    }

    const res = await sdk.methods.signInAndWait();
    const address: string | undefined =
        res?.response?.data?.address ||
        res?.data?.address ||
        res?.address;
    if (!address) throw new Error('Crossmark did not return an address');

    const networkRaw: string =
        res?.response?.data?.network ||
        res?.data?.network ||
        'mainnet';
    const network: 'mainnet' | 'testnet' =
        /test/i.test(networkRaw) ? 'testnet' : 'mainnet';

    return { provider: 'crossmark', address, network };
}

export async function connectGemWallet(): Promise<XRPLConnectResult> {
    const gem: any = await import('@gemwallet/api');

    const installed = await gem.isInstalled();
    if (!installed?.result?.isInstalled) {
        throw new Error('GemWallet extension not detected. Install it from https://gemwallet.app');
    }

    const addrRes = await gem.getAddress();
    const address: string | undefined = addrRes?.result?.address;
    if (!address) throw new Error('GemWallet did not return an address (user rejected?)');

    const netRes = await gem.getNetwork();
    const networkRaw: string = netRes?.result?.network || 'Mainnet';
    const network: 'mainnet' | 'testnet' =
        /test/i.test(networkRaw) ? 'testnet' : 'mainnet';

    return { provider: 'gem', address, network };
}

export async function connectColdStorage(address: string, network: 'mainnet' | 'testnet' = 'mainnet'): Promise<XRPLConnectResult> {
    // Validate XRPL address format (starts with 'r' and is 25-35 characters, base58)
    if (!address || typeof address !== 'string') {
        throw new Error('Address is required');
    }

    // Basic XRPL address validation
    if (!address.startsWith('r')) {
        throw new Error('Invalid XRPL address: must start with "r"');
    }

    if (address.length < 25 || address.length > 35) {
        throw new Error('Invalid XRPL address: must be 25-35 characters');
    }

    // Base58 character check (XRPL uses base58)
    const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    for (const char of address) {
        if (!base58Chars.includes(char)) {
            throw new Error('Invalid XRPL address: contains invalid characters');
        }
    }

    return { provider: 'cold', address, network };
}

export async function connectXRPLWallet(provider: XRPLWalletProvider, address?: string, network?: 'mainnet' | 'testnet'): Promise<XRPLConnectResult> {
    if (provider === 'crossmark') return connectCrossmark();
    if (provider === 'gem') return connectGemWallet();
    if (provider === 'cold') {
        if (!address) throw new Error('Address is required for cold storage connection');
        return connectColdStorage(address, network);
    }
    throw new Error(`Unknown XRPL wallet provider: ${provider}`);
}
