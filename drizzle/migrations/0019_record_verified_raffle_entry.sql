CREATE OR REPLACE FUNCTION public.record_verified_raffle_entry(p_raffle_id uuid, p_user_id uuid, p_ticket_count integer, p_tx_hash text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE entry_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Verified entry service required'; END IF;
  INSERT INTO public.lily_raffle_entries(raffle_id,user_id,ticket_count,total_paid,tx_hash)
  SELECT r.id,p_user_id,p_ticket_count,r.entry_price*p_ticket_count,NULLIF(p_tx_hash,'') FROM public.lily_raffles r WHERE r.id=p_raffle_id
  RETURNING id INTO entry_id;
  IF entry_id IS NULL THEN RAISE EXCEPTION 'Raffle unavailable'; END IF;
  RETURN entry_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_verified_raffle_entry(uuid,uuid,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_raffle_entry(uuid,uuid,integer,text) TO service_role;