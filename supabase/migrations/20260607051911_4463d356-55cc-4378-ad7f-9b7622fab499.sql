-- Restrict public access to native_token_balance column on user_profiles.
-- Anonymous users no longer see token balances when reading public profiles.
REVOKE SELECT (native_token_balance) ON public.user_profiles FROM anon;