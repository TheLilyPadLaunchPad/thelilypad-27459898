import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { whitelistCsv } from '../src/lib/whitelistCsv';

test('CSV exports addresses and registration statuses with proper escaping and formula protection', () => {
  assert.equal(whitelistCsv([
    { profile_id: 'a', wallet_address: 'WalletA', claim_status: 'registered', registered_at: '2026-11-25T19:00:00Z' },
    { profile_id: 'b', wallet_address: '=unsafe,"value"', claim_status: 'pending_profile', registered_at: '' },
  ]), '\uFEFFwallet_address,claim_status,registered_at\r\n"WalletA","registered","2026-11-25T19:00:00Z"\r\n"\'=unsafe,""value""","pending_profile",""\r\n');
});

test('actual export query rejects non-admins and paginates only saved-account wallets with accurate statuses', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
      CREATE TYPE public.app_role AS ENUM ('admin','user');
      CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.admin', true),'false')='true' $$;
      CREATE TABLE public.user_profiles(id uuid, wallet_address text, user_id uuid, profile_setup_completed boolean, created_at timestamptz);
      INSERT INTO public.user_profiles VALUES
      ('00000000-0000-0000-0000-000000000001','WalletA','10000000-0000-0000-0000-000000000001',true,'2026-11-25'),
      ('00000000-0000-0000-0000-000000000002','WalletB','10000000-0000-0000-0000-000000000002',false,'2026-11-25'),
      ('00000000-0000-0000-0000-000000000003','GuestWallet',null,true,'2026-11-25');
    `);
    await db.exec(readFileSync(new URL('../drizzle/migrations/0020_admin_whitelist_wallet_export.sql', import.meta.url), 'utf8'));
    await assert.rejects(db.query('SELECT * FROM public.admin_export_whitelist_wallets()'), /Admin access required/);
    await db.exec(`SET test.uid='10000000-0000-0000-0000-000000000001'; SET test.admin='false'; SET ROLE authenticated;`);
    await assert.rejects(db.query('SELECT * FROM public.admin_export_whitelist_wallets()'), /Admin access required/);
    await db.exec(`SET test.admin='true';`);
    const first = await db.query<{ profile_id: string; wallet_address: string; claim_status: string }>('SELECT * FROM public.admin_export_whitelist_wallets(NULL,1)');
    assert.equal(first.rows.length, 1);
    assert.equal(first.rows[0]?.wallet_address, 'WalletA');
    assert.equal(first.rows[0]?.claim_status, 'registered');
    const second = await db.query<{ wallet_address: string; claim_status: string }>('SELECT * FROM public.admin_export_whitelist_wallets($1,500)', [first.rows[0]?.profile_id]);
    assert.deepEqual(second.rows.map(row => [row.wallet_address,row.claim_status]), [['WalletB','pending_profile']]);
    await db.exec('RESET ROLE;');
    const privileges = await db.query<{ allowed: boolean }>(`SELECT has_function_privilege('anon','public.admin_export_whitelist_wallets(uuid,integer)','EXECUTE') AS allowed`);
    assert.equal(privileges.rows[0]?.allowed, false);
  } finally { await db.close(); }
});