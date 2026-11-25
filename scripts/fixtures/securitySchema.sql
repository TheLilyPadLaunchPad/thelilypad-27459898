-- Minimal pre-fix application schema for a disposable local PostgreSQL database.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now());
INSERT INTO auth.users DEFAULT VALUES;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
CREATE TYPE public.app_role AS ENUM('admin','moderator','user','buyback_operator');
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;
CREATE TABLE public.user_profiles(id uuid DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),wallet_address text,is_private boolean DEFAULT false,display_name text,avatar_url text);
CREATE TABLE public.volume_tracking(id uuid DEFAULT gen_random_uuid(),source_type text,volume_amount numeric,weighted_volume numeric,created_at timestamptz DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.volume_tracking TO authenticated;
CREATE POLICY "Authenticated users can insert volume" ON public.volume_tracking FOR INSERT TO authenticated WITH CHECK(true);
CREATE TABLE public.streak_challenges(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,challenger_id uuid,challenged_id uuid,status text DEFAULT 'pending',duration_days int DEFAULT 7,start_date date DEFAULT CURRENT_DATE,end_date date,challenger_streak int DEFAULT 0,challenged_streak int DEFAULT 0,winner_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.lily_raffles(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,name text,entry_price numeric DEFAULT 0,max_tickets_per_user int DEFAULT 10,start_date timestamptz,end_date timestamptz,created_by uuid,is_active boolean DEFAULT true,is_drawn boolean DEFAULT false);
CREATE TABLE public.lily_raffle_entries(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,raffle_id uuid REFERENCES public.lily_raffles(id),user_id uuid,ticket_count int,total_paid numeric,tx_hash text,created_at timestamptz DEFAULT now());
GRANT SELECT,INSERT ON public.lily_raffle_entries TO authenticated;
CREATE POLICY "Users can enter raffles" ON public.lily_raffle_entries FOR INSERT WITH CHECK(auth.uid()=user_id);
CREATE TABLE public.streamer_profiles(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,user_id uuid,display_name text,is_verified boolean DEFAULT false);
CREATE TABLE public.followers(id uuid DEFAULT gen_random_uuid(),follower_id uuid,streamer_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE public.earnings(id uuid DEFAULT gen_random_uuid(),user_id uuid,from_user_id uuid,amount numeric,type text,from_username text,message text,created_at timestamptz DEFAULT now());
CREATE TABLE public.collections(id uuid,creator_id uuid,name text,image_url text);
CREATE TABLE public.minted_nfts(id uuid,owner_id uuid,owner_address text,collection_id uuid,image_url text,minted_at timestamptz);
CREATE TABLE public.nft_listings(id uuid,buyer_id uuid,nft_id uuid,price numeric,status text,updated_at timestamptz);