
-- 1. user_profiles balance
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS native_token_balance NUMERIC NOT NULL DEFAULT 0;

-- 2. shop_item_contents arweave uri
ALTER TABLE public.shop_item_contents
  ADD COLUMN IF NOT EXISTS arweave_uri TEXT;

-- 3. minted_nfts extensions
ALTER TABLE public.minted_nfts
  ADD COLUMN IF NOT EXISTS creator_address TEXT,
  ADD COLUMN IF NOT EXISTS metadata_uri TEXT,
  ADD COLUMN IF NOT EXISTS asset_id TEXT,
  ADD COLUMN IF NOT EXISTS mint_transaction TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'minted',
  ADD COLUMN IF NOT EXISTS chain TEXT DEFAULT 'solana';

ALTER TABLE public.minted_nfts ALTER COLUMN tx_hash DROP NOT NULL;
ALTER TABLE public.minted_nfts ALTER COLUMN owner_id DROP NOT NULL;

-- 4. token_transactions
CREATE TABLE IF NOT EXISTS public.token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  transaction_type TEXT NOT NULL,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.token_transactions TO authenticated;
GRANT ALL ON public.token_transactions TO service_role;

ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own token transactions"
  ON public.token_transactions FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT id FROM public.user_profiles WHERE user_id = auth.uid())
         OR user_id = auth.uid());

CREATE POLICY "Users insert own token transactions"
  ON public.token_transactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM public.user_profiles WHERE user_id = auth.uid())
              OR user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_token_tx_user ON public.token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_tx_ref ON public.token_transactions(reference_id);

-- 5. marketplace_applications
CREATE TABLE IF NOT EXISTS public.marketplace_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_address TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  image_url TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.marketplace_applications TO authenticated;
GRANT ALL ON public.marketplace_applications TO service_role;

ALTER TABLE public.marketplace_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own applications"
  ON public.marketplace_applications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create applications"
  ON public.marketplace_applications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins update applications"
  ON public.marketplace_applications FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_marketplace_applications_updated_at
  BEFORE UPDATE ON public.marketplace_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
