ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS verification_attestation text,
  ADD COLUMN IF NOT EXISTS verification_attestation_network text;

COMMENT ON COLUMN public.user_profiles.verification_attestation IS 'Solana Attestation Service attestation pubkey (base58) issued when this creator was verified.';
COMMENT ON COLUMN public.user_profiles.verification_attestation_network IS 'Network the attestation was issued on: devnet | mainnet-beta.';