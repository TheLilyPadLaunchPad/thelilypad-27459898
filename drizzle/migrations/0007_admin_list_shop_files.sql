CREATE OR REPLACE FUNCTION public.admin_list_shop_files(limit_count integer DEFAULT 200)
RETURNS TABLE(
  object_id uuid, file_path text, uploaded_at timestamptz, size_bytes bigint, mime_type text,
  uploader_id uuid, uploader_name text, uploader_wallet text,
  item_id uuid, item_name text, access jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT o.id, o.name, o.created_at,
         NULLIF(o.metadata->>'size','')::bigint, o.metadata->>'mimetype',
         up.user_id, up.display_name, up.wallet_address,
         si.id, si.name,
         COALESCE((
           SELECT jsonb_agg(DISTINCT jsonb_build_object(
             'user_id', sp.user_id, 'name', bp.display_name, 'wallet', bp.wallet_address))
           FROM public.shop_item_contents c2
           JOIN public.shop_purchases sp ON sp.item_id = c2.item_id
           LEFT JOIN public.user_profiles bp ON bp.user_id = sp.user_id
           WHERE c2.file_url LIKE '%/' || o.name
         ), '[]'::jsonb)
  FROM storage.objects o
  LEFT JOIN public.user_profiles up
    ON up.user_id::text = (storage.foldername(o.name))[1]
  LEFT JOIN LATERAL (
    SELECT c.item_id FROM public.shop_item_contents c
    WHERE c.file_url LIKE '%/' || o.name LIMIT 1
  ) sc ON true
  LEFT JOIN public.shop_items si ON si.id = sc.item_id
  WHERE o.bucket_id = 'shop-items'
  ORDER BY o.created_at DESC
  LIMIT GREATEST(1, LEAST(limit_count, 1000));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_shop_files(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_shop_files(integer) TO authenticated;