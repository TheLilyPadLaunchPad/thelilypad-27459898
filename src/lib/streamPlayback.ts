/**
 * Which player a `streams` row should open in, and the link that opens it.
 *
 * A stream has exactly one source, resolved in this order:
 * 1. `youtube_video_id` set  -> YouTube embed
 * 2. `stream_key_id` set     -> browser (WebRTC) stream, keyed on the stream key
 * 3. neither                 -> the row itself (Livepeer/RTMP playback id)
 */
export type StreamKind = 'youtube' | 'webrtc' | 'hls';

export interface StreamSourceFields {
  id?: string | null;
  stream_key_id?: string | null;
  youtube_video_id?: string | null;
}

export function resolveStreamKind(stream: StreamSourceFields): StreamKind {
  if (stream.youtube_video_id) return 'youtube';
  if (stream.stream_key_id) return 'webrtc';
  return 'hls';
}

/** The id the player and the presence channel are keyed on. */
export function streamPlaybackId(stream: StreamSourceFields): string {
  return resolveStreamKind(stream) === 'webrtc'
    ? String(stream.stream_key_id ?? '')
    : String(stream.id ?? '');
}

/** In-app route that plays this stream. */
export function streamWatchUrl(stream: StreamSourceFields): string {
  const id = streamPlaybackId(stream);
  return resolveStreamKind(stream) === 'webrtc' ? `/watch/${id}?type=webrtc` : `/watch/${id}`;
}

/** Canonical YouTube URL for a video id (used for "Watch on YouTube"). */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
