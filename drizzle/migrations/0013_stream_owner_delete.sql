CREATE POLICY "Users can delete their own streams" ON public.streams
  FOR DELETE
  USING (auth.uid() = user_id);