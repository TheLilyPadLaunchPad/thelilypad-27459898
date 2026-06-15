
-- 1. Extend app_role enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.app_role'::regtype AND enumlabel = 'buyback_operator'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'buyback_operator';
  END IF;
END$$;

-- 2. buyback_programs — per-token strategy config
CREATE TABLE IF NOT EXISTS public.buyback_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  chain text NOT NULL CHECK (chain IN ('solana','monad')),
  network text NOT NULL DEFAULT 'mainnet',
  token_mint text NOT NULL,
  dex text NOT NULL DEFAULT 'jupiter' CHECK (dex IN ('jupiter','uniswap')),
  router_address text,
  wmon_address text,
  slippage_bps integer NOT NULL DEFAULT 100 CHECK (slippage_bps BETWEEN 1 AND 5000),
  min_interval_minutes integer NOT NULL DEFAULT 60 CHECK (min_interval_minutes >= 1),
  max_notional_per_run numeric NOT NULL DEFAULT 1 CHECK (max_notional_per_run > 0),
  min_pool_balance numeric NOT NULL DEFAULT 0.1 CHECK (min_pool_balance >= 0),
  enabled boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.buyback_programs TO anon, authenticated;
GRANT ALL ON public.buyback_programs TO service_role;

ALTER TABLE public.buyback_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view enabled buyback programs"
  ON public.buyback_programs FOR SELECT
  USING (enabled = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage buyback programs"
  ON public.buyback_programs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_buyback_programs_updated_at
  BEFORE UPDATE ON public.buyback_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Extend buyback_events with state machine
ALTER TABLE public.buyback_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('queued','executing','confirmed','failed')),
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.buyback_programs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chain text,
  ADD COLUMN IF NOT EXISTS requested_by uuid,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error text;

-- Allow legacy NOT NULL fields to be nullable for queued rows
ALTER TABLE public.buyback_events ALTER COLUMN trigger_volume DROP NOT NULL;
ALTER TABLE public.buyback_events ALTER COLUMN mon_spent DROP NOT NULL;
ALTER TABLE public.buyback_events ALTER COLUMN tx_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_buyback_events_idem
  ON public.buyback_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_buyback_events_status_sched
  ON public.buyback_events (status, scheduled_for);

-- 4. Tighten RLS: only security-definer RPCs may write
DROP POLICY IF EXISTS "Service role can manage buyback events" ON public.buyback_events;

CREATE POLICY "Service role full access to buyback events"
  ON public.buyback_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 5. RPCs

-- Queue a buyback (admin or operator, or service role)
CREATE OR REPLACE FUNCTION public.queue_buyback(
  p_program_id uuid,
  p_amount numeric,
  p_idempotency_key text DEFAULT NULL,
  p_scheduled_for timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog public.buyback_programs;
  v_event_id uuid;
  v_caller uuid := auth.uid();
  v_is_service boolean := (auth.role() = 'service_role');
BEGIN
  IF NOT v_is_service
     AND NOT public.has_role(v_caller, 'admin')
     AND NOT public.has_role(v_caller, 'buyback_operator') THEN
    RAISE EXCEPTION 'Not authorized to queue buybacks';
  END IF;

  SELECT * INTO v_prog FROM public.buyback_programs WHERE id = p_program_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Buyback program not found';
  END IF;
  IF NOT v_prog.enabled THEN
    RAISE EXCEPTION 'Buyback program is disabled';
  END IF;
  IF p_amount <= 0 OR p_amount > v_prog.max_notional_per_run THEN
    RAISE EXCEPTION 'Amount % outside allowed range (0, %]', p_amount, v_prog.max_notional_per_run;
  END IF;

  -- Idempotent insert: if key already exists, return that event id
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_event_id
    FROM public.buyback_events
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_event_id;
    END IF;
  END IF;

  INSERT INTO public.buyback_events (
    program_id, chain, token_address, status,
    mon_spent, trigger_volume, tokens_bought,
    idempotency_key, requested_by, scheduled_for
  ) VALUES (
    p_program_id, v_prog.chain, v_prog.token_mint, 'queued',
    p_amount, p_amount, 0,
    p_idempotency_key, v_caller, p_scheduled_for
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_buyback(uuid, numeric, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_buyback(uuid, numeric, text, timestamptz) TO authenticated, service_role;

-- Claim next queued event for execution (service role only)
CREATE OR REPLACE FUNCTION public.claim_next_buyback()
RETURNS SETOF public.buyback_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only service role can claim buybacks';
  END IF;

  SELECT e.id INTO v_id
  FROM public.buyback_events e
  JOIN public.buyback_programs p ON p.id = e.program_id
  WHERE e.status = 'queued'
    AND e.scheduled_for <= now()
    AND p.enabled = true
    AND (p.last_run_at IS NULL OR p.last_run_at + (p.min_interval_minutes || ' minutes')::interval <= now())
  ORDER BY e.scheduled_for ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.buyback_events
     SET status = 'executing', started_at = now(), attempts = attempts + 1
   WHERE id = v_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_buyback() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_buyback() TO service_role;

-- Mark complete (service role only)
CREATE OR REPLACE FUNCTION public.complete_buyback_event(
  p_event_id uuid,
  p_tx_hash text,
  p_tokens_bought numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only service role can complete buybacks';
  END IF;

  UPDATE public.buyback_events
     SET status = 'confirmed',
         confirmed_at = now(),
         tx_hash = p_tx_hash,
         tokens_bought = p_tokens_bought,
         executed_at = now()
   WHERE id = p_event_id AND status = 'executing'
   RETURNING program_id INTO v_program_id;

  IF v_program_id IS NOT NULL THEN
    UPDATE public.buyback_programs
       SET last_run_at = now()
     WHERE id = v_program_id;

    UPDATE public.buyback_pool
       SET total_buybacks_executed = total_buybacks_executed + 1,
           last_buyback_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_buyback_event(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_buyback_event(uuid, text, numeric) TO service_role;

-- Mark failed (service role only) — circuit breaker disables program after 3 consecutive fails
CREATE OR REPLACE FUNCTION public.fail_buyback_event(
  p_event_id uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_id uuid;
  v_recent_fails integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only service role can fail buybacks';
  END IF;

  UPDATE public.buyback_events
     SET status = 'failed', error = p_error, confirmed_at = now()
   WHERE id = p_event_id AND status IN ('executing','queued')
   RETURNING program_id INTO v_program_id;

  IF v_program_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_recent_fails
    FROM public.buyback_events
    WHERE program_id = v_program_id
      AND status = 'failed'
      AND COALESCE(confirmed_at, scheduled_for) > now() - interval '1 hour';

    IF v_recent_fails >= 3 THEN
      UPDATE public.buyback_programs
         SET enabled = false
       WHERE id = v_program_id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_buyback_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_buyback_event(uuid, text) TO service_role;

-- Public read view (limited columns) for UI
CREATE OR REPLACE VIEW public.buyback_events_public AS
SELECT id, program_id, chain, token_address, status,
       mon_spent, tokens_bought, tx_hash,
       scheduled_for, started_at, confirmed_at, attempts, executed_at
FROM public.buyback_events;

GRANT SELECT ON public.buyback_events_public TO anon, authenticated;
