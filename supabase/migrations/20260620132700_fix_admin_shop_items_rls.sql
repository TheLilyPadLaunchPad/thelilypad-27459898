-- Fix RLS policy priority for admin shop item management
-- This ensures admin policies take precedence over creator policies

-- Drop existing admin policy if it exists
DROP POLICY IF EXISTS "Admins can manage all shop items" ON public.shop_items;

-- Recreate admin policy with proper precedence
-- This policy allows admins to perform all operations on shop_items
CREATE POLICY "Admins can manage all shop items"
ON public.shop_items FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Also ensure admin policy exists for shop_item_contents
DROP POLICY IF EXISTS "Admins can manage all shop item contents" ON public.shop_item_contents;

CREATE POLICY "Admins can manage all shop item contents"
ON public.shop_item_contents FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
