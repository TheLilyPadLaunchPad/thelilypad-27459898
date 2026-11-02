import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countStreamsByStatus,
  filterStreamsByStatus,
  resolveStreamStatus,
  sortStreamsByStatus,
} from './streamStatus';

interface Row {
  id: string;
  is_live?: boolean;
  scheduled_at?: string | null;
  ended_at?: string | null;
  started_at?: string | null;
}

const NOW = Date.parse('2026-11-02T18:00:00.000Z');
const IN_TWO_HOURS = new Date(NOW + 2 * 60 * 60 * 1000).toISOString();
const AN_HOUR_AGO = new Date(NOW - 60 * 60 * 1000).toISOString();
const IN_SIX_HOURS = new Date(NOW + 6 * 60 * 60 * 1000).toISOString();

const LIVE: Row = { id: 'live', is_live: true, started_at: AN_HOUR_AGO };
const SCHEDULED_LATER: Row = { id: 'later', is_live: false, scheduled_at: IN_SIX_HOURS, started_at: IN_SIX_HOURS };
const SCHEDULED_SOON: Row = { id: 'soon', is_live: false, scheduled_at: IN_TWO_HOURS, started_at: IN_TWO_HOURS };
const FINISHED: Row = { id: 'done', is_live: false, ended_at: AN_HOUR_AGO, started_at: AN_HOUR_AGO };
const NO_SHOW: Row = { id: 'missed', is_live: false, scheduled_at: AN_HOUR_AGO, started_at: AN_HOUR_AGO };
const ABANDONED: Row = { id: 'plain', is_live: false, started_at: AN_HOUR_AGO };

const ids = (rows: Row[]) => rows.map((row) => row.id);

test('a live stream stays live even when it carries a scheduled time', () => {
  assert.equal(resolveStreamStatus({ ...LIVE, scheduled_at: IN_SIX_HOURS }, NOW), 'live');
});

test('a stream with a future scheduled time is scheduled', () => {
  assert.equal(resolveStreamStatus(SCHEDULED_SOON, NOW), 'scheduled');
});

test('an ended stream, a never-started stream and a missed schedule are finished', () => {
  assert.equal(resolveStreamStatus(FINISHED, NOW), 'finished');
  assert.equal(resolveStreamStatus(ABANDONED, NOW), 'finished');
  assert.equal(resolveStreamStatus(NO_SHOW, NOW), 'finished');
});

test('a stream stops being scheduled once it has been ended', () => {
  assert.equal(resolveStreamStatus({ ...SCHEDULED_SOON, ended_at: AN_HOUR_AGO }, NOW), 'finished');
});

test('the all filter keeps every row', () => {
  assert.deepEqual(ids(filterStreamsByStatus([LIVE, SCHEDULED_LATER, FINISHED], 'all', NOW)), ['live', 'later', 'done']);
});

test('each status filter returns only its own rows', () => {
  const rows = [LIVE, SCHEDULED_LATER, FINISHED];
  assert.deepEqual(ids(filterStreamsByStatus(rows, 'live', NOW)), ['live']);
  assert.deepEqual(ids(filterStreamsByStatus(rows, 'scheduled', NOW)), ['later']);
  assert.deepEqual(ids(filterStreamsByStatus(rows, 'finished', NOW)), ['done']);
});

test('status counts total up in the all tab', () => {
  assert.deepEqual(
    countStreamsByStatus([LIVE, SCHEDULED_LATER, SCHEDULED_SOON, FINISHED, NO_SHOW], NOW),
    { all: 5, live: 1, scheduled: 2, finished: 2 },
  );
});

test('streams sort live first, then soonest scheduled, then most recent finished', () => {
  assert.deepEqual(
    ids(sortStreamsByStatus([FINISHED, SCHEDULED_LATER, LIVE, SCHEDULED_SOON], NOW)),
    ['live', 'soon', 'later', 'done'],
  );
});
