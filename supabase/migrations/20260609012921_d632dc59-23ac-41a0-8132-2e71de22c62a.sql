REVOKE EXECUTE ON FUNCTION public.admin_update_profile(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, app_role, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_user_role(uuid, app_role, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_ban_user(uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_unban_user(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_search_users(text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_audit_feed(int) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_role(uuid, app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_audit_feed(int) TO authenticated;