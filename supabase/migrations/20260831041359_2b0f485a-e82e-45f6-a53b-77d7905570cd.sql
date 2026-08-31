ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS collection_id uuid REFERENCES public.collections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shop_items_collection_id
  ON public.shop_items (collection_id)
  WHERE collection_id IS NOT NULL;