CREATE OR REPLACE FUNCTION public.admin_export_whitelist_wallets(p_after uuid DEFAULT NULL, p_limit integer DEFAULT 500)
RETURNS TABLE(profile_id uuid, wallet_address text, claim_status text, registered_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.wallet_address,
    CASE WHEN p.profile_setup_completed IS TRUE THEN 'registered'::text ELSE 'pending_profile'::text END,
    p.created_at
  FROM public.user_profiles p
  WHERE p.user_id IS NOT NULL AND NULLIF(btrim(p.wallet_address), '') IS NOT NULL
    AND (p_after IS NULL OR p.id > p_after)
  ORDER BY p.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_export_whitelist_wallets(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_export_whitelist_wallets(uuid, integer) TO authenticated;
COMMENT ON FUNCTION public.admin_export_whitelist_wallets(uuid, integer) IS 'Admin-only saved wallet registration export; registered means completed profile, not a historical claim or analytics receipt.';