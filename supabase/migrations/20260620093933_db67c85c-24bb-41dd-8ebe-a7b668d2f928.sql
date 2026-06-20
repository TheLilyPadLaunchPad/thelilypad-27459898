
-- volume_tracking: owner-only read
DROP POLICY IF EXISTS "Authenticated users can view volume tracking" ON public.volume_tracking;
CREATE POLICY "Users can view their own volume tracking"
  ON public.volume_tracking FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- challenge_badges: remove public leaderboard policy
DROP POLICY IF EXISTS "Anyone can view all badges for leaderboard" ON public.challenge_badges;

-- governance_token_holders: restrict to authenticated
DROP POLICY IF EXISTS "Anyone can view token holders" ON public.governance_token_holders;
CREATE POLICY "Authenticated users can view token holders"
  ON public.governance_token_holders FOR SELECT
  TO authenticated
  USING (true);

-- linked_wallets: restrict public-profile read to authenticated
DROP POLICY IF EXISTS "Anyone can view linked wallets of public profiles" ON public.linked_wallets;
CREATE POLICY "Authenticated users can view linked wallets of public profiles"
  ON public.linked_wallets FOR SELECT
  TO authenticated
  USING (profile_id IN (SELECT id FROM public.user_profiles WHERE is_private = false));

-- platform_fees: admin-only read
DROP POLICY IF EXISTS "Anyone can view platform fees" ON public.platform_fees;
CREATE POLICY "Admins can view platform fees"
  ON public.platform_fees FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
