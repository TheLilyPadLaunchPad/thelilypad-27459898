-- Tighten public read on user_profiles to exclude private profiles
DROP POLICY IF EXISTS "Anyone can view user profiles" ON public.user_profiles;

CREATE POLICY "Public can view non-private profiles"
ON public.user_profiles
FOR SELECT
TO anon, authenticated
USING (is_private = false);

CREATE POLICY "Users can view their own profile"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);