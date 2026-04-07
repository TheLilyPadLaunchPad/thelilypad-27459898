import { useWallet } from '@/providers/WalletProvider';
import { getCurrencySymbol, getTxExplorerUrl, getExplorerUrl } from '@/lib/chainUtils';
import type { SupportedChain } from '@/config/chains';

export function useChainCurrency() {
  const { chainType, network } = useWallet();

  const resolvedChain = (chainType || 'solana') as SupportedChain;
  const resolvedNetwork = (network || 'devnet') as 'mainnet' | 'testnet' | 'devnet';

  const symbol = getCurrencySymbol(resolvedChain);

  const currencyFor = (chain: string | null | undefined): string =>
    getCurrencySymbol(chain || resolvedChain);

  const formatPrice = (price: number | string | null | undefined, chain?: string): string => {
    const num = typeof price === 'string' ? parseFloat(price) : (price ?? 0);
    if (!price || isNaN(num) || num === 0) return 'Free';
    return `${num} ${currencyFor(chain)}`;
  };

  const txUrl = (hash: string, chain?: string): string =>
    getTxExplorerUrl(hash, chain || resolvedChain, resolvedNetwork);

  const addressUrl = (address: string, chain?: string): string => {
    const c = (chain || resolvedChain) as SupportedChain;
    const base = getExplorerUrl(c, resolvedNetwork);
    const cluster = resolvedNetwork !== 'mainnet' ? '?cluster=devnet' : '';
    return `${base}/address/${address}${cluster}`;
  };

  return {
    symbol,
    chain: resolvedChain,
    network: resolvedNetwork,
    currencyFor,
    formatPrice,
    txUrl,
    addressUrl,
    isMonad: resolvedChain === 'monad',
    isSolana: resolvedChain === 'solana',
  };
}
