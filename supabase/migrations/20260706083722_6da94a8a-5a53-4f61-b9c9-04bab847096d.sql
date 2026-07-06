-- Replace SECURITY DEFINER views with SECURITY DEFINER functions (RPC) that
-- return only non-sensitive columns for the current applicant. This resolves
-- the Supabase linter "security_definer_view" finding while preserving the
-- guarantee that admin_notes / interview_notes / reviewed_by are never
-- exposed to applicants.

DROP VIEW IF EXISTS public.my_creator_beta_application;
DROP VIEW IF EXISTS public.my_streamer_application;

CREATE OR REPLACE FUNCTION public.get_my_creator_beta_application()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  status text,
  display_name text,
  email text,
  content_type text,
  portfolio_urls text[],
  social_links jsonb,
  motivation text,
  interview_room_id text,
  interview_scheduled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  reviewed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, user_id, status, display_name, email, content_type,
         portfolio_urls, social_links, motivation, interview_room_id,
         interview_scheduled_at, created_at, updated_at, reviewed_at
  FROM public.creator_beta_applications
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_creator_beta_application() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_creator_beta_application() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_streamer_application()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  display_name text,
  email text,
  content_type text,
  platform_links text[],
  schedule_description text,
  motivation text,
  social_links jsonb,
  status text,
  reviewed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, user_id, display_name, email, content_type, platform_links,
         schedule_description, motivation, social_links, status,
         reviewed_at, created_at, updated_at
  FROM public.streamer_applications
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_streamer_application() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_streamer_application() TO authenticated;

-- Belt-and-suspenders: ensure the leaky public storage SELECT policy on the
-- private shop-items bucket is gone. The authenticated purchaser/creator
-- policy remains in place.
DROP POLICY IF EXISTS "Anyone can view shop item files" ON storage.objects;