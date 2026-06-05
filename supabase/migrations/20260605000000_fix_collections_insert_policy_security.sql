-- Drop the insecure policy
DROP POLICY IF EXISTS "collections_insert_authenticated" ON public.collections;

-- Create the secure policy ensuring users can only insert collections attributed to their own creator_id
CREATE POLICY "collections_insert_authenticated" ON public.collections 
FOR INSERT 
WITH CHECK (auth.uid() = creator_id);
