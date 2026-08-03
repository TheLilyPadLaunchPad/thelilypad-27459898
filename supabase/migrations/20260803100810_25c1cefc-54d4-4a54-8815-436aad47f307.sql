-- 1. mint_sessions: owner + admin only
DROP POLICY IF EXISTS "Anyone can read mint sessions" ON public.mint_sessions;
CREATE POLICY "Owners and admins can read mint sessions"
ON public.mint_sessions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
      AND up.wallet_address = mint_sessions.creator_address
  )
);

-- 2. mint_transactions: session owner + admin only
DROP POLICY IF EXISTS "Anyone can read mint transactions" ON public.mint_transactions;
CREATE POLICY "Session owners and admins can read mint transactions"
ON public.mint_transactions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.mint_sessions ms
    JOIN public.user_profiles up ON up.wallet_address = ms.creator_address
    WHERE ms.id = mint_transactions.session_id
      AND up.user_id = auth.uid()
  )
);

-- 3. stream_chat_messages: hide wallet_address from general reads (incl. realtime payloads)
REVOKE SELECT ON public.stream_chat_messages FROM anon, authenticated;
GRANT SELECT (id, playback_id, user_id, username, message, message_type, sticker_url, sticker_name, sticker_item_id, created_at)
  ON public.stream_chat_messages TO anon, authenticated;
GRANT ALL ON public.stream_chat_messages TO service_role;

-- 4. user_profiles: hide native_token_balance and auth_user_id from general reads
REVOKE SELECT ON public.user_profiles FROM anon, authenticated;
GRANT SELECT (
  id, user_id, wallet_address, display_name, bio, avatar_url, banner_url,
  avatar_nft_mint, avatar_source, categories, schedule, playlist_ids,
  is_collector, is_creator, is_streamer, is_verified, is_private,
  profile_setup_completed, referred_by,
  social_twitter, social_discord, social_instagram, social_youtube, social_tiktok,
  verification_attestation, verification_attestation_network,
  created_at, updated_at
) ON public.user_profiles TO anon, authenticated;
GRANT ALL ON public.user_profiles TO service_role;

-- Secure accessor so a signed-in user can still read their own full profile
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.user_profiles
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.user_profiles
  WHERE auth.uid() IS NOT NULL AND user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;