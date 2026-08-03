DROP FUNCTION IF EXISTS public.promote_to_creator(uuid, uuid);

CREATE OR REPLACE FUNCTION public.promote_to_creator(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_admin_id UUID := auth.uid();
BEGIN
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT user_id INTO v_user_id FROM public.creator_beta_applications WHERE id = p_application_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  UPDATE public.creator_beta_applications
  SET status = 'approved', reviewed_by = v_admin_id, reviewed_at = now(), updated_at = now()
  WHERE id = p_application_id;

  UPDATE public.user_profiles
  SET is_creator = true, updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (v_user_id, 'creator_approved', '🎉 Creator Status Approved!', 'Congratulations! You are now a verified creator on The Lily Pad. Start creating!', '/launchpad');
END;
$function$;

DROP POLICY IF EXISTS "Authenticated users can upload shop item files" ON storage.objects;

CREATE POLICY "Users can upload their own shop item files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'shop-items'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR ((storage.foldername(name))[1] = 'platform' AND public.has_role(auth.uid(), 'admin'))
  )
);