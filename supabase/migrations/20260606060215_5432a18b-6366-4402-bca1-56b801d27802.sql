ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS vanity_suffix text,
  ADD COLUMN IF NOT EXISTS vanity_skipped boolean NOT NULL DEFAULT false;