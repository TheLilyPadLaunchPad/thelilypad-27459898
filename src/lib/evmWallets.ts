/**
 * EVM wallet helpers (Monad, Robinhood Chain).
 *
 * Discovers injected EIP-1193 providers (EIP-6963 where available, plus the
 * legacy `window.ethereum` / `window.phantom.ethereum` fallbacks), connects an
 * account and makes sure the wallet is on the requested network — adding the
 * network first when the wallet does not know it yet.
 */

export interface EvmProviderInfo {
    id: string;
    name: string;
    icon?: string;
    provider: any;
}

export interface EvmChainParams {
    chainId: number;
    chainName: string;
    rpcUrls: string[];
    blockExplorerUrls?: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
}

export interface EvmConnectResult {
    address: string;
    chainId: number;
    providerName: string;
    provider: any;
}

const toHexChainId = (chainId: number) => `0x${chainId.toString(16)}`;

/** Discover injected EVM wallets. Returns an empty list when none are present. */
export function discoverEvmProviders(timeoutMs = 300): Promise<EvmProviderInfo[]> {
    if (typeof window === 'undefined') return Promise.resolve([]);

    return new Promise((resolve) => {
        const found = new Map<string, EvmProviderInfo>();

        const onAnnounce = (event: any) => {
            const detail = event?.detail;
            if (!detail?.provider) return;
            const id = detail.info?.rdns || detail.info?.uuid || detail.info?.name;
            if (!id || found.has(id)) return;
            found.set(id, {
                id,
                name: detail.info?.name || 'Wallet',
                icon: detail.info?.icon,
                provider: detail.provider,
            });
        };

        window.addEventListener('eip6963:announceProvider', onAnnounce as EventListener);
        window.dispatchEvent(new Event('eip6963:requestProvider'));

        setTimeout(() => {
            window.removeEventListener('eip6963:announceProvider', onAnnounce as EventListener);

            const anyWindow = window as any;
            const legacy: Array<[string, any]> = [
                ['phantom', anyWindow.phantom?.ethereum],
                ['injected', anyWindow.ethereum],
            ];
            for (const [id, provider] of legacy) {
                if (provider && !Array.from(found.values()).some((p) => p.provider === provider)) {
                    found.set(id, {
                        id,
                        name: provider.isPhantom
                            ? 'Phantom'
                            : provider.isMetaMask
                                ? 'MetaMask'
                                : provider.isRabby
                                    ? 'Rabby'
                                    : 'Browser Wallet',
                        provider,
                    });
                }
            }

            resolve(Array.from(found.values()));
        }, timeoutMs);
    });
}

/** True when at least one injected EVM wallet is available. */
export async function hasEvmWallet(): Promise<boolean> {
    return (await discoverEvmProviders()).length > 0;
}

/** True when Phantom is installed (Solana side). */
export function isPhantomInstalled(): boolean {
    if (typeof window === 'undefined') return false;
    const anyWindow = window as any;
    return Boolean(anyWindow.phantom?.solana?.isPhantom || anyWindow.solana?.isPhantom);
}

/**
 * Connect an injected EVM wallet and make sure it is on `chain`.
 * Throws a plain-language Error the UI can show directly.
 */
export async function connectEvmChain(
    chain: EvmChainParams,
    preferredProvider?: any,
): Promise<EvmConnectResult> {
    const providers = await discoverEvmProviders();
    const picked: EvmProviderInfo | undefined = preferredProvider
        ? { id: 'preferred', name: 'Wallet', provider: preferredProvider }
        : providers[0];

    if (!picked?.provider) {
        throw new Error(
            'No compatible wallet found. Install MetaMask, Rabby or the Robinhood Wallet browser extension and try again.',
        );
    }

    const provider = picked.provider;
    const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
    const address = accounts?.[0];
    if (!address) throw new Error('Your wallet did not return an account.');

    const hexChainId = toHexChainId(chain.chainId);
    const current: string = await provider.request({ method: 'eth_chainId' });

    if (String(current).toLowerCase() !== hexChainId.toLowerCase()) {
        try {
            await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: hexChainId }],
            });
        } catch (err: any) {
            // 4902 = chain unknown to the wallet. Add it, then switch.
            const code = err?.code ?? err?.data?.originalError?.code;
            if (code === 4902 || code === -32603) {
                await provider.request({
                    method: 'wallet_addEthereumChain',
                    params: [
                        {
                            chainId: hexChainId,
                            chainName: chain.chainName,
                            rpcUrls: chain.rpcUrls,
                            blockExplorerUrls: chain.blockExplorerUrls,
                            nativeCurrency: chain.nativeCurrency,
                        },
                    ],
                });
            } else if (code === 4001) {
                throw new Error(`Network switch to ${chain.chainName} was cancelled.`);
            } else {
                throw new Error(err?.message || `Could not switch to ${chain.chainName}.`);
            }
        }
    }

    return { address, chainId: chain.chainId, providerName: picked.name, provider };
}

/** Native-token balance (in whole units, 4 dp) for an EVM address. */
export async function getEvmBalance(provider: any, address: string): Promise<string | null> {
    try {
        const hex: string = await provider.request({
            method: 'eth_getBalance',
            params: [address, 'latest'],
        });
        const wei = BigInt(hex);
        return (Number(wei / 10n ** 12n) / 1_000_000).toFixed(4);
    } catch {
        return null;
    }
}
