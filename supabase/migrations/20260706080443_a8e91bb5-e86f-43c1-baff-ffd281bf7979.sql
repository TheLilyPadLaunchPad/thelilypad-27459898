-- Security hardening for storage buckets and application tables

-- 1) Storage: remove any lingering public SELECT policy on shop-items bucket
DROP POLICY IF EXISTS "Anyone can view shop item files" ON storage.objects;

-- 2) Storage: enforce folder ownership on channel-emotes uploads
DROP POLICY IF EXISTS "Authenticated users can upload channel emotes" ON storage.objects;
CREATE POLICY "Authenticated users can upload channel emotes"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'channel-emotes'
    AND auth.uid() IS NOT NULL
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- 3) Storage: enforce folder ownership on collection-audio uploads
DROP POLICY IF EXISTS "Authenticated users can upload audio" ON storage.objects;
CREATE POLICY "Authenticated users can upload audio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'collection-audio'
    AND auth.uid() IS NOT NULL
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- 4) Applicant self-read via SECURITY DEFINER views that exclude internal
--    columns (admin_notes, interview_notes, reviewed_by). Admins continue
--    to read all columns via their existing table-level policies.

-- creator_beta_applications
DROP POLICY IF EXISTS "Applicants view own application" ON public.creator_beta_applications;

CREATE OR REPLACE VIEW public.my_creator_beta_application
WITH (security_invoker = off) AS
SELECT
  id, user_id, status, display_name, email, content_type,
  portfolio_urls, social_links, motivation,
  interview_room_id, interview_scheduled_at,
  created_at, updated_at, reviewed_at
FROM public.creator_beta_applications
WHERE user_id = auth.uid();

GRANT SELECT ON public.my_creator_beta_application TO authenticated;

-- streamer_applications
DROP POLICY IF EXISTS "Applicants view own streamer application" ON public.streamer_applications;

CREATE OR REPLACE VIEW public.my_streamer_application
WITH (security_invoker = off) AS
SELECT
  id, user_id, display_name, email, content_type,
  platform_links, schedule_description, motivation, social_links,
  status, reviewed_at, created_at, updated_at
FROM public.streamer_applications
WHERE user_id = auth.uid();

GRANT SELECT ON public.my_streamer_application TO authenticated;