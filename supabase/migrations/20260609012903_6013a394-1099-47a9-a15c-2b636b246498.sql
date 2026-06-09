-- Admin audit log table
CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  target_user_id uuid,
  action text NOT NULL,
  source text NOT NULL DEFAULT 'admin_action',
  before jsonb,
  after jsonb,
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON public.admin_audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_admin_audit_logs_created_at ON public.admin_audit_logs (created_at DESC);
CREATE INDEX idx_admin_audit_logs_target ON public.admin_audit_logs (target_user_id);

-- ============ RPCs ============

-- Update profile fields (admin only)
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  target_user_id uuid,
  patch jsonb,
  reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT to_jsonb(p) INTO v_before
  FROM public.user_profiles p WHERE user_id = target_user_id;

  UPDATE public.user_profiles SET
    is_verified  = COALESCE((patch->>'is_verified')::boolean, is_verified),
    is_private   = COALESCE((patch->>'is_private')::boolean, is_private),
    display_name = COALESCE(patch->>'display_name', display_name),
    bio          = COALESCE(patch->>'bio', bio),
    avatar_url   = COALESCE(patch->>'avatar_url', avatar_url),
    banner_url   = COALESCE(patch->>'banner_url', banner_url),
    updated_at   = now()
  WHERE user_id = target_user_id;

  SELECT to_jsonb(p) INTO v_after
  FROM public.user_profiles p WHERE user_id = target_user_id;

  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, source, before, after, reason)
  VALUES (auth.uid(), target_user_id, 'PROFILE_UPDATE', 'admin_action', v_before, v_after, reason);
END;
$$;

-- Set / unset role
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  target_user_id uuid,
  new_role app_role,
  reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_agg(role) INTO v_before
  FROM public.user_roles WHERE user_id = target_user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, new_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, source, before, after, reason)
  VALUES (auth.uid(), target_user_id, 'ROLE_GRANT', 'admin_action', v_before,
          to_jsonb(new_role::text), reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_user_role(
  target_user_id uuid,
  revoke_role app_role,
  reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = target_user_id AND role = revoke_role;

  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, source, before, after, reason)
  VALUES (auth.uid(), target_user_id, 'ROLE_REVOKE', 'admin_action', to_jsonb(revoke_role::text), NULL, reason);
END;
$$;

-- Ban / unban
CREATE OR REPLACE FUNCTION public.admin_ban_user(
  target_user_id uuid,
  reason text,
  expires_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.banned_users (user_id, banned_by, reason, expires_at)
  VALUES (target_user_id, auth.uid(), reason, expires_at);

  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, source, reason, metadata)
  VALUES (auth.uid(), target_user_id, 'BAN', 'admin_action', reason,
          jsonb_build_object('expires_at', expires_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unban_user(
  target_user_id uuid,
  reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.banned_users WHERE user_id = target_user_id;

  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, source, reason)
  VALUES (auth.uid(), target_user_id, 'UNBAN', 'admin_action', reason);
END;
$$;

-- Search users
CREATE OR REPLACE FUNCTION public.admin_search_users(
  query_text text,
  limit_count int DEFAULT 25
)
RETURNS TABLE (
  user_id uuid,
  wallet_address text,
  display_name text,
  avatar_url text,
  is_verified boolean,
  is_creator boolean,
  is_streamer boolean,
  is_banned boolean,
  roles text[],
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.wallet_address,
    p.display_name,
    p.avatar_url,
    COALESCE(p.is_verified, false),
    COALESCE(p.is_creator, false),
    COALESCE(p.is_streamer, false),
    public.is_user_banned(p.user_id),
    COALESCE((SELECT array_agg(r.role::text) FROM public.user_roles r WHERE r.user_id = p.user_id), ARRAY[]::text[]),
    p.created_at
  FROM public.user_profiles p
  WHERE
    query_text IS NULL
    OR query_text = ''
    OR p.wallet_address ILIKE '%' || query_text || '%'
    OR p.display_name ILIKE '%' || query_text || '%'
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(limit_count, 100));
END;
$$;

-- Unified audit feed
CREATE OR REPLACE FUNCTION public.get_admin_audit_feed(limit_count int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  admin_id uuid,
  target_user_id uuid,
  action text,
  source text,
  reason text,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT * FROM (
    SELECT
      l.id, l.admin_id, l.target_user_id, l.action, l.source, l.reason, l.metadata, l.created_at
    FROM public.admin_audit_logs l
    UNION ALL
    SELECT
      m.id, m.action_by AS admin_id, NULL::uuid AS target_user_id,
      m.action_type AS action, 'moderation' AS source, m.notes AS reason,
      jsonb_build_object('queue_id', m.queue_id, 'previous_status', m.previous_status, 'new_status', m.new_status) AS metadata,
      m.created_at
    FROM public.moderation_actions m
    UNION ALL
    SELECT
      a.id, a.reviewed_by AS admin_id, a.user_id AS target_user_id,
      CASE WHEN a.status = 'approved' THEN 'CREATOR_APPROVED' ELSE 'CREATOR_REJECTED' END AS action,
      'creator_approval' AS source,
      a.admin_notes AS reason,
      jsonb_build_object('application_id', a.id, 'display_name', a.display_name) AS metadata,
      a.reviewed_at AS created_at
    FROM public.creator_beta_applications a
    WHERE a.status IN ('approved','rejected') AND a.reviewed_at IS NOT NULL
  ) feed
  ORDER BY feed.created_at DESC
  LIMIT GREATEST(1, LEAST(limit_count, 200));
END;
$$;