
CREATE OR REPLACE FUNCTION public.apply_auction_bid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auc public.onchain_nft_auctions%ROWTYPE;
  min_next NUMERIC;
BEGIN
  SELECT * INTO auc FROM public.onchain_nft_auctions WHERE id = NEW.auction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auction not found';
  END IF;
  IF auc.status <> 'active' THEN
    RAISE EXCEPTION 'Auction is not active';
  END IF;
  IF auc.ends_at <= now() THEN
    RAISE EXCEPTION 'Auction has ended';
  END IF;
  IF auc.seller_id = NEW.bidder_id THEN
    RAISE EXCEPTION 'Seller cannot bid on own auction';
  END IF;
  min_next := COALESCE(auc.highest_bid + auc.min_bid_increment, auc.reserve_price);
  IF NEW.amount < min_next THEN
    RAISE EXCEPTION 'Bid % is below minimum %', NEW.amount, min_next;
  END IF;

  UPDATE public.onchain_nft_auctions
  SET highest_bid = NEW.amount,
      highest_bidder_id = NEW.bidder_id,
      highest_bidder_address = NEW.bidder_address,
      updated_at = now()
  WHERE id = NEW.auction_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_auction_bid ON public.onchain_nft_auction_bids;
CREATE TRIGGER trg_apply_auction_bid
BEFORE INSERT ON public.onchain_nft_auction_bids
FOR EACH ROW EXECUTE FUNCTION public.apply_auction_bid();
