// Re-use central config
import { SupportedChain, CHAINS } from '@/config/chains';

export const getCurrencySymbol = (chain: string): string => {
  const normalized = (chain || '').toLowerCase();
  if (normalized.includes('monad')) return 'MON';
  return 'SOL';
};

export const getCurrencyIcon = (chain: string): string => {
  const normalized = (chain || '').toLowerCase();
  if (normalized.includes('monad')) return '◈';
  return '◎';
};

export const formatPriceWithCurrency = (
  price: string | number | null | undefined,
  chain: string
): string => {
  if (price === null || price === undefined) return 'TBA';
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice) || numPrice === 0) return 'Free';
  return `${numPrice} ${getCurrencySymbol(chain)}`;
};

export const getExplorerUrl = (chain: string, network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'): string => {
  const baseChain = (chain || '').split('-')[0] as SupportedChain;
  const config = CHAINS[baseChain] || CHAINS.solana;
  const net = network === 'testnet' ? 'testnet' : network === 'devnet' ? 'devnet' : 'mainnet';
  return config.networks[net as keyof typeof config.networks]?.explorer || config.networks.testnet.explorer;
};

export const getTxExplorerUrl = (
  txHash: string,
  chain: string,
  network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'
): string => {
  const baseChain = (chain || '').split('-')[0] as SupportedChain;
  const config = CHAINS[baseChain] || CHAINS.solana;
  const net = (network === 'testnet' || network === 'devnet') ? 'testnet' : 'mainnet';
  const explorer = config.networks[net as keyof typeof config.networks]?.explorer || config.networks.testnet.explorer;

  if (baseChain === 'solana') {
    const cluster = net === 'testnet' ? '?cluster=devnet' : '';
    return `${explorer}/tx/${txHash}${cluster}`;
  }
  return `${explorer}/tx/${txHash}`;
};

export const isSolanaChain = (chain: string): boolean => {
  const normalizedChain = (chain || '').toLowerCase();
  if (!normalizedChain) return true;
  return normalizedChain.includes('solana');
};

export const isTestnet = (chain: string): boolean => {
  const normalizedChain = (chain || '').toLowerCase();
  return normalizedChain.includes('testnet') ||
    normalizedChain.includes('devnet');
};

export const getNetworkDisplayName = (chain: string, network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet'): string => {
  const baseChain = (chain || '').split('-')[0] as SupportedChain;
  const config = CHAINS[baseChain] || CHAINS.solana;
  const netLabel = network === 'mainnet' ? 'Mainnet' : network === 'devnet' ? 'Devnet' : 'Testnet';
  return `${config.name} ${netLabel}`;
};

export const getCollectionPrice = (collection: any): string => {
  if (!collection) return "TBA";
  const phases = collection.phases;
  if (!Array.isArray(phases) || phases.length === 0) return "TBA";

  const publicPhase = phases.find((p: any) => p.id === "public" || p.id === "public-mint") || phases[0];
  const currency = getCurrencySymbol(collection.chain || collection.blockchain);

  if (!publicPhase?.price || parseFloat(publicPhase.price) === 0) return "Free";
  return `${publicPhase.price} ${currency}`;
};
