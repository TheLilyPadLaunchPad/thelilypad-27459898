CREATE TABLE public.platform_tokens (
  symbol text NOT NULL,
  network text NOT NULL,
  name text NOT NULL,
  mint_address text NOT NULL,
  decimals int NOT NULL DEFAULT 6,
  signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, network)
);

GRANT SELECT ON public.platform_tokens TO anon, authenticated;
GRANT ALL ON public.platform_tokens TO service_role;

ALTER TABLE public.platform_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read platform tokens"
  ON public.platform_tokens FOR SELECT
  USING (true);

CREATE TRIGGER update_platform_tokens_updated_at
  BEFORE UPDATE ON public.platform_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();