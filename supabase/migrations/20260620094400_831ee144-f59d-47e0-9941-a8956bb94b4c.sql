
-- governance_token_holders: own row only (+ admin)
DROP POLICY IF EXISTS "Authenticated users can view token holders" ON public.governance_token_holders;
CREATE POLICY "Users can view their own token holder row"
  ON public.governance_token_holders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- linked_wallets: drop public-profile read
DROP POLICY IF EXISTS "Authenticated users can view linked wallets of public profiles" ON public.linked_wallets;

-- buyback_events: admin only
DROP POLICY IF EXISTS "Anyone can view buyback events" ON public.buyback_events;
CREATE POLICY "Admins can view buyback events"
  ON public.buyback_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- collection_buyback_contributions: admin + collection creator
DROP POLICY IF EXISTS "Public read" ON public.collection_buyback_contributions;
CREATE POLICY "Admins and creators can view contributions"
  ON public.collection_buyback_contributions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR collection_id IN (SELECT id FROM public.collections WHERE creator_id = auth.uid())
  );

-- nft_mints: minter (by wallet) + admin
DROP POLICY IF EXISTS "Authenticated users can view mints" ON public.nft_mints;
CREATE POLICY "Minters and admins can view mints"
  ON public.nft_mints FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR minter_address IN (SELECT wallet_address FROM public.user_profiles WHERE user_id = auth.uid())
  );
