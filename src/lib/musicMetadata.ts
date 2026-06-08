import { MusicTrack } from '@/components/launchpad/MusicMetadataEditor';
import { buildMetaplexMetadata, inferMime, type MetaplexAttribute } from '@/lib/metaplexMetadata';

/**
 * Build Metaplex-standard NFT metadata for a Music NFT.
 * Includes animation_url for the audio, structured attributes, and
 * properties.files with correct MIME types.
 */
export function buildMusicNftMetadata(
  track: MusicTrack,
  imageUri: string,
  audioUri: string,
  collectionName?: string,
  externalUrl?: string,
) {
  const { metadata } = track;
  const audioMime = getAudioMimeType(track.audioFile.name);
  const imageMime = getImageMimeType(track.coverFile.name);

  const attributes: MetaplexAttribute[] = [];

  if (metadata.artist) attributes.push({ trait_type: 'Artist', value: metadata.artist });
  if (metadata.genre) attributes.push({ trait_type: 'Genre', value: metadata.genre });
  if (metadata.bpm != null) attributes.push({ trait_type: 'BPM', value: String(metadata.bpm) });
  if (metadata.durationSeconds != null) {
    attributes.push({ trait_type: 'Duration', value: String(metadata.durationSeconds) });
  }
  if (metadata.album) attributes.push({ trait_type: 'Album', value: metadata.album });
  if (metadata.trackNumber != null) {
    attributes.push({ trait_type: 'Track Number', value: String(metadata.trackNumber) });
  }

  // Append ?ext=mp3 for reliable wallet/player detection
  const ext = track.audioFile.name.split('.').pop()?.toLowerCase() || 'mp3';
  const audioUriWithExt = audioUri.includes('?') ? audioUri : `${audioUri}?ext=${ext}`;

  return buildMetaplexMetadata({
    name: metadata.name || 'Untitled Track',
    description: metadata.description || '',
    image: imageUri,
    imageMime,
    animationUrl: audioUriWithExt,
    animationMime: audioMime,
    externalUrl,
    attributes,
    category: 'audio',
    collection: collectionName ? { name: collectionName } : undefined,
  });
}

function getAudioMimeType(filename: string): string {
  return inferMime(filename, 'audio/mpeg');
}

function getImageMimeType(filename: string): string {
  return inferMime(filename, 'image/png');
}
