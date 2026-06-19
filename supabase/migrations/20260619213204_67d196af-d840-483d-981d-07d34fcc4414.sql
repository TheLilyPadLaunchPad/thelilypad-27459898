-- Seller opt-in secondary-sale buyback for on-chain listings

ALTER TABLE public.onchain_nft_listings
  ADD COLUMN IF NOT EXISTS buyback_pct numeric NOT NULL DEFAULT 0
    CHECK (buyback_pct >= 0 AND buyback_pct <= 100);

-- Add columns to contributions ledger so we can record secondary-sale rows
ALTER TABLE public.collection_buyback_contributions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'mint_sellout',
  ADD COLUMN IF NOT EXISTS listing_id uuid REFERENCES public.onchain_nft_listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS collection_buyback_contributions_listing_id_idx
  ON public.collection_buyback_contributions(listing_id);

CREATE OR REPLACE FUNCTION public.trigger_onchain_listing_sold_buyback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection_id uuid;
  v_program_id uuid;
  v_max_notional numeric;
  v_contribution numeric;
  v_event_id uuid;
  v_supabase_url text;
  v_already uuid;
BEGIN
  -- Only fire on transition into 'sold' for Solana listings with opt-in cut
  IF NEW.status <> 'sold' OR COALESCE(OLD.status, '') = 'sold' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.chain, 'solana') <> 'solana' THEN
    RETURN NEW;
  END IF;
  IF NEW.buyback_pct IS NULL OR NEW.buyback_pct <= 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.price IS NULL OR NEW.price <= 0 THEN
    RETURN NEW;
  END IF;

  -- Resolve collection by address (best-effort link)
  IF NEW.collection_address IS NOT NULL THEN
    SELECT id INTO v_collection_id
    FROM public.collections
    WHERE candy_machine_address = NEW.collection_address
       OR collection_mint_address = NEW.collection_address
    LIMIT 1;
  END IF;

  -- Idempotency: one contribution per listing
  SELECT id INTO v_already
  FROM public.collection_buyback_contributions
  WHERE listing_id = NEW.id
  LIMIT 1;
  IF v_already IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_contribution := round((NEW.price * NEW.buyback_pct / 100)::numeric, 6);

  -- Find active Solana buyback program
  SELECT id, max_notional_per_run
    INTO v_program_id, v_max_notional
  FROM public.buyback_programs
  WHERE chain = 'solana' AND enabled = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_program_id IS NULL THEN
    INSERT INTO public.collection_buyback_contributions
      (collection_id, listing_id, chain, mint_revenue_sol, contribution_pct,
       contribution_sol, status, source, error)
    VALUES
      (v_collection_id, NEW.id, 'solana', NEW.price, NEW.buyback_pct,
       v_contribution, 'pending', 'secondary_sale',
       'no active solana buyback program configured');
    RETURN NEW;
  END IF;

  -- Cap to program max
  IF v_contribution > v_max_notional THEN
    v_contribution := v_max_notional;
  END IF;

  BEGIN
    SELECT public.queue_buyback(
      v_program_id,
      v_contribution,
      'listing:' || NEW.id::text || ':sold',
      now()
    ) INTO v_event_id;

    INSERT INTO public.collection_buyback_contributions
      (collection_id, program_id, event_id, listing_id, chain,
       mint_revenue_sol, contribution_pct, contribution_sol, status, source)
    VALUES
      (v_collection_id, v_program_id, v_event_id, NEW.id, 'solana',
       NEW.price, NEW.buyback_pct, v_contribution, 'queued', 'secondary_sale');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.collection_buyback_contributions
      (collection_id, listing_id, chain, mint_revenue_sol, contribution_pct,
       contribution_sol, status, source, error)
    VALUES
      (v_collection_id, NEW.id, 'solana', NEW.price, NEW.buyback_pct,
       v_contribution, 'failed', 'secondary_sale', SQLERRM);
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_onchain_listing_sold_buyback failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS onchain_listing_sold_buyback_trg ON public.onchain_nft_listings;
CREATE TRIGGER onchain_listing_sold_buyback_trg
AFTER UPDATE OF status ON public.onchain_nft_listings
FOR EACH ROW
WHEN (NEW.status = 'sold' AND OLD.status IS DISTINCT FROM 'sold')
EXECUTE FUNCTION public.trigger_onchain_listing_sold_buyback();