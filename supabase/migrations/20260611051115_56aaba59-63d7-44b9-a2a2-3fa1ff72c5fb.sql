
-- 1) Remove meta_transactions from realtime publication to stop leaking typed_data/signatures
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
END$$;

-- 2) Drop the overly-permissive public SELECT policy on shop-items storage bucket
DROP POLICY IF EXISTS "Anyone can view shop item files" ON storage.objects;
