-- Baseline profile queries for isolated migration regression tests. No application records.

CREATE OR REPLACE FUNCTION public.get_profile_activity_feed(target_user_id uuid, filter text DEFAULT 'all'::text, limit_count integer DEFAULT 30, before_ts timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id text, kind text, actor_id uuid, actor_address text, actor_name text, actor_avatar text, target_id uuid, target_label text, target_image text, amount numeric, message text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH feed AS (
    -- Follows received
    SELECT
      ('follow:' || f.id::text) AS id,
      'follow' AS kind,
      f.follower_id AS actor_id,
      p.wallet_address AS actor_address,
      p.display_name AS actor_name,
      p.avatar_url AS actor_avatar,
      NULL::uuid AS target_id,
      NULL::text AS target_label,
      NULL::text AS target_image,
      NULL::numeric AS amount,
      NULL::text AS message,
      f.created_at
    FROM public.followers f
    LEFT JOIN public.user_profiles p ON p.user_id = f.follower_id
    WHERE f.streamer_id = target_user_id
      AND (filter IN ('all','followers'))

    UNION ALL

    -- Tips received
    SELECT
      ('tip:' || e.id::text),
      'tip',
      e.from_user_id,
      p.wallet_address,
      COALESCE(p.display_name, e.from_username),
      p.avatar_url,
      NULL::uuid,
      NULL::text,
      NULL::text,
      e.amount,
      e.message,
      e.created_at
    FROM public.earnings e
    LEFT JOIN public.user_profiles p ON p.user_id = e.from_user_id
    WHERE e.user_id = target_user_id
      AND e.type = 'tip'
      AND (filter IN ('all','tips'))

    UNION ALL

    -- Mints of creator's collections
    SELECT
      ('mint:' || mn.id::text),
      'mint',
      mn.owner_id,
      COALESCE(p.wallet_address, mn.owner_address),
      p.display_name,
      p.avatar_url,
      c.id,
      c.name,
      COALESCE(mn.image_url, c.image_url),
      NULL::numeric,
      NULL::text,
      mn.minted_at
    FROM public.minted_nfts mn
    JOIN public.collections c ON c.id = mn.collection_id
    LEFT JOIN public.user_profiles p ON p.user_id = mn.owner_id
    WHERE c.creator_id = target_user_id
      AND (filter IN ('all','mints'))

    UNION ALL

    -- Secondary sales of creator's items
    SELECT
      ('sale:' || l.id::text),
      'sale',
      l.buyer_id,
      p.wallet_address,
      p.display_name,
      p.avatar_url,
      c.id,
      c.name,
      COALESCE(mn.image_url, c.image_url),
      l.price,
      NULL::text,
      l.updated_at
    FROM public.nft_listings l
    JOIN public.minted_nfts mn ON mn.id = l.nft_id
    JOIN public.collections c ON c.id = mn.collection_id
    LEFT JOIN public.user_profiles p ON p.user_id = l.buyer_id
    WHERE c.creator_id = target_user_id
      AND l.status = 'sold'
      AND (filter IN ('all','sales'))
  )
  SELECT * FROM feed
  WHERE (before_ts IS NULL OR feed.created_at < before_ts)
  ORDER BY feed.created_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(limit_count, 100));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_top_supporters(target_user_id uuid, limit_count integer DEFAULT 10)
 RETURNS TABLE(supporter_user_id uuid, wallet_address text, display_name text, avatar_url text, tips_sol numeric, nft_spend_sol numeric, total_score numeric, tier text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH tips AS (
    SELECT e.from_user_id AS uid, COALESCE(SUM(e.amount), 0)::numeric AS tips_sol
    FROM public.earnings e
    WHERE e.user_id = target_user_id
      AND e.type = 'tip'
      AND e.from_user_id IS NOT NULL
    GROUP BY e.from_user_id
  ),
  nft_spend AS (
    SELECT l.buyer_id AS uid, COALESCE(SUM(l.price), 0)::numeric AS nft_spend_sol
    FROM public.nft_listings l
    JOIN public.minted_nfts mn ON mn.id = l.nft_id
    JOIN public.collections c ON c.id = mn.collection_id
    WHERE l.status = 'sold'
      AND l.buyer_id IS NOT NULL
      AND c.creator_id = target_user_id
    GROUP BY l.buyer_id
  ),
  combined AS (
    SELECT
      COALESCE(t.uid, n.uid) AS uid,
      COALESCE(t.tips_sol, 0) AS tips_sol,
      COALESCE(n.nft_spend_sol, 0) AS nft_spend_sol,
      COALESCE(t.tips_sol, 0) + COALESCE(n.nft_spend_sol, 0) AS total_score
    FROM tips t
    FULL OUTER JOIN nft_spend n ON n.uid = t.uid
  )
  SELECT
    c.uid AS supporter_user_id,
    p.wallet_address,
    p.display_name,
    p.avatar_url,
    c.tips_sol,
    c.nft_spend_sol,
    c.total_score,
    CASE
      WHEN c.total_score >= 10 THEN 'platinum'
      WHEN c.total_score >= 5  THEN 'gold'
      WHEN c.total_score >= 1  THEN 'silver'
      WHEN c.total_score >= 0.1 THEN 'bronze'
      ELSE 'supporter'
    END AS tier
  FROM combined c
  LEFT JOIN public.user_profiles p ON p.user_id = c.uid
  WHERE c.total_score > 0
  ORDER BY c.total_score DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(limit_count, 100));
END;
$function$;

