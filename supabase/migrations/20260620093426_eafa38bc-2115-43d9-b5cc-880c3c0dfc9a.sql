
-- 1. Profile avatar source tracking (for NFT-as-PFP)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS avatar_source text,
  ADD COLUMN IF NOT EXISTS avatar_nft_mint text;

-- 2. market_pulse_cache: per-chain JSON snapshot from external marketplaces
CREATE TABLE IF NOT EXISTS public.market_pulse_cache (
  chain text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.market_pulse_cache TO anon, authenticated;
GRANT ALL ON public.market_pulse_cache TO service_role;

ALTER TABLE public.market_pulse_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read market pulse cache" ON public.market_pulse_cache;
CREATE POLICY "Anyone can read market pulse cache"
  ON public.market_pulse_cache
  FOR SELECT
  USING (true);

-- 3. Security hardening (defensive — these may already be removed):
--    a) Ensure meta_transactions is NOT in the realtime publication
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

--    b) Remove any public/anon SELECT policy on the private shop-items bucket
DROP POLICY IF EXISTS "Anyone can view shop item files" ON storage.objects;
DROP POLICY IF EXISTS "Public can view shop item files" ON storage.objects;
