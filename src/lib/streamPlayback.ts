/**
 * Which player a `streams` row should open in, and the link that opens it.
 *
 * A stream has exactly one source, resolved in this order:
 * 1. `youtube_video_id` set  -> YouTube embed
 * 2. `stream_key_id` set     -> browser (WebRTC) stream
 * 3. neither                 -> the Livepeer/RTMP playback id
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

/** In-app route that plays this stream. */
export function streamWatchUrl(stream: StreamSourceFields): string {
  const kind = resolveStreamKind(stream);
  if (kind === 'youtube') return `/watch/${stream.id ?? ''}`;
  if (kind === 'webrtc') return `/watch/${stream.stream_key_id}?type=webrtc`;
  return `/watch/${stream.stream_key_id || stream.id || ''}`;
}

/** Canonical YouTube URL for a video id (used for "Watch on YouTube"). */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** YouTube's own player URL, used as an embed fallback when the embed is blocked. */
export function youtubeEmbedFallbackUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}
