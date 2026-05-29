
-- 1. error_logs: restrict INSERT to authenticated users only, owning their row
DROP POLICY IF EXISTS "Anyone can log errors" ON public.error_logs;
CREATE POLICY "Authenticated users can log own errors"
ON public.error_logs FOR INSERT
TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- 2. nft_mints: require minter_address to belong to the auth user's profile
DROP POLICY IF EXISTS "Authenticated users can record mints" ON public.nft_mints;
CREATE POLICY "Users can record own mints"
ON public.nft_mints FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid() AND wallet_address = minter_address
  )
);

-- 3. blocked_patterns: drop authenticated SELECT (admin-only via existing ALL policy)
DROP POLICY IF EXISTS "Authenticated users can view active blocked patterns" ON public.blocked_patterns;

-- 4. user_nonces: drop public read; service_role policy already exists
DROP POLICY IF EXISTS "Anyone can read nonces" ON public.user_nonces;

-- 5. waitroom_messages: drop wallet_address column (sensitive PII)
ALTER TABLE public.waitroom_messages DROP COLUMN IF EXISTS wallet_address;

-- 6. Split payout_wallet_address into owner-only table
CREATE TABLE IF NOT EXISTS public.user_payout_wallets (
  user_id uuid PRIMARY KEY,
  payout_wallet_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payout_wallets TO authenticated;
GRANT ALL ON public.user_payout_wallets TO service_role;
ALTER TABLE public.user_payout_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own payout wallet" ON public.user_payout_wallets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own payout wallet" ON public.user_payout_wallets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own payout wallet" ON public.user_payout_wallets
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own payout wallet" ON public.user_payout_wallets
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_user_payout_wallets_updated_at
  BEFORE UPDATE ON public.user_payout_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing data
INSERT INTO public.user_payout_wallets (user_id, payout_wallet_address)
SELECT user_id, payout_wallet_address
FROM public.user_profiles
WHERE payout_wallet_address IS NOT NULL AND user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS payout_wallet_address;

-- 7. shop-items bucket: make private + restrict reads
UPDATE storage.buckets SET public = false WHERE id = 'shop-items';
DROP POLICY IF EXISTS "Anyone can view shop item files" ON storage.objects;
CREATE POLICY "Purchasers and creators can view shop item files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'shop-items' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.shop_item_contents sic
      JOIN public.shop_purchases sp ON sp.item_id = sic.item_id
      WHERE sp.user_id = auth.uid()
        AND sic.file_url LIKE '%/' || name
    )
  )
);
