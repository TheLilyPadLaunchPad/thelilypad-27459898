import type { NFT } from '../hooks/useWalletNFTs';

// Only route wallets to owner indexers that actually support their chain.
export function galleryNetwork(chain: string): string | null {
  if (chain === 'solana') return 'solana-mainnet';
  if (chain === 'robinhood') return 'robinhood-mainnet';
  return null;
}

export function collectibleKey(nft: Pick<NFT, 'contractAddress' | 'tokenId'>): string {
  return `${nft.contractAddress}:${nft.tokenId}`;
}

export function collectibleExplorer(nft: Pick<NFT, 'contractAddress' | 'tokenId' | 'isCompressed'>, chain: string): string | null {
  if (chain === 'solana') return `https://solscan.io/${nft.isCompressed ? 'asset' : 'token'}/${encodeURIComponent(nft.contractAddress)}`;
  if (chain === 'robinhood') return `https://robinhoodchain.blockscout.com/token/${encodeURIComponent(nft.contractAddress)}/instance/${encodeURIComponent(nft.tokenId)}`;
  return null;
}

export function collectiblePack(nft: Pick<NFT, 'attributes'>): string | null {
  return nft.attributes.find(({ trait_type }) => /^(pack|pack name|sticker pack)$/i.test(trait_type))?.value || null;
}

export function visibleCollectibles(nfts: NFT[], search: string, kind: string, collection: string, sort: string): NFT[] {
  const query = search.trim().toLowerCase();
  const unique = [...new Map(nfts.map(nft => [collectibleKey(nft), nft])).values()];
  return unique.filter(nft => {
    const matchesQuery = `${nft.name} ${nft.collection} ${collectiblePack(nft) || ''} ${nft.tokenId}`.toLowerCase().includes(query);
    return matchesQuery && (kind !== 'compressed' || nft.isCompressed === true) && (collection === 'all' || nft.collection === collection);
  }).sort((a, b) => sort === 'name-desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
}