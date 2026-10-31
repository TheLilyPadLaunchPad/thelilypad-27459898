DROP POLICY IF EXISTS "Anyone can look up a referral code" ON public.referral_codes;

CREATE OR REPLACE FUNCTION public.resolve_referral_code(p_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.referral_codes
  WHERE code = p_code AND length(p_code) BETWEEN 1 AND 64
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.resolve_referral_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_referral_code(text) TO authenticated;