/**
 * Monad NFT Metadata — Real Irys uploads for EVM-compatible ERC-721 JSON
 *
 * Uses the shared Irys client (src/integrations/irys/client.ts) for permanent
 * Arweave storage. No more mocks — all uploads go through the real pipeline.
 */

import { uploadToArweave, uploadMetadataToArweave } from '@/integrations/arweave/legacyClient';

export interface ERC721Attribute {
    trait_type: string;
    value: string | number;
    display_type?: string;
}

export interface ERC721Metadata {
    name: string;
    description: string;
    image: string;
    external_url?: string;
    attributes?: ERC721Attribute[];
    animation_url?: string;
    properties?: {
        category?: string;
        files?: { uri: string; type: string }[];
    };
}

/**
 * Upload a single image file to Arweave via the shared Irys client.
 * Returns the Arweave URI (https://arweave.net/<id>)
 */
export async function uploadMonadImage(
    file: File,
    wallet: { address: string | null; chainType: string; network: string }
): Promise<string> {
    console.log(`[Monad/Irys] Uploading image: ${file.name} (${file.size} bytes)`);
    return uploadToArweave(file, wallet, false, undefined, undefined, [
        { name: "App-Name", value: "TheLilyPad" },
        { name: "Chain", value: "monad" },
    ]);
}

/**
 * Upload ERC-721 JSON metadata to Arweave via the shared Irys client.
 */
export async function uploadMonadMetadata(
    metadata: ERC721Metadata,
    wallet: { address: string | null; chainType: string; network: string }
): Promise<string> {
    console.log(`[Monad/Irys] Uploading metadata for: ${metadata.name}`);
    return uploadMetadataToArweave(metadata, wallet, false, undefined, [
        { name: "App-Name", value: "TheLilyPad" },
        { name: "Chain", value: "monad" },
    ]);
}

/**
 * Upload a batch of ERC-721 metadata objects
 */
export async function uploadMonadMetadataBatch(
    metadataArray: ERC721Metadata[],
    wallet: { address: string | null; chainType: string; network: string }
): Promise<string[]> {
    const uris: string[] = [];
    const batchSize = 10;

    for (let i = 0; i < metadataArray.length; i += batchSize) {
        const batch = metadataArray.slice(i, i + batchSize);
        const batchUris = await Promise.all(batch.map(m => uploadMonadMetadata(m, wallet)));
        uris.push(...batchUris);
    }

    return uris;
}

/**
 * Upload a Monad audio file to Arweave (for music NFTs on Monad).
 * Returns the URI with ?ext=mp3 suffix for wallet compatibility.
 */
export async function uploadMonadAudio(
    file: File,
    wallet: { address: string | null; chainType: string; network: string },
    trackMeta?: { name?: string; artist?: string; genre?: string }
): Promise<string> {
    console.log(`[Monad/Irys] Uploading audio: ${file.name} (${file.size} bytes)`);
    const uri = await uploadToArweave(file, wallet, false, undefined, undefined, [
        { name: "App-Name", value: "TheLilyPad" },
        { name: "Chain", value: "monad" },
        { name: "x-lilypad-music", value: "true" },
        ...(trackMeta?.name ? [{ name: "Track-Name", value: trackMeta.name }] : []),
        ...(trackMeta?.artist ? [{ name: "Artist", value: trackMeta.artist }] : []),
        ...(trackMeta?.genre ? [{ name: "Genre", value: trackMeta.genre }] : []),
    ]);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3';
    return `${uri}?ext=${ext}`;
}

/**
 * Build a standard ERC-721 metadata object
 */
export function buildERC721Metadata(
    name: string,
    description: string,
    imageUri: string,
    attributes?: ERC721Attribute[],
    externalUrl?: string,
    animationUrl?: string
): ERC721Metadata {
    return {
        name,
        description,
        image: imageUri,
        ...(externalUrl && { external_url: externalUrl }),
        ...(attributes && { attributes }),
        ...(animationUrl && { animation_url: animationUrl }),
    };
}
