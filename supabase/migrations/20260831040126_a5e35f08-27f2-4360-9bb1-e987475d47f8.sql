-- Widen featured_collections rails to the curated categories
ALTER TABLE public.featured_collections DROP CONSTRAINT IF EXISTS featured_collections_feature_type_check;

UPDATE public.featured_collections SET feature_type = 'featured_nft' WHERE feature_type = 'homepage';
UPDATE public.featured_collections SET is_active = false WHERE feature_type = 'weekly';
DELETE FROM public.featured_collections WHERE feature_type = 'weekly';

ALTER TABLE public.featured_collections
  ADD CONSTRAINT featured_collections_feature_type_check
  CHECK (feature_type IN ('monthly', 'featured_nft', 'utility_nft', 'memecoin_nft'));