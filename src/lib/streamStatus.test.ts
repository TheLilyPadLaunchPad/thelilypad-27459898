import { describe, expect, it } from 'bun:test';
import {
  countStreamsByStatus,
  filterStreamsByStatus,
  resolveStreamStatus,
  sortStreamsByStatus,
} from './streamStatus';

const NOW = Date.parse('2026-11-02T18:00:00.000Z');
const IN_TWO_HOURS = new Date(NOW + 2 * 60 * 60 * 1000).toISOString();
const AN_HOUR_AGO = new Date(NOW - 60 * 60 * 1000).toISOString();
const IN_SIX_HOURS = new Date(NOW + 6 * 60 * 60 * 1000).toISOString();

const LIVE = { id: 'live', is_live: true, started_at: AN_HOUR_AGO };
const SCHEDULED_LATER = { id: 'later', is_live: false, scheduled_at: IN_SIX_HOURS, started_at: IN_SIX_HOURS };
const SCHEDULED_SOON = { id: 'soon', is_live: false, scheduled_at: IN_TWO_HOURS, started_at: IN_TWO_HOURS };
const FINISHED = { id: 'done', is_live: false, ended_at: AN_HOUR_AGO, started_at: AN_HOUR_AGO };
const NO_SHOW = { id: 'missed', is_live: false, scheduled_at: AN_HOUR_AGO, started_at: AN_HOUR_AGO };

describe('resolveStreamStatus', () => {
  it('reports a live stream as live even when it carries a scheduled time', () => {
    expect(resolveStreamStatus({ ...LIVE, scheduled_at: IN_SIX_HOURS }, NOW)).toBe('live');
  });

  it('reports a stream with a future scheduled time as scheduled', () => {
    expect(resolveStreamStatus(SCHEDULED_SOON, NOW)).toBe('scheduled');
  });

  it('reports an ended stream, a never-started stream and a missed schedule as finished', () => {
    expect(resolveStreamStatus(FINISHED, NOW)).toBe('finished');
    expect(resolveStreamStatus({ id: 'plain', is_live: false, started_at: AN_HOUR_AGO }, NOW)).toBe('finished');
    expect(resolveStreamStatus(NO_SHOW, NOW)).toBe('finished');
  });

  it('stops calling a stream scheduled once it has been ended', () => {
    expect(resolveStreamStatus({ ...SCHEDULED_SOON, ended_at: AN_HOUR_AGO }, NOW)).toBe('finished');
  });
});

describe('filterStreamsByStatus', () => {
  const rows = [LIVE, SCHEDULED_LATER, FINISHED];

  it('keeps every row for the all filter', () => {
    expect(filterStreamsByStatus(rows, 'all', NOW).map((r) => r.id)).toEqual(['live', 'later', 'done']);
  });

  it('returns only the matching rows for each status filter', () => {
    expect(filterStreamsByStatus(rows, 'live', NOW).map((r) => r.id)).toEqual(['live']);
    expect(filterStreamsByStatus(rows, 'scheduled', NOW).map((r) => r.id)).toEqual(['later']);
    expect(filterStreamsByStatus(rows, 'finished', NOW).map((r) => r.id)).toEqual(['done']);
  });
});

describe('countStreamsByStatus', () => {
  it('counts each status once and totals them in all', () => {
    expect(countStreamsByStatus([LIVE, SCHEDULED_LATER, SCHEDULED_SOON, FINISHED, NO_SHOW], NOW)).toEqual({
      all: 5,
      live: 1,
      scheduled: 2,
      finished: 2,
    });
  });
});

describe('sortStreamsByStatus', () => {
  it('puts live first, then upcoming streams soonest first, then the most recent finished', () => {
    const ordered = sortStreamsByStatus([FINISHED, SCHEDULED_LATER, LIVE, SCHEDULED_SOON], NOW);
    expect(ordered.map((s) => s.id)).toEqual(['live', 'soon', 'later', 'done']);
  });
});
