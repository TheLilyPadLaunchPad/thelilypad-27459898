ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS manifest_root           TEXT,
  ADD COLUMN IF NOT EXISTS candy_machine_address   TEXT,
  ADD COLUMN IF NOT EXISTS candy_guard_address     TEXT,
  ADD COLUMN IF NOT EXISTS collection_mint_address TEXT;

COMMENT ON COLUMN public.collections.manifest_root           IS '43-char Arweave TX id for the bundled per-item metadata manifest. Used by reveal step to compute https://arweave.net/<root>/N.json.';
COMMENT ON COLUMN public.collections.candy_machine_address   IS 'On-chain Metaplex Core Candy Machine address (separate from collection mint).';
COMMENT ON COLUMN public.collections.candy_guard_address     IS 'On-chain Candy Guard wrapper address.';
COMMENT ON COLUMN public.collections.collection_mint_address IS 'On-chain Metaplex Core Collection address (asset group key for DAS).';