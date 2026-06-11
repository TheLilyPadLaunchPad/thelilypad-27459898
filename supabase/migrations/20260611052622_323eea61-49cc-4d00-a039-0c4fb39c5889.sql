
ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS last_deploy_error TEXT;

CREATE TABLE IF NOT EXISTS public.deploy_refunds (
  payment_signature TEXT PRIMARY KEY,
  collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL,
  creator_address TEXT NOT NULL,
  lamports BIGINT NOT NULL,
  refund_signature TEXT NOT NULL,
  reason TEXT,
  network TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.deploy_refunds TO service_role;

ALTER TABLE public.deploy_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages deploy refunds"
  ON public.deploy_refunds
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
