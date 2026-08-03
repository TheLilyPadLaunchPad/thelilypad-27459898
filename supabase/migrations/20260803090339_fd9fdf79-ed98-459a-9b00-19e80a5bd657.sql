CREATE OR REPLACE FUNCTION public.get_dashboard_analytics(target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result json;
BEGIN
  IF auth.uid() IS NULL
     OR (auth.uid() <> target_user_id AND NOT public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT json_build_object(
    'viewerData', COALESCE((
      SELECT json_agg(row_to_json(v)) FROM (
        SELECT to_char(date_trunc('day', sa.recorded_at), 'YYYY-MM-DD') AS date,
               MAX(sa.concurrent_viewers) AS viewers
        FROM public.stream_analytics sa
        WHERE sa.user_id = target_user_id
          AND sa.recorded_at > now() - interval '30 days'
        GROUP BY 1 ORDER BY 1
      ) v
    ), '[]'::json),
    'earningsData', COALESCE((
      SELECT json_agg(row_to_json(e)) FROM (
        SELECT to_char(date_trunc('day', ea.created_at), 'YYYY-MM-DD') AS date,
               SUM(ea.amount) AS amount
        FROM public.earnings ea
        WHERE ea.user_id = target_user_id
          AND ea.created_at > now() - interval '30 days'
        GROUP BY 1 ORDER BY 1
      ) e
    ), '[]'::json),
    'recentStreams', COALESCE((
      SELECT json_agg(row_to_json(s)) FROM (
        SELECT st.id, st.title, st.category,
               COALESCE(st.peak_viewers, 0) AS viewers,
               st.duration_seconds, st.ended_at, st.created_at
        FROM public.streams st
        WHERE st.user_id = target_user_id
        ORDER BY st.created_at DESC
        LIMIT 10
      ) s
    ), '[]'::json),
    'recentDonations', COALESCE((
      SELECT json_agg(row_to_json(d)) FROM (
        SELECT ea.id,
               COALESCE(ea.from_username, 'Anonymous') AS "from",
               ea.amount, ea.message, ea.created_at
        FROM public.earnings ea
        WHERE ea.user_id = target_user_id AND ea.type = 'tip'
        ORDER BY ea.created_at DESC
        LIMIT 10
      ) d
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_analytics(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_analytics(uuid) TO authenticated;