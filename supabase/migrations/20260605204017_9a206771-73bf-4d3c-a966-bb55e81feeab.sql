
DROP VIEW IF EXISTS public.streamer_profiles_public;
CREATE VIEW public.streamer_profiles_public
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  display_name,
  bio,
  avatar_url,
  banner_url,
  social_twitter,
  social_youtube,
  social_discord,
  social_instagram,
  social_tiktok,
  schedule,
  categories,
  playlist_ids,
  preferred_currency,
  is_verified,
  created_at,
  updated_at
FROM public.streamer_profiles;

GRANT SELECT ON public.streamer_profiles_public TO anon, authenticated;
