
-- 1) nft_mints: drop public read, allow authenticated read only
DROP POLICY IF EXISTS "Anyone can view mints" ON public.nft_mints;
CREATE POLICY "Authenticated users can view mints"
ON public.nft_mints
FOR SELECT
TO authenticated
USING (true);

-- 2) referral_signups: drop broad read; "Users can view their own referrals" remains
DROP POLICY IF EXISTS "Anyone can view referral leaderboard data" ON public.referral_signups;
