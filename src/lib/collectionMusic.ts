import { safeCollectibleUrl } from './collectibleDetails';

interface AudioRow {
  id: string;
  artwork_id: string;
  audio_url: string;
  cover_art_url: string;
  artist: string | null;
  duration_seconds: number | null;
  genre: string | null;
  bpm: number | null;
  track_number: number | null;
}

export function collectionMusicTracks(collection: { id: string; name: string; image_url: string | null; artworks_metadata?: unknown }, rows: AudioRow[]) {
  const metadata = Array.isArray(collection.artworks_metadata) ? collection.artworks_metadata : [];
  return rows.flatMap(row => {
    const audioUrl = safeCollectibleUrl(row.audio_url);
    if (!audioUrl) return [];
    const artwork = metadata.find(value => value && typeof value === 'object' && value.id === row.artwork_id);
    return [{
      id: row.id,
      collectionId: collection.id,
      name: typeof artwork?.name === 'string' ? artwork.name : `${collection.name} · Track ${row.track_number ?? 1}`,
      description: typeof artwork?.description === 'string' ? artwork.description : '',
      artist: row.artist || 'Unknown Artist',
      audioUrl,
      coverUrl: safeCollectibleUrl(row.cover_art_url || collection.image_url || '') || '',
      duration: row.duration_seconds ?? undefined,
      genre: row.genre,
      bpm: row.bpm,
    }];
  });
}