DROP POLICY IF EXISTS "Users can insert earnings for themselves" ON public.earnings;
REVOKE INSERT ON public.earnings FROM anon, authenticated;