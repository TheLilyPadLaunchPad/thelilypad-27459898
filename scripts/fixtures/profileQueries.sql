-- Baseline profile queries for isolated migration regression tests. No application records.

CREATE OR REPLACE FUNCTION public.get_profile_activity_feed(target_user_id uuid, filter text DEFAULT 'all'::text, limit_count integer DEFAULT 30, before_ts timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id text, kind text, actor_id uuid, actor_address text, actor_name text, actor_avatar text, target_id uuid, target_label text, target_image text, amount numeric, message text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;

CREATE OR REPLACE FUNCTION public.get_top_supporters(target_user_id uuid, limit_count integer DEFAULT 10)
 RETURNS TABLE(supporter_user_id uuid, wallet_address text, display_name text, avatar_url text, tips_sol numeric, nft_spend_sol numeric, total_score numeric, tier text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;

