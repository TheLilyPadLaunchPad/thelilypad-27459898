ALTER TABLE public.nft_listings
  ADD COLUMN IF NOT EXISTS delegate_tx text,
  ADD COLUMN IF NOT EXISTS payment_tx text,
  ADD COLUMN IF NOT EXISTS delivery_tx text,
  ADD COLUMN IF NOT EXISTS royalty_amount numeric,
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric,
  ADD COLUMN IF NOT EXISTS seller_proceeds numeric,
  ADD COLUMN IF NOT EXISTS delivery_error text;
CREATE UNIQUE INDEX IF NOT EXISTS nft_listings_payment_tx_unique ON public.nft_listings(payment_tx) WHERE payment_tx IS NOT NULL;