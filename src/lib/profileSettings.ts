import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProfileSettingsRecord {
  id: string;
  user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export function profileSettingsPatch(displayName: string, avatarUrl: string) {
  const name = displayName.trim();
  const avatar = avatarUrl.trim();
  if (avatar) {
    let url: URL;
    try { url = new URL(avatar); } catch { throw new Error('Enter a valid HTTPS avatar URL.'); }
    if (url.protocol !== 'https:') throw new Error('Enter a valid HTTPS avatar URL.');
  }
  return { display_name: name || null, avatar_url: avatar || null };
}

export async function loadProfileSettings(client: SupabaseClient): Promise<ProfileSettingsRecord> {
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user || user.is_anonymous) throw new Error('Complete account sign-in to edit your profile.');
  const { data, error } = await client.rpc('get_my_profile');
  if (error) throw error;
  const profile = Array.isArray(data) ? data[0] : data;
  if (!profile || profile.user_id !== user.id) throw new Error('Your existing profile could not be loaded.');
  return profile;
}

export async function saveProfileSettings(
  client: SupabaseClient,
  original: ProfileSettingsRecord,
  displayName: string,
  avatarUrl: string,
): Promise<ProfileSettingsRecord> {
  const patch = profileSettingsPatch(displayName, avatarUrl);
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user || user.is_anonymous || user.id !== original.user_id) {
    throw new Error('Complete account sign-in to edit your profile.');
  }
  const { data, error } = await client.from('user_profiles')
    .update(patch).eq('id', original.id).eq('user_id', user.id).select('id').single();
  if (error) throw error;
  if (!data || data.id !== original.id) throw new Error('Your profile was not updated. Please retry.');
  const saved = await loadProfileSettings(client);
  if (saved.id !== original.id || saved.display_name !== patch.display_name || saved.avatar_url !== patch.avatar_url) {
    throw new Error('The saved changes could not be confirmed. Reload your profile before retrying.');
  }
  return saved;
}