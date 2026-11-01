import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectionMusicTracks } from './collectionMusic';

const collection = { id: 'album', name: 'Pond Sessions', image_url: null, artworks_metadata: [{ id: 'track-a', name: 'Lily Song', description: 'Original notes' }] };
const row = { id: 'row-a', artwork_id: 'track-a', audio_url: 'ar://audio', cover_art_url: 'ipfs://cover', artist: 'Lily', duration_seconds: 120, genre: 'Jazz', bpm: 90, track_number: 1 };
test('published music retains each track title, description and permanent media', () => {
  const [track] = collectionMusicTracks(collection, [row]);
  assert.equal(track.name, 'Lily Song');
  assert.equal(track.description, 'Original notes');
  assert.equal(track.audioUrl, 'https://arweave.net/audio');
  assert.equal(track.coverUrl, 'https://ipfs.io/ipfs/cover');
  assert.equal(track.duration, 120);
});
test('older collections use track-number fallback and unsafe audio is excluded', () => {
  assert.equal(collectionMusicTracks({ ...collection, artworks_metadata: null }, [row])[0].name, 'Pond Sessions · Track 1');
  assert.deepEqual(collectionMusicTracks(collection, [{ ...row, audio_url: 'javascript:alert(1)' }]), []);
});