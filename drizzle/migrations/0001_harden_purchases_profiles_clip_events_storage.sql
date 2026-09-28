-- Purchases are recorded only by the record-shop-purchase function after payment verification
DROP POLICY IF EXISTS "Authenticated users can insert their own purchases" ON public.shop_purchases;
DROP POLICY IF EXISTS "System can insert purchases." ON public.shop_purchases;
DROP POLICY IF EXISTS "Users can insert their own bundle purchases" ON public.shop_bundle_purchases;

-- Clip events are recorded by the track-clip-event function (service role)
DROP POLICY IF EXISTS "Anyone can insert clip events" ON public.clip_events;

-- Shop files: no public reads, uploads only via owner-bound policy / signed URLs
DROP POLICY IF EXISTS "Anyone can view shop item files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload shop item files" ON storage.objects;

-- Users cannot grant themselves the verified badge
CREATE OR REPLACE FUNCTION public.protect_profile_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_verified := false;
  ELSIF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    NEW.is_verified := OLD.is_verified;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_verified_trg ON public.user_profiles;
CREATE TRIGGER protect_profile_verified_trg
BEFORE INSERT OR UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_verified();