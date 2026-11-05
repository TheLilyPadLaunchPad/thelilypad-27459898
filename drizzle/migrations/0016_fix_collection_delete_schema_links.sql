CREATE OR REPLACE FUNCTION public.admin_hard_delete_collection(p_collection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_nft_ids uuid[];
  v_auction_ids uuid[];
  v_session_ids uuid[];
  v_addresses text[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_collection_id IS NULL THEN
    RAISE EXCEPTION 'collection id required';
  END IF;

  PERFORM id FROM public.collections WHERE id = p_collection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collection not found';
  END IF;

  SELECT array_remove(ARRAY[candy_machine_address, collection_mint_address, contract_address], NULL)
    INTO v_addresses FROM public.collections WHERE id = p_collection_id;
  SELECT array_agg(id) INTO v_nft_ids FROM public.minted_nfts WHERE collection_id = p_collection_id;
  SELECT array_agg(id) INTO v_auction_ids FROM public.onchain_nft_auctions WHERE collection_address = ANY(v_addresses);
  SELECT array_agg(id) INTO v_session_ids FROM public.mint_sessions WHERE collection_address = ANY(v_addresses);

  DELETE FROM public.onchain_nft_auction_bids WHERE auction_id = ANY(v_auction_ids);
  DELETE FROM public.onchain_nft_auctions WHERE id = ANY(v_auction_ids);
  DELETE FROM public.onchain_nft_listings WHERE collection_address = ANY(v_addresses);
  DELETE FROM public.nft_offers WHERE nft_id = ANY(v_nft_ids);
  DELETE FROM public.nft_listings WHERE nft_id = ANY(v_nft_ids);
  DELETE FROM public.nft_transactions WHERE collection_id = p_collection_id;
  DELETE FROM public.nft_mints WHERE collection_id = p_collection_id;
  DELETE FROM public.minted_nfts WHERE collection_id = p_collection_id;

  -- Mint transactions belong to sessions; sessions identify their collection by address.
  DELETE FROM public.mint_transactions WHERE session_id = ANY(v_session_ids);
  DELETE FROM public.mint_sessions WHERE id = ANY(v_session_ids);
  DELETE FROM public.allowlist_entries WHERE collection_id = p_collection_id;
  DELETE FROM public.collection_audio_metadata WHERE collection_id = p_collection_id;
  DELETE FROM public.collection_buyback_contributions WHERE collection_id = p_collection_id;
  DELETE FROM public.buyback_program_collections WHERE collection_id = p_collection_id;
  DELETE FROM public.deploy_refunds WHERE collection_id = p_collection_id;
  DELETE FROM public.featured_collections WHERE collection_id = p_collection_id;
  DELETE FROM public.meta_transactions WHERE collection_id = p_collection_id;
  DELETE FROM public.platform_fees WHERE collection_id = p_collection_id;
  DELETE FROM public.playlist_tracks WHERE collection_id = p_collection_id;
  DELETE FROM public.volume_tracking WHERE collection_id = p_collection_id;

  -- Shared shop items, raffles, governance, and buybacks are not collection-owned.
  UPDATE public.shop_items SET collection_id = NULL WHERE collection_id = p_collection_id;
  UPDATE public.shop_items SET required_collection_id = NULL WHERE required_collection_id = p_collection_id;
  UPDATE public.lily_raffles SET required_collection_id = NULL WHERE required_collection_id = p_collection_id;
  UPDATE public.governance_config SET governance_collection_id = NULL, is_active = false WHERE governance_collection_id = p_collection_id;
  -- Blind boxes and homepage cards have no collection_id; do not delete them.

  DELETE FROM public.collections WHERE id = p_collection_id;
  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, source, metadata)
  VALUES (auth.uid(), NULL, 'COLLECTION_HARD_DELETE', 'admin_action', jsonb_build_object('collection_id', p_collection_id));
END;
$function$;