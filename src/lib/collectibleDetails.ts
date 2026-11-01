import type { NFT } from '../hooks/useWalletNFTs';

export function safeCollectibleUrl(value: string | undefined): string | null {
  if (!value) return null;
  const resolved = value.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${value.slice(7).replace(/^ipfs\//, '')}` : value.startsWith('ar://') ? `https://arweave.net/${value.slice(5)}` : value;
  try {
    const url = new URL(resolved);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

export function collectibleMetadata(nft: NFT): unknown {
  return nft.rawMetadata || { name: nft.name, description: nft.description, image: nft.image, attributes: nft.attributes };
}

export function activeCollectibleListing(listing: { status: string; expires_at: string | null }, now = Date.now()): boolean {
  return listing.status === 'active' && (!listing.expires_at || Date.parse(listing.expires_at) > now);
}

export function collectibleListingUrl(id: string): string {
  return `/marketplace?listing=${encodeURIComponent(id)}`;
}