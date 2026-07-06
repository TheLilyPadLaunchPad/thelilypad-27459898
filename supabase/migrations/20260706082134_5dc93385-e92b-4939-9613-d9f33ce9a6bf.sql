CREATE OR REPLACE FUNCTION public.trigger_collection_sellout_buyback()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text;
  v_service_key text;
  v_already_logged uuid;
BEGIN
  IF COALESCE(NEW.chain, 'solana') <> 'solana' THEN RETURN NEW; END IF;
  IF NEW.buyback_enabled IS NOT TRUE THEN RETURN NEW; END IF;
  IF NEW.total_supply IS NULL OR NEW.total_supply <= 0 THEN RETURN NEW; END IF;
  IF NEW.minted < NEW.total_supply THEN RETURN NEW; END IF;
  IF OLD.minted IS NOT NULL AND OLD.minted >= OLD.total_supply THEN RETURN NEW; END IF;

  SELECT id INTO v_already_logged
  FROM public.collection_buyback_contributions
  WHERE collection_id = NEW.id
  LIMIT 1;
  IF v_already_logged IS NOT NULL THEN RETURN NEW; END IF;

  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://kxjlysyjkjiworhnmsuu.supabase.co';
  END IF;

  PERFORM extensions.http_post(
    url     := v_supabase_url || '/functions/v1/collection-sellout-buyback',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
               ),
    body    := jsonb_build_object('collection_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_collection_sellout_buyback failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;