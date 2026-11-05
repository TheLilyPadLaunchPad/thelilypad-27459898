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

export interface TraitOption {
  trait_type: string;
  values: string[];
}

/** Distinct trait types and their values across a set of collectibles, for filter menus. */
export function collectibleTraits(nfts: Pick<NFT, 'attributes'>[]): TraitOption[] {
  const byType = new Map<string, Set<string>>();
  for (const nft of nfts) {
    for (const attr of nft.attributes) {
      if (!attr.trait_type) continue;
      const set = byType.get(attr.trait_type) || new Set<string>();
      set.add(attr.value);
      byType.set(attr.trait_type, set);
    }
  }
  return [...byType.entries()]
    .map(([trait_type, values]) => ({ trait_type, values: [...values].sort() }))
    .sort((a, b) => a.trait_type.localeCompare(b.trait_type));
}

export function visibleCollectibles(
  nfts: NFT[],
  search: string,
  kind: string,
  collection: string,
  sort: string,
  traitType: string = 'all',
  traitValue: string = 'all',
): NFT[] {
  const query = search.trim().toLowerCase();
  const unique = [...new Map(nfts.map(nft => [collectibleKey(nft), nft])).values()];
  return unique.filter(nft => {
    const matchesQuery = `${nft.name} ${nft.collection} ${collectiblePack(nft) || ''} ${nft.tokenId}`.toLowerCase().includes(query);
    const matchesTrait = traitType === 'all' ||
      nft.attributes.some(a => a.trait_type === traitType && (traitValue === 'all' || a.value === traitValue));
    return matchesQuery && matchesTrait && (kind !== 'compressed' || nft.isCompressed === true) && (collection === 'all' || nft.collection === collection);
  }).sort((a, b) => sort === 'name-desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
}