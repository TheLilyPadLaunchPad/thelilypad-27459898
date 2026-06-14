ALTER TABLE public.earnings
  ADD COLUMN IF NOT EXISTS tx_signature text,
  ADD COLUMN IF NOT EXISTS from_address text;

CREATE UNIQUE INDEX IF NOT EXISTS earnings_tx_signature_uniq
  ON public.earnings (tx_signature)
  WHERE tx_signature IS NOT NULL;

ALTER TABLE public.shop_purchases
  ADD COLUMN IF NOT EXISTS from_address text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Only enforce uniqueness for real on-chain signatures, not legacy placeholders.
CREATE UNIQUE INDEX IF NOT EXISTS shop_purchases_real_tx_uniq
  ON public.shop_purchases (tx_hash)
  WHERE tx_hash IS NOT NULL AND tx_hash NOT LIKE 'free_%';