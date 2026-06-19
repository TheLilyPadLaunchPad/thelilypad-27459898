-- Auto-trigger collection-sellout-buyback edge function when a Solana collection mints out
-- Requires pg_net extension (already used by buyback-scheduler infra)

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_collection_sellout_buyback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url text;
  v_service_key text;
  v_already_logged uuid;
BEGIN
  -- Only fire on Solana collections that have buyback enabled
  IF COALESCE(NEW.chain, 'solana') <> 'solana' THEN
    RETURN NEW;
  END IF;
  IF NEW.buyback_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.total_supply IS NULL OR NEW.total_supply <= 0 THEN
    RETURN NEW;
  END IF;

  -- Fire only on the transition into sold-out
  IF NEW.minted < NEW.total_supply THEN
    RETURN NEW;
  END IF;
  IF OLD.minted IS NOT NULL AND OLD.minted >= OLD.total_supply THEN
    RETURN NEW;
  END IF;

  -- Skip if already logged (defence-in-depth; edge function is also idempotent)
  SELECT id INTO v_already_logged
  FROM public.collection_buyback_contributions
  WHERE collection_id = NEW.id
  LIMIT 1;
  IF v_already_logged IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Fallback to hardcoded project URL (config-less). Auth header omitted because
  -- the function is deployed with verify_jwt = false (Lovable default).
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://kxjlysyjkjiworhnmsuu.supabase.co';
  END IF;

  PERFORM extensions.http_post(
    url     := v_supabase_url || '/functions/v1/collection-sellout-buyback',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('collection_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the originating UPDATE; log and continue
  RAISE WARNING 'trigger_collection_sellout_buyback failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collection_sellout_buyback_trg ON public.collections;
CREATE TRIGGER collection_sellout_buyback_trg
AFTER UPDATE OF minted, total_supply, buyback_enabled ON public.collections
FOR EACH ROW
WHEN (NEW.minted IS NOT NULL AND NEW.total_supply IS NOT NULL AND NEW.minted >= NEW.total_supply)
EXECUTE FUNCTION public.trigger_collection_sellout_buyback();