CREATE OR REPLACE FUNCTION public.get_profile_social_counts(target_user_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH visibility AS (
    SELECT EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.user_id = target_user_id
        AND (p.is_private = false
             OR auth.uid() = target_user_id
             OR public.has_role(auth.uid(), 'admin'))
    ) AS visible
  )
  SELECT json_build_object(
    'followersCount', CASE WHEN v.visible THEN (SELECT COUNT(*)::int FROM public.followers WHERE streamer_id = target_user_id) ELSE 0 END,
    'followingCount', CASE WHEN v.visible THEN (SELECT COUNT(*)::int FROM public.followers WHERE follower_id = target_user_id) ELSE 0 END,
    'isFollowing', (
      SELECT EXISTS (
        SELECT 1 FROM public.followers
        WHERE follower_id = auth.uid() AND streamer_id = target_user_id
      )
    )
  )
  FROM visibility v;
$function$;

CREATE OR REPLACE FUNCTION public.get_profile_id_by_wallet(wallet_addr text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id FROM public.user_profiles p
  WHERE p.wallet_address = wallet_addr
    AND (p.is_private = false
         OR auth.role() = 'service_role'
         OR auth.uid() = p.user_id
         OR public.has_role(auth.uid(), 'admin'))
  LIMIT 1
$function$;

REVOKE EXECUTE ON FUNCTION public.get_profile_id_by_wallet(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_id_by_wallet(text) TO service_role;

REVOKE INSERT ON public.shop_purchases FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON public.shop_bundle_purchases FROM PUBLIC, anon, authenticated;