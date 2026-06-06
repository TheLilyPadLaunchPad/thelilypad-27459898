ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS mint_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_tx_signature text;

ALTER TABLE public.collections DROP CONSTRAINT IF EXISTS collections_status_check;
ALTER TABLE public.collections
  ADD CONSTRAINT collections_status_check
  CHECK (status = ANY (ARRAY['upcoming'::text, 'live'::text, 'ended'::text, 'closed'::text]));