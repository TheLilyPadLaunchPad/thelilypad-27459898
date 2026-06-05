
DROP POLICY IF EXISTS "collections_insert_authenticated" ON public.collections;
CREATE POLICY "collections_insert_owner"
  ON public.collections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Authenticated users can cast votes" ON public.governance_votes;
CREATE POLICY "Authenticated users can cast votes"
  ON public.governance_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = voter_id);

DROP POLICY IF EXISTS "Authenticated users can create delegations" ON public.governance_delegations;
CREATE POLICY "Authenticated users can create delegations"
  ON public.governance_delegations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid()
        AND up.wallet_address = delegator_address
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create proposals" ON public.governance_proposals;
CREATE POLICY "Authenticated users can create proposals"
  ON public.governance_proposals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid()
        AND up.wallet_address = proposer_address
    )
  );

DROP POLICY IF EXISTS "Authenticated insert mint transactions" ON public.mint_transactions;
CREATE POLICY "Authenticated insert mint transactions"
  ON public.mint_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mint_sessions ms
      JOIN public.user_profiles up ON up.wallet_address = ms.creator_address
      WHERE ms.id = mint_transactions.session_id
        AND up.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;
CREATE POLICY "Authenticated users can delete avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
CREATE POLICY "Authenticated users can update avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Authenticated users can delete draft images" ON storage.objects;
CREATE POLICY "Authenticated users can delete draft images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'collection-drafts' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Authenticated users can update draft images" ON storage.objects;
CREATE POLICY "Authenticated users can update draft images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'collection-drafts' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Authenticated users can delete collection images" ON storage.objects;
CREATE POLICY "Authenticated users can delete collection images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'collection-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Authenticated users can update collection images" ON storage.objects;
CREATE POLICY "Authenticated users can update collection images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'collection-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP VIEW IF EXISTS public.streamer_profiles_public;
CREATE VIEW public.streamer_profiles_public
WITH (security_invoker = true)
AS
SELECT
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
