interface ListingIdentifiers {
  asset_id?: string | null;
  nft_token_id?: string | null;
  collection?: { contract_address: string | null };
}

/** Core approvals use the individual asset address, never the collection address. */
export function getNFTListingIdentifier(nft: ListingIdentifiers, chain: string): string | null {
  return chain === 'solana'
    ? nft.asset_id || nft.nft_token_id || null
    : nft.collection?.contract_address || null;
}