import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isWhitelistEligible } from '../src/lib/whitelistEligibility';

function setup(valid = true, anonymous = false) {
  const events: unknown[] = [];
  let verify: (() => Promise<boolean>) | undefined;
  const source = readFileSync(new URL('../src/hooks/useWhitelistEligibility.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function', 'function');
  const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
  const run = new Function('useRef', 'useQuery', 'useAuth', 'supabase', 'isWhitelistEligible', 'window', js + '\nreturn useWhitelistEligibility();');
  run(
    (value: unknown) => ({ current: value }),
    (config: { queryFn: () => Promise<boolean> }) => { verify = config.queryFn; return { data: undefined, isFetching: false }; },
    () => ({ state: 'AUTHENTICATED', walletAddress: 'private-wallet', profile: { user_id: 'private-user' } }),
    { auth: { getSession: async () => ({ data: { session: { user: { id: 'private-user', is_anonymous: anonymous } } } }) },
      rpc: async () => ({ data: [{ user_id: 'private-user', wallet_address: valid ? 'private-wallet' : 'other-wallet', profile_setup_completed: true }] }) },
    isWhitelistEligible,
    { __lovableEvents: { track: (name: string, properties: unknown) => events.push({ name, properties }) } },
  );
  if (!verify) throw new Error('Missing existing eligibility handler');
  return { verify, events };
}

test('verified WL emits once despite repeated eligibility checks and contains no wallet identity', async () => {
  const { verify, events } = setup();
  assert.equal(await verify(), true);
  assert.equal(await verify(), true);
  assert.deepEqual(events, [{ name: 'project.whitelist_claim_succeeded', properties: { entry_point: 'waitroom' } }]);
  assert.equal(JSON.stringify(events).includes('private-wallet'), false);
  assert.equal(JSON.stringify(events).includes('private-user'), false);
});
test('unmatched wallet and anonymous session never emit successful WL claims', async () => {
  for (const setupArgs of [[false, false], [true, true]]) {
    const { verify, events } = setup(...setupArgs);
    assert.equal(await verify(), false);
    assert.deepEqual(events, []);
  }
});