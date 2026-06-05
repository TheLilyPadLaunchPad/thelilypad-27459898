
-- 1) allowlist_entries: require ownership of the target collection
DROP POLICY IF EXISTS "Users can create allowlist entries" ON public.allowlist_entries;
CREATE POLICY "Users can create allowlist entries"
ON public.allowlist_entries
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM public.collections c
    WHERE c.id = allowlist_entries.collection_id
      AND c.creator_id = auth.uid()
  )
);

-- 2) mint_sessions: require creator_address to belong to caller's wallet
DROP POLICY IF EXISTS "Authenticated insert mint sessions" ON public.mint_sessions;
CREATE POLICY "Authenticated insert mint sessions"
ON public.mint_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
      AND up.wallet_address = mint_sessions.creator_address
  )
);

-- 3) governance_votes: require voter_address to belong to caller
DROP POLICY IF EXISTS "Authenticated users can cast votes" ON public.governance_votes;
CREATE POLICY "Authenticated users can cast votes"
ON public.governance_votes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = voter_id
  AND EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
      AND up.wallet_address = governance_votes.voter_address
  )
);

-- 4) volume_tracking: forbid null user_id on user-initiated inserts
DROP POLICY IF EXISTS "Authenticated users can insert volume" ON public.volume_tracking;
CREATE POLICY "Authenticated users can insert volume"
ON public.volume_tracking
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  (auth.role() = 'service_role')
  OR (user_id IS NOT NULL AND user_id = auth.uid())
);

-- 5) storage: enforce folder ownership on uploads
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Authenticated users can upload draft images" ON storage.objects;
CREATE POLICY "Authenticated users can upload draft images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'collection-drafts'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Authenticated users can upload collection images" ON storage.objects;
CREATE POLICY "Authenticated users can upload collection images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'collection-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
