import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Save, Upload, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { WalletLinkStatusPanel } from '@/components/account/WalletLinkStatusPanel';
import { useToast } from '@/hooks/use-toast';
import { useSEO } from '@/hooks/useSEO';
import { loadProfileSettings, saveProfileSettings, type ProfileSettingsRecord } from '@/lib/profileSettings';

export default function ProfileSettings() {
  const [profile, setProfile] = useState<ProfileSettingsRecord | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  useSEO({ title: 'Profile Settings | Lily Launchpad', description: 'Update your Lily Launchpad display name and avatar.' });

  useEffect(() => {
    let active = true;
    let generation = 0;
    async function load() {
      const current = ++generation;
      setLoading(true);
      setProfile(null);
      setError('');
      try {
        const record = await loadProfileSettings(supabase);
        if (!active || current !== generation) return;
        setProfile(record);
        setDisplayName(record.display_name || '');
        setAvatarUrl(record.avatar_url || '');
      } catch (e) {
        if (active && current === generation) setError(e instanceof Error ? e.message : 'Unable to load your profile.');
      } finally {
        if (active && current === generation) setLoading(false);
      }
    }
    void load();
    // Defer auth reads until the auth subscriber releases its session lock.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        ++generation;
        setProfile(null);
        clearTimeout(timer);
        timer = setTimeout(() => { if (active) void load(); }, 0);
      }
    });
    return () => { active = false; clearTimeout(timer); subscription.unsubscribe(); };
  }, [reload]);

  const uploadAvatar = async (file: File) => {
    if (!profile) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Choose a PNG, JPG, WebP, or GIF image.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user || user.is_anonymous || user.id !== profile.user_id) throw new Error('Complete account sign-in before uploading.');
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[file.type];
      const path = `${user.id}/avatar-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser?.id !== user.id) throw new Error('Your account changed. Reload your profile.');
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Avatar upload failed. Please retry.');
    } finally { setUploading(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile || saving || uploading) return;
    setSaving(true);
    setError('');
    try {
      const saved = await saveProfileSettings(supabase, profile, displayName, avatarUrl);
      setProfile(saved);
      setDisplayName(saved.display_name || '');
      setAvatarUrl(saved.avatar_url || '');
      await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['public-profile'] });
      toast({ title: 'Profile settings saved' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save your profile. Please retry.');
    } finally { setSaving(false); }
  };

  const changed = !!profile && (displayName !== (profile.display_name || '') || avatarUrl !== (profile.avatar_url || ''));
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-28 pb-24">
        <div className="mx-auto max-w-xl">
          <h1 className="text-3xl font-bold mb-8">Profile settings</h1>
          <WalletLinkStatusPanel returnTo="/profile/settings" className="mb-8" />
          {loading ? <div role="status" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading profile…</div> : (
            <>
              {error && <p role="alert" className="mb-6 text-destructive break-words">{error}</p>}
              {profile ? (
                <form onSubmit={save} className="space-y-8">
                  <fieldset disabled={saving || uploading} className="space-y-8">
                    <div className="space-y-3">
                      <Label htmlFor="settings-name">Display name</Label>
                      <Input id="settings-name" autoComplete="nickname" value={displayName} onChange={e => setDisplayName(e.target.value)} />
                    </div>
                    <div className="space-y-4">
                      <Label htmlFor="settings-avatar">Avatar</Label>
                      <div className="flex flex-wrap items-center gap-4">
                        <Avatar className="h-24 w-24 shrink-0">
                          <AvatarImage src={avatarUrl || undefined} alt="Your avatar" className="object-cover" />
                          <AvatarFallback>{(displayName.trim() || 'LP').slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}><Upload className="mr-2 h-4 w-4" />{uploading ? 'Uploading…' : 'Upload avatar'}</Button>
                          {avatarUrl && <Button type="button" variant="ghost" onClick={() => setAvatarUrl('')}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>}
                        </div>
                      </div>
                      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Upload avatar image" className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void uploadAvatar(file); }} />
                      <Label htmlFor="settings-avatar" className="block text-muted-foreground">Avatar URL</Label>
                      <Input id="settings-avatar" type="url" inputMode="url" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://" />
                    </div>
                  </fieldset>
                  <div className="flex flex-wrap gap-3 border-t border-border pt-6">
                    <Button type="submit" disabled={!changed || saving || uploading}><Save className="mr-2 h-4 w-4" />{saving ? 'Saving…' : 'Save changes'}</Button>
                    <Button type="button" variant="ghost" disabled={!changed || saving || uploading} onClick={() => { setDisplayName(profile.display_name || ''); setAvatarUrl(profile.avatar_url || ''); setError(''); }}>Cancel changes</Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-3">
                  
                  <Button variant="outline" onClick={() => setReload(value => value + 1)}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}