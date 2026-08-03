-- Remove permissive shop-items write policies
DROP POLICY IF EXISTS "Authenticated users can upload shop items" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own shop items" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own shop items" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own shop items" ON storage.objects;
DROP POLICY IF EXISTS "shop_items_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "shop_items_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "shop_items_owner_delete" ON storage.objects;

-- Owner-scoped writes only (defense in depth; app uploads use signed upload URLs)
CREATE POLICY "shop_items_owner_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'shop-items'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR ((storage.foldername(name))[1] = 'platform' AND public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "shop_items_owner_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'shop-items'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR ((storage.foldername(name))[1] = 'platform' AND public.has_role(auth.uid(), 'admin'))
  )
)
WITH CHECK (
  bucket_id = 'shop-items'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR ((storage.foldername(name))[1] = 'platform' AND public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "shop_items_owner_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'shop-items'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR ((storage.foldername(name))[1] = 'platform' AND public.has_role(auth.uid(), 'admin'))
  )
);