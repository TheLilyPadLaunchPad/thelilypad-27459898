DROP POLICY IF EXISTS "Anyone can view governance config" ON public.governance_config;
CREATE POLICY "Admins can view governance config" ON public.governance_config
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view all cards" ON public.card_stack_items;
CREATE POLICY "Admins can view all cards" ON public.card_stack_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Anyone can view shop item files" ON storage.objects;