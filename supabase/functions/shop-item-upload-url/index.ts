import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'shop-items';
const MAX_PATH_LENGTH = 300;
// Only these extensions may be uploaded to the shop-items bucket
const ALLOWED_EXT = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg',
  'mp3', 'wav', 'ogg', 'mp4', 'webm',
  'pdf', 'zip', 'json', 'txt',
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Reject traversal, absolute paths, control chars and odd segments. */
function isSafePath(path: string) {
  if (!path || path.length > MAX_PATH_LENGTH) return false;
  if (path.startsWith('/') || path.includes('..') || path.includes('//')) return false;
  if (/[\x00-\x1f\\]/.test(path)) return false;
  const segments = path.split('/');
  if (segments.length < 2 || segments.length > 5) return false;
  return segments.every((s) => s.length > 0 && /^[A-Za-z0-9._-]+$/.test(s));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Authentication required' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !userData?.user) {
      return json({ error: 'Invalid or expired token' }, 401);
    }
    const userId = userData.user.id;

    let body: { path?: string; platform?: boolean };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const path = typeof body.path === 'string' ? body.path.trim() : '';
    if (!isSafePath(path)) {
      return json({ error: 'Invalid upload path' }, 400);
    }

    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXT.has(ext)) {
      return json({ error: `File type ".${ext}" is not allowed` }, 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const prefix = path.split('/')[0];
    if (prefix === 'platform') {
      // Platform/official assets: admins only
      const { data: isAdmin, error: roleError } = await admin.rpc('has_role', {
        _user_id: userId,
        _role: 'admin',
      });
      if (roleError || !isAdmin) {
        return json({ error: 'Not authorized to upload platform assets' }, 403);
      }
    } else if (prefix !== userId) {
      // Everyone else may only write inside their own user-id folder
      return json({ error: 'You can only upload to your own folder' }, 403);
    }

    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: false });

    if (error || !data) {
      console.error('createSignedUploadUrl failed:', error?.message);
      return json({ error: error?.message ?? 'Failed to create upload URL' }, 400);
    }

    return json({ path: data.path, token: data.token, signedUrl: data.signedUrl });
  } catch (e) {
    console.error('shop-item-upload-url error:', e instanceof Error ? e.message : e);
    return json({ error: 'Internal server error' }, 500);
  }
});
