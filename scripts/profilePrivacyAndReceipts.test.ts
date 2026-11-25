import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, before, after } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Applies the real migration to an isolated in-memory engine; no live records are touched.
const database = new PGlite();
before(async () => {
  await database.exec(
    readFileSync(new URL('fixtures/securitySchema.sql', import.meta.url), 'utf8')
    + `CREATE TABLE IF NOT EXISTS public.shop_purchases(id uuid DEFAULT gen_random_uuid(), user_id uuid, item_id uuid);
       CREATE TABLE IF NOT EXISTS public.shop_bundle_purchases(id uuid DEFAULT gen_random_uuid(), user_id uuid, bundle_id uuid);
       GRANT ALL ON public.shop_purchases, public.shop_bundle_purchases TO anon, authenticated, service_role;`
    + readFileSync(new URL('../drizzle/migrations/0021_selected_profile_privacy_and_purchase_receipts.sql', import.meta.url), 'utf8'),
  );
});
after(async () => { await database.close(); });

async function databaseCheck(sql: string) {
  await database.exec('BEGIN;');
  try { await database.exec(sql); } finally { await database.exec('ROLLBACK;'); }
}

const seed = `
  owner uuid:=gen_random_uuid(); fan uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); result json;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner),(fan),(stranger);
  INSERT INTO public.user_profiles(user_id,wallet_address,is_private) VALUES(owner,'PrivateWallet',true);
  INSERT INTO public.followers(follower_id,streamer_id) VALUES(fan,owner),(owner,fan);`;

test('a stranger sees zero follower and following counts for a private profile', () => databaseCheck(`
DO $$ DECLARE ${seed}
  PERFORM set_config('request.jwt.claims',json_build_object('sub',stranger,'role','authenticated')::text,true);
  result := public.get_profile_social_counts(owner);
  ASSERT (result->>'followersCount')::int = 0 AND (result->>'followingCount')::int = 0;
  ASSERT (result->>'isFollowing')::boolean = false;
END $$;`));

test('the owner of a private profile still sees their real counts', () => databaseCheck(`
DO $$ DECLARE ${seed}
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
  result := public.get_profile_social_counts(owner);
  ASSERT (result->>'followersCount')::int = 1 AND (result->>'followingCount')::int = 1;
END $$;`));

test('a public profile still shows its counts to everyone', () => databaseCheck(`
DO $$ DECLARE ${seed}
  UPDATE public.user_profiles SET is_private=false WHERE user_id=owner;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',stranger,'role','authenticated')::text,true);
  result := public.get_profile_social_counts(owner);
  ASSERT (result->>'followersCount')::int = 1 AND (result->>'followingCount')::int = 1;
END $$;`));

test('visitors and signed-in users cannot look up a profile by wallet', () => databaseCheck(`
DO $$ DECLARE ${seed}
  ASSERT NOT has_function_privilege('anon','public.get_profile_id_by_wallet(text)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.get_profile_id_by_wallet(text)','EXECUTE');
  PERFORM set_config('request.jwt.claims',json_build_object('sub',stranger,'role','authenticated')::text,true);
  ASSERT public.get_profile_id_by_wallet('PrivateWallet') IS NULL;
END $$;`));

test('visitors and signed-in users cannot create purchase receipts directly', () => databaseCheck(`
DO $$ BEGIN
  ASSERT NOT has_table_privilege('authenticated','public.shop_purchases','INSERT');
  ASSERT NOT has_table_privilege('anon','public.shop_purchases','INSERT');
  ASSERT NOT has_table_privilege('authenticated','public.shop_bundle_purchases','INSERT');
  ASSERT has_table_privilege('service_role','public.shop_purchases','INSERT');
END $$;`));
