import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync(new URL('../drizzle/migrations/0016_fix_collection_delete_schema_links.sql', import.meta.url), 'utf8');

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

test('mint transactions are removed by session, before their sessions', () => {
  assert.match(sql, /FROM public\.mint_sessions WHERE collection_address = ANY\(v_addresses\)/);
  assert.match(sql, /DELETE FROM public\.mint_transactions WHERE session_id = ANY\(v_session_ids\)/);
  assert.ok(sql.indexOf('DELETE FROM public.mint_transactions') < sql.indexOf('DELETE FROM public.mint_sessions'));
  assert.doesNotMatch(sql, /(?:mint_sessions|mint_transactions) WHERE collection_id/);
});

test('shared blind boxes and homepage cards have no collection cleanup', () => {
  assert.doesNotMatch(sql, /(?:FROM|UPDATE) public\.(?:lily_blind_boxes|card_stack_items)\b/);
});

test('shared raffle, shop and governance references are detached', () => {
  assert.match(sql, /UPDATE public\.lily_raffles SET required_collection_id = NULL WHERE required_collection_id = p_collection_id/);
  assert.match(sql, /UPDATE public\.shop_items SET collection_id = NULL WHERE collection_id = p_collection_id/);
  assert.match(sql, /UPDATE public\.shop_items SET required_collection_id = NULL WHERE required_collection_id = p_collection_id/);
  assert.match(sql, /UPDATE public\.governance_config SET governance_collection_id = NULL, is_active = false WHERE governance_collection_id = p_collection_id/);
});

test('permanent deletion retains server-side admin authorization', () => {
  assert.match(sql, /IF NOT public\.has_role\(auth\.uid\(\), 'admin'\) THEN\s+RAISE EXCEPTION 'Not authorized'/);
});