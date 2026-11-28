import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('leaderboard lists every referral program member, including 0 referrals, without exposing private profiles or ids', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
      CREATE TABLE public.user_profiles(user_id uuid, display_name text, avatar_url text, is_private boolean);
      CREATE TABLE public.referral_codes(id uuid DEFAULT gen_random_uuid(), user_id uuid, code text, created_at timestamptz);
      CREATE TABLE public.referral_signups(id uuid DEFAULT gen_random_uuid(), referrer_id uuid, referred_user_id uuid, referral_code text, created_at timestamptz DEFAULT now());
      INSERT INTO public.user_profiles VALUES
        ('10000000-0000-0000-0000-000000000001','Alice','a.png',false),
        ('10000000-0000-0000-0000-000000000002','Bob','b.png',false),
        ('10000000-0000-0000-0000-000000000003','Secret','s.png',true);
      INSERT INTO public.referral_codes(user_id, code, created_at) VALUES
        ('10000000-0000-0000-0000-000000000001','A','2026-11-01'),
        ('10000000-0000-0000-0000-000000000002','B','2026-11-02'),
        ('10000000-0000-0000-0000-000000000003','C','2026-11-03');
      INSERT INTO public.referral_signups(referrer_id, referred_user_id, referral_code) VALUES
        ('10000000-0000-0000-0000-000000000002', gen_random_uuid(), 'B'),
        ('10000000-0000-0000-0000-000000000002', gen_random_uuid(), 'B');
    `);
    await db.exec(readFileSync(new URL('../drizzle/migrations/0022_referral_leaderboard_all_participants.sql', import.meta.url), 'utf8'));
    await db.exec(`SET ROLE anon;`);
    const all = await db.query<Record<string, unknown>>('SELECT * FROM public.get_referral_leaderboard()');
    assert.deepEqual(all.rows, [
      { rank_position: 1, display_name: 'Bob', avatar_url: 'b.png', referral_count: 2, is_me: false },
      { rank_position: 2, display_name: 'Alice', avatar_url: 'a.png', referral_count: 0, is_me: false },
      { rank_position: 3, display_name: null, avatar_url: null, referral_count: 0, is_me: false },
    ]);
    const top = await db.query('SELECT * FROM public.get_referral_leaderboard(1)');
    assert.equal(top.rows.length, 1);
    await db.exec(`RESET ROLE; SET test.uid='10000000-0000-0000-0000-000000000001'; SET ROLE authenticated;`);
    const mine = await db.query<{ display_name: string | null; is_me: boolean }>('SELECT * FROM public.get_referral_leaderboard()');
    assert.deepEqual(mine.rows.filter(r => r.is_me).map(r => r.display_name), ['Alice']);
  } finally { await db.close(); }
});
