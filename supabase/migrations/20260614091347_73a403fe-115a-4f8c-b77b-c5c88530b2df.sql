
-- 1. Stop broadcasting meta_transactions over Realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'meta_transactions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.meta_transactions';
  END IF;
END $$;

-- 2. Remove permissive public-read policy on private shop-items bucket
DROP POLICY IF EXISTS "Anyone can view shop item files" ON storage.objects;
