import { SupportedChain } from "@/config/chains";

/**
 * PayloadMapper - Arweave-Only Metadata Resolution
 *
 * All NFT assets are stored permanently on Arweave via Irys.
 * No secondary Supabase storage project is used.
 */

export interface CollectionStorageInfo {
    /** Arweave Root URI */
    rootUri: string;
    /** Arweave Metadata URI for a specific token */
    itemMetadataUri: (tokenId: string | number) => string;
    /** Arweave Image URI for a specific token */
    itemImageUri: (tokenId: string | number, extension?: string) => string;
}

/**
 * Get storage info for a collection using Arweave URIs.
 *
 * @param collectionId  Collection ID (used for DB lookups, not storage paths)
 * @param arweaveCid    Arweave root CID or Manifest ID
 */
export function getCollectionStorageInfo(collectionId: string, arweaveCid?: string): CollectionStorageInfo {
    const arweaveBase = arweaveCid ? `https://arweave.net/${arweaveCid}` : '';

    return {
        rootUri: arweaveBase ? `${arweaveBase}/` : '',
        itemMetadataUri: (tokenId) => arweaveBase ? `${arweaveBase}/${tokenId}.json` : '',
        itemImageUri: (tokenId, extension = 'png') => arweaveBase ? `${arweaveBase}/${tokenId}.${extension}` : '',
    };
}

/**
 * Chain-specific Payload configuration
 */
export const CHAIN_PAYLOAD_CONFIG = {
    solana: {
        strategy: 'arweave',
        requiresIndividualUpload: true,
    },
    monad: {
        strategy: 'arweave',
        requiresIndividualUpload: true,
    }
};

/**
 * Get the Root URI string for a specific chain's metadata resolution.
 * Returns Arweave URI when CID is available, empty string otherwise.
 */
export function getChainRootUri(chain: SupportedChain, collectionId: string, arweaveCid?: string): string {
    const info = getCollectionStorageInfo(collectionId, arweaveCid);
    return info.rootUri;
}
