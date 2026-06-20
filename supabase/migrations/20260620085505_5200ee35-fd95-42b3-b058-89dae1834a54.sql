CREATE OR REPLACE FUNCTION public.admin_hard_delete_collection(p_collection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nft_ids uuid[];
  v_program_ids uuid[];
  v_auction_ids uuid[];
  v_blindbox_ids uuid[];
  v_raffle_ids uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_collection_id IS NULL THEN
    RAISE EXCEPTION 'collection id required';
  END IF;

  SELECT array_agg(id) INTO v_nft_ids FROM public.minted_nfts WHERE collection_id = p_collection_id;
  SELECT array_agg(program_id) INTO v_program_ids FROM public.buyback_program_collections WHERE collection_id = p_collection_id;
  SELECT array_agg(id) INTO v_auction_ids FROM public.onchain_nft_auctions WHERE collection_address IN (
    SELECT candy_machine_address FROM public.collections WHERE id = p_collection_id AND candy_machine_address IS NOT NULL
    UNION SELECT collection_mint_address FROM public.collections WHERE id = p_collection_id AND collection_mint_address IS NOT NULL
  );
  SELECT array_agg(id) INTO v_blindbox_ids FROM public.lily_blind_boxes WHERE collection_id = p_collection_id;
  SELECT array_agg(id) INTO v_raffle_ids  FROM public.lily_raffles      WHERE collection_id = p_collection_id;

  IF v_auction_ids IS NOT NULL THEN
    DELETE FROM public.onchain_nft_auction_bids WHERE auction_id = ANY(v_auction_ids);
    DELETE FROM public.onchain_nft_auctions WHERE id = ANY(v_auction_ids);
  END IF;

  DELETE FROM public.onchain_nft_listings
   WHERE collection_address IN (
     SELECT candy_machine_address FROM public.collections WHERE id = p_collection_id AND candy_machine_address IS NOT NULL
     UNION SELECT collection_mint_address FROM public.collections WHERE id = p_collection_id AND collection_mint_address IS NOT NULL
   );

  IF v_nft_ids IS NOT NULL THEN
    DELETE FROM public.nft_offers   WHERE nft_id = ANY(v_nft_ids);
    DELETE FROM public.nft_listings WHERE nft_id = ANY(v_nft_ids);
  END IF;

  DELETE FROM public.nft_transactions WHERE collection_id = p_collection_id;
  DELETE FROM public.nft_mints        WHERE collection_id = p_collection_id;
  DELETE FROM public.minted_nfts      WHERE collection_id = p_collection_id;
  DELETE FROM public.mint_sessions    WHERE collection_id = p_collection_id;
  DELETE FROM public.mint_transactions WHERE collection_id = p_collection_id;
  DELETE FROM public.allowlist_entries WHERE collection_id = p_collection_id;
  DELETE FROM public.collection_audio_metadata WHERE collection_id = p_collection_id;
  DELETE FROM public.collection_buyback_contributions WHERE collection_id = p_collection_id;
  DELETE FROM public.buyback_program_collections WHERE collection_id = p_collection_id;

  IF v_program_ids IS NOT NULL THEN
    DELETE FROM public.buyback_events  WHERE program_id = ANY(v_program_ids);
    DELETE FROM public.buyback_programs WHERE id = ANY(v_program_ids);
  END IF;

  DELETE FROM public.deploy_refunds       WHERE collection_id = p_collection_id;
  DELETE FROM public.featured_collections WHERE collection_id = p_collection_id;
  DELETE FROM public.meta_transactions    WHERE collection_id = p_collection_id;
  DELETE FROM public.platform_fees        WHERE collection_id = p_collection_id;
  DELETE FROM public.playlist_tracks      WHERE collection_id = p_collection_id;
  DELETE FROM public.volume_tracking      WHERE collection_id = p_collection_id;
  DELETE FROM public.card_stack_items     WHERE collection_id = p_collection_id;
  DELETE FROM public.shop_items           WHERE collection_id = p_collection_id;

  IF v_blindbox_ids IS NOT NULL THEN
    DELETE FROM public.lily_blind_box_purchases WHERE blind_box_id = ANY(v_blindbox_ids);
    DELETE FROM public.lily_blind_boxes WHERE id = ANY(v_blindbox_ids);
  END IF;
  IF v_raffle_ids IS NOT NULL THEN
    DELETE FROM public.lily_raffle_entries WHERE raffle_id = ANY(v_raffle_ids);
    DELETE FROM public.lily_raffles WHERE id = ANY(v_raffle_ids);
  END IF;

  DELETE FROM public.collections WHERE id = p_collection_id;

  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, source, metadata)
  VALUES (auth.uid(), NULL, 'COLLECTION_HARD_DELETE', 'admin_action',
          jsonb_build_object('collection_id', p_collection_id));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_hard_delete_collection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_collection(uuid) TO authenticated;