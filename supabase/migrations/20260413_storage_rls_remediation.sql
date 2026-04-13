-- ═══════════════════════════════════════════════════════════════════════════════
-- STORAGE RLS REMEDIATION
-- Target: storage.objects
-- Objective: Eliminate anonymous/permissive access and enforce folder-based ownership
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. DROP ALL IDENTIFIED PERMISSIVE POLICIES ──────────────────────────────
-- Bulk cleanup of old policies across all migrations

DO $$ 
BEGIN
    -- Delete/Update policies (High Risk)
    DROP POLICY IF EXISTS "Anyone can delete avatars" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can update avatars" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can delete collection images" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can update collection images" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can delete draft images" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can update draft images" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own audio" ON storage.objects;
    DROP POLICY IF EXISTS "Users can update their own audio" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own channel emotes" ON storage.objects;
    DROP POLICY IF EXISTS "Users can update their own channel emotes" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own shop item files" ON storage.objects;
    DROP POLICY IF EXISTS "Users can update their own shop item files" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own stream thumbnails" ON storage.objects;
    DROP POLICY IF EXISTS "Users can update their own stream thumbnails" ON storage.objects;
    
    -- Select/View policies (Low/Medium Risk)
    DROP POLICY IF EXISTS "Anyone can view audio files" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can view channel emotes" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can view shop item files" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can view stream thumbnails" ON storage.objects;
    DROP POLICY IF EXISTS "Draft images are publicly accessible" ON storage.objects;
    DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
    DROP POLICY IF EXISTS "Public can view collection images" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can view draft images" ON storage.objects;

    -- NFT Storage Project specific (from nft_storage_buckets.sql)
    DROP POLICY IF EXISTS "nft_images_anon_insert" ON storage.objects;
    DROP POLICY IF EXISTS "nft_images_anon_update" ON storage.objects;
    DROP POLICY IF EXISTS "nft_images_anon_delete" ON storage.objects;
    DROP POLICY IF EXISTS "nft_metadata_anon_insert" ON storage.objects;
    DROP POLICY IF EXISTS "nft_metadata_anon_update" ON storage.objects;
    DROP POLICY IF EXISTS "nft_metadata_anon_delete" ON storage.objects;
    DROP POLICY IF EXISTS "collection_images_anon_insert" ON storage.objects;
    DROP POLICY IF EXISTS "collection_images_anon_update" ON storage.objects;
    DROP POLICY IF EXISTS "collection_images_anon_delete" ON storage.objects;
END $$;

-- ─── 2. IMPLEMENT SECURE SELECT POLICIES ────────────────────────────────────

-- PUBLIC VIEWING: Allowed for CDN-like assets (Avatars, Emotes, Shop, Thumbnails, Live Collection Images)
CREATE POLICY "Public: Anyone can view public assets"
ON storage.objects FOR SELECT
USING (bucket_id IN ('avatars', 'collection-images', 'channel-emotes', 'shop-items', 'stream-thumbnails', 'nft-images', 'nft-metadata'));

-- PRIVATE VIEWING: Restricted to authenticated users only (Drafts, Audio)
CREATE POLICY "Private: Authenticated users can view internal assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id IN ('collection-drafts', 'collection-audio'));

-- ─── 3. IMPLEMENT OWNER-LOCKED MUTATION POLICIES ─────────────────────────────
-- Rule: Users must be authenticated and path must start with their UID

-- STANDARD BUCKETS: path is {userId}/...
CREATE POLICY "Standard: Users can manage their own files"
ON storage.objects FOR ALL
TO authenticated
USING (
    bucket_id IN ('avatars', 'collection-images', 'channel-emotes', 'shop-items', 'stream-thumbnails', 'collection-audio', 'nft-images', 'nft-metadata')
    AND 
    (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id IN ('avatars', 'collection-images', 'channel-emotes', 'shop-items', 'stream-thumbnails', 'collection-audio', 'nft-images', 'nft-metadata')
    AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

-- DRAFT BUCKET: path is drafts/{userId}/...
CREATE POLICY "Drafts: Users can manage their own drafts"
ON storage.objects FOR ALL
TO authenticated
USING (
    bucket_id = 'collection-drafts'
    AND 
    (storage.foldername(name))[1] = 'drafts'
    AND
    (storage.foldername(name))[2] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'collection-drafts'
    AND 
    (storage.foldername(name))[1] = 'drafts'
    AND
    (storage.foldername(name))[2] = auth.uid()::text
);

-- ─── 4. CATCH-ALL FOR ADMINS (OPTIONAL BUT RECOMMENDED) ────────────────────
-- Allows admins to cleanup or moderate if needed
-- Requires 'has_role' function which exists in your migrations
CREATE POLICY "Admins: Global full access"
ON storage.objects FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
