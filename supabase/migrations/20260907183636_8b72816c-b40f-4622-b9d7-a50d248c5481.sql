ALTER TABLE public.shop_purchases
  ADD COLUMN IF NOT EXISTS payment_signature TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS delivery_results JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS shop_purchases_payment_signature_key
  ON public.shop_purchases (payment_signature)
  WHERE payment_signature IS NOT NULL;

ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS mint_authority TEXT;