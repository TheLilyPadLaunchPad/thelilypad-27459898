ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS collection_address TEXT,
  ADD COLUMN IF NOT EXISTS tree_address TEXT;

UPDATE public.shop_items
SET mint_authority = 'legacy-needs-redeploy'
WHERE mint_authority IS NULL
  AND collection_address IS NOT NULL
  AND tree_address IS NOT NULL;