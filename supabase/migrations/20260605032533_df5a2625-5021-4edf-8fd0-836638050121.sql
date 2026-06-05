
-- 1. Drop overly permissive public SELECT on shop-items bucket
DROP POLICY IF EXISTS "Anyone can view shop item files" ON storage.objects;

-- 2. Restrict mint_sessions UPDATE to owner
DROP POLICY IF EXISTS "Authenticated update mint sessions" ON public.mint_sessions;
CREATE POLICY "Owners can update their mint sessions"
ON public.mint_sessions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
      AND up.wallet_address = mint_sessions.creator_address
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
      AND up.wallet_address = mint_sessions.creator_address
  )
);

-- 3. Restrict referral_signups INSERT to self-as-referred
DROP POLICY IF EXISTS "System can insert referral signups" ON public.referral_signups;
CREATE POLICY "Users can register themselves as referred"
ON public.referral_signups
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = referred_user_id);
