-- Per-collection buyback opt-in fields
ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS buyback_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buyback_contribution_pct numeric(5,2);

ALTER TABLE public.collections
  DROP CONSTRAINT IF EXISTS collections_buyback_pct_range;
ALTER TABLE public.collections
  ADD CONSTRAINT collections_buyback_pct_range
  CHECK (buyback_contribution_pct IS NULL
         OR (buyback_contribution_pct >= 50 AND buyback_contribution_pct <= 100));

-- Per-collection contribution ledger
CREATE TABLE IF NOT EXISTS public.collection_buyback_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.buyback_programs(id),
  event_id uuid REFERENCES public.buyback_events(id),
  chain text NOT NULL DEFAULT 'solana',
  mint_revenue_sol numeric NOT NULL,
  contribution_pct numeric(5,2) NOT NULL,
  contribution_sol numeric NOT NULL,
  tx_signature text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.collection_buyback_contributions TO anon, authenticated;
GRANT ALL ON public.collection_buyback_contributions TO service_role;

ALTER TABLE public.collection_buyback_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read" ON public.collection_buyback_contributions;
CREATE POLICY "Public read" ON public.collection_buyback_contributions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role write" ON public.collection_buyback_contributions
;
CREATE POLICY "Service role write" ON public.collection_buyback_contributions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS set_contribution_updated_at ON public.collection_buyback_contributions;
CREATE TRIGGER set_contribution_updated_at
  BEFORE UPDATE ON public.collection_buyback_contributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_cbc_collection ON public.collection_buyback_contributions(collection_id);
CREATE INDEX IF NOT EXISTS idx_cbc_status ON public.collection_buyback_contributions(status);