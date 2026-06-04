
-- app_settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  id TEXT PRIMARY KEY,
  is_mock_mode_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES ('global') ON CONFLICT DO NOTHING;

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view app settings"
  ON public.app_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins manage app settings"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- mint_sessions
CREATE TABLE IF NOT EXISTS public.mint_sessions (
  id UUID PRIMARY KEY,
  creator_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  items_requested INTEGER,
  items_minted INTEGER DEFAULT 0,
  collection_address TEXT,
  tree_address TEXT,
  asset_ids JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.mint_sessions TO authenticated;
GRANT ALL ON public.mint_sessions TO service_role;

ALTER TABLE public.mint_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read mint sessions"
  ON public.mint_sessions FOR SELECT USING (true);

CREATE POLICY "Authenticated insert mint sessions"
  ON public.mint_sessions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update mint sessions"
  ON public.mint_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- mint_transactions
CREATE TABLE IF NOT EXISTS public.mint_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.mint_sessions(id) ON DELETE CASCADE,
  tx_signature TEXT,
  tx_type TEXT,
  batch_start INTEGER,
  batch_end INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.mint_transactions TO authenticated;
GRANT ALL ON public.mint_transactions TO service_role;

ALTER TABLE public.mint_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read mint transactions"
  ON public.mint_transactions FOR SELECT USING (true);

CREATE POLICY "Authenticated insert mint transactions"
  ON public.mint_transactions FOR INSERT TO authenticated WITH CHECK (true);

-- shop_item_contents.metadata_uri
ALTER TABLE public.shop_item_contents
  ADD COLUMN IF NOT EXISTS metadata_uri TEXT;

-- stream_chat_messages.wallet_address
ALTER TABLE public.stream_chat_messages
  ADD COLUMN IF NOT EXISTS wallet_address TEXT;
