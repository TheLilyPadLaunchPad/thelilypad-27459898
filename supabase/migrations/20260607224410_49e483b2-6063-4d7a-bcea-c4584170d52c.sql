
-- =========================================================
-- On-chain NFT Listings
-- =========================================================
CREATE TABLE public.onchain_nft_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  seller_address TEXT NOT NULL,
  asset_address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'solana',
  name TEXT,
  image_url TEXT,
  collection_name TEXT,
  collection_address TEXT,
  price NUMERIC NOT NULL CHECK (price > 0),
  currency TEXT NOT NULL DEFAULT 'SOL',
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  buyer_id UUID,
  buyer_address TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onchain_nft_listings TO authenticated;
GRANT SELECT ON public.onchain_nft_listings TO anon;
GRANT ALL ON public.onchain_nft_listings TO service_role;

ALTER TABLE public.onchain_nft_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active onchain listings"
  ON public.onchain_nft_listings FOR SELECT
  USING (status = 'active' OR auth.uid() = seller_id);

CREATE POLICY "Sellers can create onchain listings"
  ON public.onchain_nft_listings FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update their onchain listings"
  ON public.onchain_nft_listings FOR UPDATE
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete their onchain listings"
  ON public.onchain_nft_listings FOR DELETE
  USING (auth.uid() = seller_id);

CREATE POLICY "Admins manage onchain listings"
  ON public.onchain_nft_listings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_onchain_listings_asset ON public.onchain_nft_listings(asset_address);
CREATE INDEX idx_onchain_listings_collection ON public.onchain_nft_listings(collection_address);
CREATE INDEX idx_onchain_listings_seller ON public.onchain_nft_listings(seller_id);
CREATE INDEX idx_onchain_listings_status ON public.onchain_nft_listings(status);

CREATE UNIQUE INDEX idx_onchain_listings_one_active_per_asset
  ON public.onchain_nft_listings(asset_address)
  WHERE status = 'active';

CREATE TRIGGER trg_onchain_listings_updated
  BEFORE UPDATE ON public.onchain_nft_listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- On-chain NFT Auctions (English)
-- =========================================================
CREATE TABLE public.onchain_nft_auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  seller_address TEXT NOT NULL,
  asset_address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'solana',
  name TEXT,
  image_url TEXT,
  collection_name TEXT,
  collection_address TEXT,
  reserve_price NUMERIC NOT NULL CHECK (reserve_price >= 0),
  min_bid_increment NUMERIC NOT NULL DEFAULT 0.01 CHECK (min_bid_increment > 0),
  currency TEXT NOT NULL DEFAULT 'SOL',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  highest_bid NUMERIC,
  highest_bidder_id UUID,
  highest_bidder_address TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  settled_at TIMESTAMPTZ,
  winner_id UUID,
  winner_address TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onchain_nft_auctions TO authenticated;
GRANT SELECT ON public.onchain_nft_auctions TO anon;
GRANT ALL ON public.onchain_nft_auctions TO service_role;

ALTER TABLE public.onchain_nft_auctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view auctions"
  ON public.onchain_nft_auctions FOR SELECT
  USING (true);

CREATE POLICY "Sellers can create auctions"
  ON public.onchain_nft_auctions FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update their auctions"
  ON public.onchain_nft_auctions FOR UPDATE
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete their unbid auctions"
  ON public.onchain_nft_auctions FOR DELETE
  USING (auth.uid() = seller_id AND highest_bid IS NULL);

CREATE POLICY "Admins manage auctions"
  ON public.onchain_nft_auctions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_onchain_auctions_asset ON public.onchain_nft_auctions(asset_address);
CREATE INDEX idx_onchain_auctions_collection ON public.onchain_nft_auctions(collection_address);
CREATE INDEX idx_onchain_auctions_seller ON public.onchain_nft_auctions(seller_id);
CREATE INDEX idx_onchain_auctions_status ON public.onchain_nft_auctions(status);
CREATE INDEX idx_onchain_auctions_ends_at ON public.onchain_nft_auctions(ends_at);

CREATE UNIQUE INDEX idx_onchain_auctions_one_active_per_asset
  ON public.onchain_nft_auctions(asset_address)
  WHERE status = 'active';

CREATE TRIGGER trg_onchain_auctions_updated
  BEFORE UPDATE ON public.onchain_nft_auctions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Auction bids
-- =========================================================
CREATE TABLE public.onchain_nft_auction_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES public.onchain_nft_auctions(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL,
  bidder_address TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.onchain_nft_auction_bids TO authenticated;
GRANT SELECT ON public.onchain_nft_auction_bids TO anon;
GRANT ALL ON public.onchain_nft_auction_bids TO service_role;

ALTER TABLE public.onchain_nft_auction_bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view bids"
  ON public.onchain_nft_auction_bids FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can place bids"
  ON public.onchain_nft_auction_bids FOR INSERT
  WITH CHECK (auth.uid() = bidder_id);

CREATE INDEX idx_auction_bids_auction ON public.onchain_nft_auction_bids(auction_id);
CREATE INDEX idx_auction_bids_bidder ON public.onchain_nft_auction_bids(bidder_id);

-- =========================================================
-- Trigger: keep auction.highest_bid in sync when a new bid arrives
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_auction_high_bid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auction public.onchain_nft_auctions;
  v_min_next NUMERIC;
BEGIN
  SELECT * INTO v_auction FROM public.onchain_nft_auctions WHERE id = NEW.auction_id FOR UPDATE;

  IF v_auction.status <> 'active' THEN
    RAISE EXCEPTION 'Auction is not active';
  END IF;
  IF now() > v_auction.ends_at THEN
    RAISE EXCEPTION 'Auction has ended';
  END IF;
  IF NEW.bidder_id = v_auction.seller_id THEN
    RAISE EXCEPTION 'Seller cannot bid on their own auction';
  END IF;

  v_min_next := COALESCE(v_auction.highest_bid + v_auction.min_bid_increment, v_auction.reserve_price);
  IF NEW.amount < v_min_next THEN
    RAISE EXCEPTION 'Bid % is below minimum next bid %', NEW.amount, v_min_next;
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

CREATE TRIGGER trg_auction_bid_update
  BEFORE INSERT ON public.onchain_nft_auction_bids
  FOR EACH ROW EXECUTE FUNCTION public.update_auction_high_bid();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.onchain_nft_listings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.onchain_nft_auctions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.onchain_nft_auction_bids;
