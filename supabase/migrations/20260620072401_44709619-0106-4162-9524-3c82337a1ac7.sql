DROP POLICY IF EXISTS "Anyone can view volume tracking" ON public.volume_tracking;
CREATE POLICY "Authenticated users can view volume tracking"
  ON public.volume_tracking
  FOR SELECT
  TO authenticated
  USING (true);