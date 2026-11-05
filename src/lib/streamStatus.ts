/**
 * The three states a `streams` row can be in, and the shared helpers that
 * group them so every page classifies a stream the same way.
 *
 * A row is:
 * - live      -> `is_live` is true
 * - scheduled -> a `scheduled_at` with no `ended_at`, even if the start time
 *   has passed — the creator can still go live, so it is not finished
 * - finished  -> anything else (ended, or never scheduled and never live)
 */
export type StreamStatus = 'live' | 'scheduled' | 'finished';

/** A stream filter choice: one status, or every status. */
export type StreamFilter = 'all' | StreamStatus;

export interface StreamStatusFields {
  is_live?: boolean | null;
  scheduled_at?: string | null;
  ended_at?: string | null;
}

interface StreamSortFields extends StreamStatusFields {
  started_at?: string | null;
}

export const STREAM_FILTERS: { key: StreamFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'finished', label: 'Finished' },
];

/** Which state a stream is in right now. `now` is injectable for tests. */
export function resolveStreamStatus(
  stream: StreamStatusFields,
  now: number = Date.now(),
): StreamStatus {
  if (stream.is_live) return 'live';

  const starts = stream.scheduled_at ? Date.parse(stream.scheduled_at) : Number.NaN;
  if (Number.isFinite(starts) && !stream.ended_at) return 'scheduled';

  return 'finished';
}

/** Rows belonging to one filter, in the caller's original order. */
export function filterStreamsByStatus<T extends StreamStatusFields>(
  streams: T[],
  filter: StreamFilter,
  now: number = Date.now(),
): T[] {
  if (filter === 'all') return streams;
  return streams.filter((stream) => resolveStreamStatus(stream, now) === filter);
}

/** How many rows sit behind each filter tab, including the "All" tab. */
export function countStreamsByStatus<T extends StreamStatusFields>(
  streams: T[],
  now: number = Date.now(),
): Record<StreamFilter, number> {
  const counts: Record<StreamFilter, number> = {
    all: streams.length,
    live: 0,
    scheduled: 0,
    finished: 0,
  };
  for (const stream of streams) {
    counts[resolveStreamStatus(stream, now)] += 1;
  }
  return counts;
}

const STATUS_RANK: Record<StreamStatus, number> = { live: 0, scheduled: 1, finished: 2 };

function toTime(value?: string | null): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Live first, then upcoming streams (soonest first), then finished (most recent
 * first). Applied after filtering, so the order inside each group stays useful.
 */
export function sortStreamsByStatus<T extends StreamSortFields>(
  streams: T[],
  now: number = Date.now(),
): T[] {
  return [...streams].sort((a, b) => {
    const statusA = resolveStreamStatus(a, now);
    const statusB = resolveStreamStatus(b, now);
    if (statusA !== statusB) return STATUS_RANK[statusA] - STATUS_RANK[statusB];

    if (statusA === 'scheduled') return toTime(a.scheduled_at) - toTime(b.scheduled_at);
    return toTime(b.ended_at ?? b.started_at) - toTime(a.ended_at ?? a.started_at);
  });
}
