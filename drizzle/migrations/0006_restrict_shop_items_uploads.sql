DROP POLICY IF EXISTS "Authenticated users can upload shop item files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view shop item files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own shop item files" ON storage.objects;
DROP POLICY IF EXISTS "shop_items_owner_insert" ON storage.objects;
CREATE POLICY "Users can upload their own shop item files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'shop-items'
  AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR ((storage.foldername(name))[1] = 'platform' AND public.has_role(auth.uid(), 'admin'))
  )
);