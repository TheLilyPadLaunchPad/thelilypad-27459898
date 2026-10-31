import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStreamKind, streamWatchUrl, youtubeWatchUrl } from './streamPlayback';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3e71';

test('a pasted YouTube link wins over every other source', () => {
  assert.equal(
    resolveStreamKind({ id: UUID, youtube_video_id: 'dQw4w9WgXcQ', stream_key_id: 'key-1' }),
    'youtube',
  );
});

test('a browser stream without a YouTube link stays webrtc', () => {
  assert.equal(resolveStreamKind({ id: UUID, stream_key_id: 'key-1' }), 'webrtc');
});

test('a plain row falls back to the Livepeer playback id', () => {
  assert.equal(resolveStreamKind({ id: UUID }), 'hls');
});

test('YouTube streams open on their own row id', () => {
  assert.equal(
    streamWatchUrl({ id: UUID, youtube_video_id: 'dQw4w9WgXcQ' }),
    `/watch/${UUID}`,
  );
});

test('browser streams open on the stream key with the webrtc hint', () => {
  assert.equal(streamWatchUrl({ id: UUID, stream_key_id: 'key-1' }), '/watch/key-1?type=webrtc');
});

test('Livepeer streams use the stream key when present', () => {
  assert.equal(streamWatchUrl({ id: UUID, stream_key_id: 'key-9' }), '/watch/key-9');
  assert.equal(streamWatchUrl({ id: UUID }), `/watch/${UUID}`);
});

test('the external link points at the real video', () => {
  assert.equal(youtubeWatchUrl('dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});
