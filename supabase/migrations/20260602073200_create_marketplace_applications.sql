-- Create marketplace applications table
CREATE TABLE public.marketplace_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_address text NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL,
  description text,
  image_url text,
  total_supply integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  UNIQUE(collection_address)
);

-- Enable RLS
ALTER TABLE public.marketplace_applications ENABLE ROW LEVEL SECURITY;

-- Users can view their own applications
CREATE POLICY "Users can view their own applications"
  ON public.marketplace_applications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all applications
CREATE POLICY "Admins can view all applications"
  ON public.marketplace_applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can insert their own applications
CREATE POLICY "Users can insert their own applications"
  ON public.marketplace_applications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can update applications (approve/reject)
CREATE POLICY "Admins can update applications"
  ON public.marketplace_applications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
