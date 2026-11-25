import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { profileSettingsPatch, saveProfileSettings } from '../src/lib/profileSettings';

function fixture(userId = 'owner') {
  const profile = { id: 'existing', user_id: 'owner', display_name: 'Old name', avatar_url: 'https://example.com/old.png', bio: 'Keep my bio', wallet_address: 'original-wallet', referred_by: 'referrer', is_creator: true, profile_setup_completed: true };
  const filters: Record<string, string> = {};
  let updates = 0;
  const query = {
    eq(key: string, value: string) { filters[key] = value; return query; },
    select() { return query; },
    async single() { return { data: { id: profile.id }, error: null }; },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId, is_anonymous: false } }, error: null }) },
    rpc: async () => ({ data: [{ ...profile }], error: null }),
    from: () => ({ update(patch: object) { updates++; Object.assign(profile, patch); return query; } }),
  } as unknown as SupabaseClient;
  return { client, profile, filters, updateCount: () => updates };
}

test('display name update preserves all other existing profile data', async () => {
  const f = fixture();
  const before = { ...f.profile };
  const saved = await saveProfileSettings(f.client, before, 'New name', before.avatar_url);
  assert.deepEqual(saved, { ...before, display_name: 'New name' });
  assert.deepEqual(f.filters, { id: 'existing', user_id: 'owner' });
});
test('avatar update preserves all other existing profile data', async () => {
  const f = fixture();
  const before = { ...f.profile };
  const saved = await saveProfileSettings(f.client, before, before.display_name, 'https://example.com/new.png');
  assert.deepEqual(saved, { ...before, avatar_url: 'https://example.com/new.png' });
});
test('a switched account cannot save the previous account profile', async () => {
  const f = fixture('someone-else');
  await assert.rejects(saveProfileSettings(f.client, f.profile, 'Changed', ''), /sign-in/);
  assert.equal(f.updateCount(), 0);
});
test('only name and avatar are included in the update', () => {
  assert.deepEqual(profileSettingsPatch(' Name ', ' '), { display_name: 'Name', avatar_url: null });
});
test('invalid avatar URLs are rejected before saving', () => {
  for (const url of ['javascript:alert(1)', 'http://example.com/avatar.png', 'not-a-url']) {
    assert.throws(() => profileSettingsPatch('Name', url), /HTTPS/);
  }
});
test('failed writes are reported instead of showing local-only success', async () => {
  const f = fixture();
  f.client.from = (() => ({ update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: null, error: new Error('Write denied') }) }) }) }) }) })) as typeof f.client.from;
  await assert.rejects(saveProfileSettings(f.client, f.profile, 'New', ''), /Write denied/);
});