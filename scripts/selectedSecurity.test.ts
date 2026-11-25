import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, chownSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test, before, after } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packPurchaseAccess } from '../supabase/functions/_shared/packPurchaseAccess';
import { nativeUnits, validTicketCount, verifyRaffleSolanaPayment, verifyRaffleMonadPayment } from '../supabase/functions/_shared/rafflePayment';

const testDirectory = mkdtempSync(join(tmpdir(), 'lily-security-tests-'));
const cluster = join(testDirectory, 'cluster');
const asLocalUser = (command: string, args: string[]) => process.getuid?.() === 0
  ? execFileSync('runuser', ['-u', 'nobody', '--', command, ...args], { stdio: 'pipe' })
  : execFileSync(command, args, { stdio: 'pipe' });
const databaseArgs = ['-h', testDirectory, '-p', '55432', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1'];
let started = false;
before(() => {
  if (process.getuid?.() === 0) chownSync(testDirectory, 65534, 65534);
  asLocalUser('initdb', ['-D', cluster, '-U', 'postgres', '-A', 'trust', '--no-locale']);
  asLocalUser('pg_ctl', ['-D', cluster, '-l', join(testDirectory, 'postgres.log'), '-o', `-F -k ${testDirectory} -h '' -p 55432`, '-w', 'start']);
  started = true;
  const fixture = readFileSync(new URL('fixtures/securitySchema.sql', import.meta.url), 'utf8')
    + readFileSync(new URL('fixtures/profileQueries.sql', import.meta.url), 'utf8')
    + readFileSync(new URL('../drizzle/migrations/0018_selected_reward_and_profile_security.sql', import.meta.url), 'utf8')
    + readFileSync(new URL('../drizzle/migrations/0019_record_verified_raffle_entry.sql', import.meta.url), 'utf8');
  execFileSync('psql', databaseArgs, { input: fixture, stdio: 'pipe' });
});
after(() => {
  if (started) asLocalUser('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']);
  rmSync(testDirectory, { recursive: true, force: true });
});

function databaseCheck(sql: string) {
  execFileSync('psql', databaseArgs, {
    input: `BEGIN; ${sql} ROLLBACK;`, stdio: ['pipe', 'pipe', 'pipe'],
  });
}

test('only trusted services can create activity, stamped with the current time', () => databaseCheck(`
DO $$ DECLARE row public.volume_tracking; BEGIN
  ASSERT NOT has_table_privilege('authenticated','public.volume_tracking','INSERT');
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.volume_tracking(source_type,volume_amount,weighted_volume,created_at)
  VALUES('nft_buy',1,1,'2099-01-01') RETURNING * INTO row;
  ASSERT row.verified_at IS NOT NULL AND row.created_at=now();
END $$;`));

test('a challenger cannot create an already-active or self challenge', () => databaseCheck(`
DO $$ DECLARE challenger uuid:=gen_random_uuid(); denied boolean:=false; BEGIN
  PERFORM set_config('request.jwt.claims',json_build_object('sub',challenger,'role','authenticated')::text,true);
  BEGIN INSERT INTO public.streak_challenges(challenger_id,challenged_id,status)
    VALUES(challenger,gen_random_uuid(),'active'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied;
  denied:=false;
  BEGIN INSERT INTO public.streak_challenges(challenger_id,challenged_id)
    VALUES(challenger,challenger); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied;
END $$;`));

test('only the invited person can accept; dates and scores are server controlled', () => databaseCheck(`
DO $$ DECLARE challenger uuid:=gen_random_uuid(); invited uuid:=gen_random_uuid(); challenge uuid;
  denied boolean:=false; row public.streak_challenges; BEGIN
  PERFORM set_config('request.jwt.claims',json_build_object('sub',challenger,'role','authenticated')::text,true);
  INSERT INTO public.streak_challenges(challenger_id,challenged_id,duration_days,start_date,end_date)
    VALUES(challenger,invited,7,'2000-01-01','2000-01-08') RETURNING id INTO challenge;
  BEGIN UPDATE public.streak_challenges SET status='active' WHERE id=challenge; EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',invited,'role','authenticated')::text,true);
  UPDATE public.streak_challenges SET status='active',start_date='2000-01-01',end_date='2000-01-08' WHERE id=challenge RETURNING * INTO row;
  ASSERT row.accepted_at IS NOT NULL AND row.start_date=CURRENT_DATE AND row.end_date=CURRENT_DATE+7;
  denied:=false;
  BEGIN UPDATE public.streak_challenges SET challenger_streak=99 WHERE id=challenge; EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied;
END $$;`));

test('clients cannot write raffle tickets and trusted entries enforce payment and cumulative limits', () => databaseCheck(`
DO $$ DECLARE raffle uuid; entrant uuid:=gen_random_uuid(); denied boolean:=false; entry uuid; BEGIN
  ASSERT NOT has_table_privilege('authenticated','public.lily_raffle_entries','INSERT');
  ASSERT NOT has_function_privilege('authenticated','public.record_verified_raffle_entry(uuid,uuid,integer,text)','EXECUTE');
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.lily_raffles(name,entry_price,max_tickets_per_user,start_date,end_date,created_by)
    VALUES('Security regression fixture',0.1,3,now()-interval '1 hour',now()+interval '1 hour',entrant) RETURNING id INTO raffle;
  entry:=public.record_verified_raffle_entry(raffle,entrant,3,'security-fixture-payment');
  ASSERT (SELECT total_paid=0.3 AND verified_at IS NOT NULL FROM public.lily_raffle_entries WHERE id=entry);
  BEGIN PERFORM public.record_verified_raffle_entry(raffle,entrant,1,'security-fixture-other-payment'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied;
  denied:=false;
  BEGIN PERFORM public.record_verified_raffle_entry(raffle,gen_random_uuid(),1,'security-fixture-payment'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied;
END $$;`));

test('streamer self-edits cannot grant verification; trusted administrators can', () => databaseCheck(`
DO $$ DECLARE owner uuid:=gen_random_uuid(); profile uuid; verified boolean; BEGIN
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
  INSERT INTO public.streamer_profiles(user_id,display_name,is_verified) VALUES(owner,'Security fixture',true) RETURNING id,is_verified INTO profile,verified;
  ASSERT NOT verified;
  UPDATE public.streamer_profiles SET is_verified=true WHERE id=profile RETURNING is_verified INTO verified;
  ASSERT NOT verified;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.streamer_profiles SET is_verified=true WHERE id=profile RETURNING is_verified INTO verified;
  ASSERT verified;
END $$;`));

test('private activity and supporter queries deny visitors but allow the owner', () => databaseCheck(`
DO $$ DECLARE owner uuid; actor uuid:=gen_random_uuid(); rows bigint; BEGIN
  SELECT id INTO owner FROM auth.users ORDER BY created_at LIMIT 1;
  ASSERT owner IS NOT NULL;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.user_profiles SET is_private=true WHERE user_id=owner;
  IF NOT FOUND THEN INSERT INTO public.user_profiles(user_id,wallet_address,is_private)
    VALUES(owner,'security-fixture-wallet',true); END IF;
  INSERT INTO public.followers(follower_id,streamer_id) VALUES(actor,owner);
  INSERT INTO public.earnings(user_id,from_user_id,amount,type,from_username,message)
    VALUES(owner,actor,1,'tip','Security fixture','private fixture note');
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  SELECT count(*) INTO rows FROM public.get_profile_activity_feed(owner); ASSERT rows=0;
  SELECT count(*) INTO rows FROM public.get_top_supporters(owner); ASSERT rows=0;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
  SELECT count(*) INTO rows FROM public.get_profile_activity_feed(owner); ASSERT rows=0;
  SELECT count(*) INTO rows FROM public.get_top_supporters(owner); ASSERT rows=0;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
  SELECT count(*) INTO rows FROM public.get_profile_activity_feed(owner); ASSERT rows>0;
  SELECT count(*) INTO rows FROM public.get_top_supporters(owner); ASSERT rows>0;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.user_profiles SET is_private=false WHERE user_id=owner;
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  SELECT count(*) INTO rows FROM public.get_profile_activity_feed(owner); ASSERT rows>0;
END $$;`));

test('a pack receipt must match the account, pack, and original delivery wallet', () => {
  const receipt = { id: 'receipt', user_id: 'buyer', item_id: 'pack', from_address: 'wallet' };
  assert.equal(packPurchaseAccess(null, 'buyer', 'pack', 'wallet'), false);
  assert.equal(packPurchaseAccess(receipt, 'other', 'pack', 'wallet'), false);
  assert.equal(packPurchaseAccess(receipt, 'buyer', 'other-pack', 'wallet'), false);
  assert.equal(packPurchaseAccess(receipt, 'buyer', 'pack', 'other-wallet'), false);
  assert.equal(packPurchaseAccess(receipt, 'buyer', 'pack', 'wallet'), true);
  assert.equal(packPurchaseAccess({ ...receipt, from_address: null }, 'buyer', 'pack', 'wallet'), true);
});

test('raffle ticket quantities must be positive integers within the remaining allowance', () => {
  assert.equal(validTicketCount(3, 7, 10), true);
  for (const count of [0, -1, 1.5, 4, NaN, Infinity, '3']) assert.equal(validTicketCount(count, 7, 10), false);
  assert.equal(nativeUnits('0.1', 9) * 3n, 300000000n);
});

test('Solana raffle payments must be successful, signed by the caller, and sent to the treasury', () => {
  const tx = { meta: { err: null }, transaction: { message: {
    accountKeys: [{ pubkey: 'buyer', signer: true }], instructions: [
      { program: 'spl-memo', parsed: 'TheLilyPad:v1:raffle:entry' },
      { program: 'system', parsed: { type: 'transfer', info: { source: 'buyer', destination: 'treasury', lamports: 300000000 } } },
    ],
  } } };
  assert.equal(verifyRaffleSolanaPayment(tx, new Set(['buyer']), 'treasury', 300000000n), true);
  assert.equal(verifyRaffleSolanaPayment(tx, new Set(['attacker']), 'treasury', 300000000n), false);
  assert.equal(verifyRaffleSolanaPayment(tx, new Set(['buyer']), 'other', 300000000n), false);
  assert.equal(verifyRaffleSolanaPayment(tx, new Set(['buyer']), 'treasury', 300000001n), false);
  assert.equal(verifyRaffleSolanaPayment({ ...tx, meta: { err: 'failed' } }, new Set(['buyer']), 'treasury', 1n), false);
});

test('Monad raffle payments must be confirmed and belong to the caller and treasury', () => {
  const tx = { from: 'buyer', to: 'treasury', blockNumber: '0x10', value: '0x64' };
  assert.equal(verifyRaffleMonadPayment(tx, { status: '0x1' }, new Set(['buyer']), 'treasury', 100n), true);
  assert.equal(verifyRaffleMonadPayment(tx, { status: '0x0' }, new Set(['buyer']), 'treasury', 100n), false);
  assert.equal(verifyRaffleMonadPayment(tx, { status: '0x1' }, new Set(['attacker']), 'treasury', 100n), false);
  assert.equal(verifyRaffleMonadPayment(tx, { status: '0x1' }, new Set(['buyer']), 'other', 100n), false);
});

// Run the real handler with deterministic service boundaries, not copied logic.
function edgeHandler(path: string, bindings: Record<string, unknown>) {
  let handler: (req: Request) => Promise<Response> = async () => new Response(null, { status: 500 });
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import\s[\s\S]*?;\s*/gm, '');
  const javascript = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
  const deno = { env: { get: (key: string) => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', HELIUS_API_KEY: 'fixture' }[key]) },
    serve: (fn: typeof handler) => { handler = fn; } };
  new Function('Deno', 'serve', ...Object.keys(bindings), javascript)(deno, deno.serve, ...Object.values(bindings));
  return (req: Request) => handler(req);
}

test('unpriced pack delivery without a purchase is denied before contents or minting', async () => {
  let protectedReads = 0;
  const pack = { id: 'pack', name: 'Fixture', price_sol: 0, price_mon: 0,
    collection_address: 'collection', tree_address: 'tree', mint_authority: 'treasury' };
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'buyer' } }, error: null }) },
    from: (table: string) => {
      if (table === 'shop_item_contents') protectedReads++;
      const query: any = { select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: table === 'shop_items' ? pack : null, error: null }) };
      return query;
    } };
  const handler = edgeHandler('../supabase/functions/mint-pack-assets/index.ts', {
    createClient: () => client, getCallerWallets: async () => new Set(['wallet']), packPurchaseAccess,
  });
  const response = await handler(new Request('https://fixture.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer session' }, body: JSON.stringify({ action: 'mint', packId: 'pack', buyerWallet: 'wallet' }),
  }));
  assert.equal(response.status, 403);
  assert.equal(protectedReads, 0);
});

test('every Helius action denies missing and invalid sessions before provider calls', async () => {
  let outbound = 0;
  const handler = edgeHandler('../supabase/functions/helius-proxy/index.ts', {
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: 'invalid' }) } }),
    fetch: async () => { outbound++; return new Response('{}'); },
  });
  for (const action of ['assets-by-owner', 'address-history', 'parse-transactions']) {
    for (const headers of [{}, { Authorization: 'Bearer invalid' }]) {
      const response = await handler(new Request(`https://fixture.invalid?action=${action}`, { method: 'POST', headers, body: '{}' }));
      assert.equal(response.status, 401);
    }
  }
  assert.equal(outbound, 0);
});

test('a signed-in holdings lookup reaches the provider and returns the result', async () => {
  let outbound = 0;
  const handler = edgeHandler('../supabase/functions/helius-proxy/index.ts', {
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'buyer', is_anonymous: false } }, error: null }) } }),
    fetch: async () => { outbound++; return new Response(JSON.stringify({ result: { items: [{ id: 'asset' }] } })); },
  });
  const response = await handler(new Request('https://fixture.invalid?action=assets-by-owner', {
    method: 'POST', headers: { Authorization: 'Bearer session' }, body: JSON.stringify({ owner: '11111111111111111111111111111111' }),
  }));
  assert.equal(response.status, 200);
  assert.equal(outbound, 1);
  assert.deepEqual((await response.json()).items, [{ id: 'asset' }]);
});