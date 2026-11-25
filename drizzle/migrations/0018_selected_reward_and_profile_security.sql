ALTER TABLE public.volume_tracking ADD COLUMN verified_at timestamptz;
REVOKE INSERT, UPDATE, DELETE ON public.volume_tracking FROM anon, authenticated;
GRANT ALL ON public.volume_tracking TO service_role;
DROP POLICY IF EXISTS "Authenticated users can insert volume" ON public.volume_tracking;
CREATE OR REPLACE FUNCTION public.stamp_verified_volume() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted activity service required'; END IF;
  NEW.created_at := now();
  NEW.verified_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER stamp_verified_volume BEFORE INSERT ON public.volume_tracking
FOR EACH ROW EXECUTE FUNCTION public.stamp_verified_volume();
COMMENT ON COLUMN public.volume_tracking.verified_at IS 'Trusted server activity only; legacy rows are retained without certifying their provenance.';

ALTER TABLE public.streak_challenges ADD COLUMN accepted_at timestamptz;
CREATE OR REPLACE FUNCTION public.protect_streak_challenge() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.challenger_id IS DISTINCT FROM auth.uid() OR NEW.challenged_id = auth.uid()
       OR NEW.status <> 'pending' OR NEW.duration_days NOT IN (7,14,30)
       OR NEW.winner_id IS NOT NULL OR NEW.challenger_streak <> 0 OR NEW.challenged_streak <> 0
       OR NEW.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid pending challenge'; END IF;
    NEW.start_date := CURRENT_DATE;
    NEW.end_date := CURRENT_DATE + NEW.duration_days;
    NEW.created_at := now();
  ELSE
    IF OLD.status <> 'pending' OR OLD.challenged_id IS DISTINCT FROM auth.uid()
       OR NEW.status NOT IN ('active','declined') THEN RAISE EXCEPTION 'Only the invited user may respond to a pending challenge'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.challenger_id IS DISTINCT FROM OLD.challenger_id
       OR NEW.challenged_id IS DISTINCT FROM OLD.challenged_id OR NEW.duration_days IS DISTINCT FROM OLD.duration_days
       OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.winner_id IS DISTINCT FROM OLD.winner_id
       OR NEW.challenger_streak IS DISTINCT FROM OLD.challenger_streak OR NEW.challenged_streak IS DISTINCT FROM OLD.challenged_streak
       OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN RAISE EXCEPTION 'Challenge details cannot be changed'; END IF;
    NEW.start_date := CURRENT_DATE;
    NEW.end_date := CURRENT_DATE + OLD.duration_days;
    NEW.accepted_at := CASE WHEN NEW.status = 'active' THEN now() ELSE NULL END;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_streak_challenge BEFORE INSERT OR UPDATE ON public.streak_challenges
FOR EACH ROW EXECUTE FUNCTION public.protect_streak_challenge();

ALTER TABLE public.lily_raffle_entries ADD COLUMN verified_at timestamptz;
REVOKE INSERT ON public.lily_raffle_entries FROM anon, authenticated;
GRANT ALL ON public.lily_raffle_entries TO service_role;
DROP POLICY IF EXISTS "Users can enter raffles" ON public.lily_raffle_entries;
CREATE UNIQUE INDEX raffle_verified_payment_unique ON public.lily_raffle_entries(tx_hash)
WHERE verified_at IS NOT NULL AND tx_hash IS NOT NULL;
CREATE OR REPLACE FUNCTION public.protect_raffle_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.lily_raffles%ROWTYPE; used bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Verified entry service required'; END IF;
  SELECT * INTO r FROM public.lily_raffles WHERE id=NEW.raffle_id FOR UPDATE;
  IF NOT FOUND OR NOT r.is_active OR r.is_drawn OR now() < r.start_date OR now() >= r.end_date THEN RAISE EXCEPTION 'Raffle is not open'; END IF;
  SELECT COALESCE(SUM(ticket_count),0) INTO used FROM public.lily_raffle_entries WHERE raffle_id=NEW.raffle_id AND user_id=NEW.user_id;
  IF NEW.ticket_count <= 0 OR NEW.ticket_count + used > COALESCE(r.max_tickets_per_user,100) THEN RAISE EXCEPTION 'Ticket limit exceeded'; END IF;
  IF NEW.total_paid IS DISTINCT FROM r.entry_price * NEW.ticket_count THEN RAISE EXCEPTION 'Incorrect ticket payment'; END IF;
  IF r.entry_price > 0 AND (NEW.tx_hash IS NULL OR NEW.tx_hash = '' OR EXISTS(SELECT 1 FROM public.lily_raffle_entries WHERE tx_hash=NEW.tx_hash)) THEN RAISE EXCEPTION 'Payment required or already used'; END IF;
  NEW.verified_at := now(); NEW.created_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_raffle_entry BEFORE INSERT ON public.lily_raffle_entries
FOR EACH ROW EXECUTE FUNCTION public.protect_raffle_entry();

CREATE OR REPLACE FUNCTION public.protect_streamer_verification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.is_verified := false;
  ELSE NEW.is_verified := OLD.is_verified; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_streamer_verification BEFORE INSERT OR UPDATE ON public.streamer_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_streamer_verification();

DO $migration$
DECLARE f record; definition text;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('get_profile_activity_feed','get_top_supporters') LOOP
    definition := pg_get_functiondef(f.oid);
    IF position('IF NOT EXISTS' IN definition) = 0 THEN
      definition := replace(definition, E'BEGIN\n', E'BEGIN\n  IF NOT EXISTS (SELECT 1 FROM public.user_profiles visibility_profile\n    WHERE visibility_profile.user_id = target_user_id\n      AND (visibility_profile.is_private = false OR auth.uid() = target_user_id OR public.has_role(auth.uid(), ''admin''))) THEN\n    RETURN;\n  END IF;\n');
      EXECUTE definition;
    END IF;
  END LOOP;
END;
$migration$;