export const PREVIEW_COLLECTION_LIMIT = 10;
export const PREVIEW_PER_COLLECTION_LIMIT = 10;

export interface HoldingsGroup<T> {
  key: string;
  items: T[];
  total: number;
}

/**
 * Overview of a wallet's holdings: at most 10 collections, at most 10 NFTs each.
 * Collections with the most NFTs come first.
 */
export function previewHoldings<T>(
  nfts: T[],
  groupKey: (nft: T) => string,
  maxCollections = PREVIEW_COLLECTION_LIMIT,
  maxPerCollection = PREVIEW_PER_COLLECTION_LIMIT,
): { groups: HoldingsGroup<T>[]; totalCollections: number } {
  const map = new Map<string, T[]>();
  for (const nft of nfts) {
    const key = groupKey(nft) || "uncategorized";
    const list = map.get(key);
    if (list) list.push(nft);
    else map.set(key, [nft]);
  }
  const all = [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  return {
    totalCollections: all.length,
    groups: all.slice(0, maxCollections).map(([key, items]) => ({
      key,
      items: items.slice(0, maxPerCollection),
      total: items.length,
    })),
  };
}
