
-- 1. Add auth_user_id column linking user_profiles to auth.users
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_user_id
  ON public.user_profiles(auth_user_id);

-- 2. Helper to resolve current profile id from auth.uid()
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.user_profiles
  WHERE auth_user_id = auth.uid()
  LIMIT 1
$$;

-- 3. Trigger on auth.users for new Web3 sign-ins:
-- when a user signs in with chain=solana, link/create the matching user_profiles row.
CREATE OR REPLACE FUNCTION public.handle_new_web3_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet text;
  v_chain text;
  v_existing_profile_id uuid;
BEGIN
  -- Supabase Web3 auth stores the wallet address in user_metadata.address
  -- and chain in user_metadata.chain (or app_metadata depending on version)
  v_wallet := COALESCE(
    NEW.raw_user_meta_data->>'address',
    NEW.raw_user_meta_data->>'wallet_address',
    NEW.raw_app_meta_data->>'address'
  );
  v_chain := COALESCE(
    NEW.raw_user_meta_data->>'chain',
    NEW.raw_app_meta_data->>'chain',
    NEW.raw_app_meta_data->>'provider'
  );

  -- Only act if this looks like a wallet-based sign-in
  IF v_wallet IS NULL THEN
    RETURN NEW;
  END IF;

  -- Try to find an existing profile by wallet_address
  SELECT id INTO v_existing_profile_id
  FROM public.user_profiles
  WHERE wallet_address = v_wallet
  LIMIT 1;

  IF v_existing_profile_id IS NOT NULL THEN
    -- Link existing profile to this auth user
    UPDATE public.user_profiles
    SET auth_user_id = NEW.id,
        updated_at = now()
    WHERE id = v_existing_profile_id
      AND (auth_user_id IS NULL OR auth_user_id = NEW.id);
  ELSE
    -- Create a new shell profile; user will complete via /profile-setup
    INSERT INTO public.user_profiles (user_id, auth_user_id, wallet_address, profile_setup_completed)
    VALUES (NEW.id, NEW.id, v_wallet, false)
    ON CONFLICT (wallet_address) DO UPDATE
      SET auth_user_id = EXCLUDED.auth_user_id,
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_web3 ON auth.users;
CREATE TRIGGER on_auth_user_created_web3
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_web3_user();

-- Also handle updates (in case the trigger above missed on first insert race)
DROP TRIGGER IF EXISTS on_auth_user_updated_web3 ON auth.users;
CREATE TRIGGER on_auth_user_updated_web3
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data)
  EXECUTE FUNCTION public.handle_new_web3_user();
