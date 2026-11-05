import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync(new URL('../drizzle/migrations/0015_fix_collection_hard_delete_shared_buybacks.sql', import.meta.url), 'utf8');

test('collection deletion does not read the nonexistent buyback membership program_id', () => {
  assert.doesNotMatch(sql, /SELECT\s+array_agg\(program_id\)[\s\S]*?FROM\s+public\.buyback_program_collections/i);
});

test('collection deletion preserves shared buyback programs', () => {
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.buyback_programs\b/i);
});

test('collection deletion preserves shared buyback events', () => {
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.buyback_events\b/i);
});

test('collection deletion removes only the selected collection buyback records', () => {
  for (const table of ['collection_buyback_contributions', 'buyback_program_collections']) {
    assert.match(sql, new RegExp(`DELETE\\s+FROM\\s+public\\.${table}\\s+WHERE\\s+collection_id\\s*=\\s*p_collection_id`, 'i'));
  }
});