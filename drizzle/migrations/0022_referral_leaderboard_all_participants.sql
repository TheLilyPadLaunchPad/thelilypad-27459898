CREATE OR REPLACE FUNCTION public.get_referral_leaderboard(limit_count integer DEFAULT 500)
RETURNS TABLE(rank_position integer, display_name text, avatar_url text, referral_count integer, is_me boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH counts AS (
    SELECT s.referrer_id, COUNT(*)::int AS n
    FROM public.referral_signups s
    GROUP BY s.referrer_id
  ),
  participants AS (
    SELECT c.user_id, MIN(c.created_at) AS joined_at
    FROM public.referral_codes c
    GROUP BY c.user_id
  )
  SELECT
    (ROW_NUMBER() OVER (ORDER BY COALESCE(n.n, 0) DESC, pt.joined_at ASC, pt.user_id))::int,
    CASE WHEN COALESCE(p.is_private, false) THEN NULL ELSE p.display_name END,
    CASE WHEN COALESCE(p.is_private, false) THEN NULL ELSE p.avatar_url END,
    COALESCE(n.n, 0),
    (auth.uid() IS NOT NULL AND pt.user_id = auth.uid())
  FROM participants pt
  LEFT JOIN counts n ON n.referrer_id = pt.user_id
  LEFT JOIN LATERAL (
    SELECT up.display_name, up.avatar_url, up.is_private
    FROM public.user_profiles up
    WHERE up.user_id = pt.user_id
    LIMIT 1
  ) p ON true
  ORDER BY 1
  LIMIT GREATEST(1, LEAST(COALESCE(limit_count, 500), 1000));
$$;

REVOKE ALL ON FUNCTION public.get_referral_leaderboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_referral_leaderboard(integer) TO anon, authenticated, service_role;