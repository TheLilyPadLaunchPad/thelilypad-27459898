-- 1. governance_delegations: restrict public read
DROP POLICY IF EXISTS "Anyone can view delegations" ON public.governance_delegations;
REVOKE SELECT ON public.governance_delegations FROM anon;
CREATE POLICY "Owners and admins can view delegations"
ON public.governance_delegations
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
      AND (up.wallet_address = governance_delegations.delegator_address
        OR up.wallet_address = governance_delegations.delegate_address)
  )
);

-- 2. governance_votes: restrict public read of voter_address/weight
DROP POLICY IF EXISTS "Anyone can view governance votes" ON public.governance_votes;
REVOKE SELECT ON public.governance_votes FROM anon;
CREATE POLICY "Voters and admins can view governance votes"
ON public.governance_votes
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR voter_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
      AND up.wallet_address = governance_votes.voter_address
  )
);

-- Public aggregate tallies remain available without exposing wallets
CREATE OR REPLACE FUNCTION public.get_proposal_vote_tally(p_proposal_id uuid)
RETURNS TABLE(support integer, total_weight numeric, vote_count integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT v.support, COALESCE(SUM(v.weight), 0)::numeric, COUNT(*)::int
  FROM public.governance_votes v
  WHERE v.proposal_id = p_proposal_id
  GROUP BY v.support
$$;
GRANT EXECUTE ON FUNCTION public.get_proposal_vote_tally(uuid) TO anon, authenticated;

-- 3. stream_chat_messages: hide wallet_address via column-level grants
REVOKE SELECT ON public.stream_chat_messages FROM anon, authenticated;
GRANT SELECT (id, playback_id, user_id, username, message, created_at, message_type, sticker_url, sticker_name, sticker_item_id)
  ON public.stream_chat_messages TO anon, authenticated;
GRANT ALL ON public.stream_chat_messages TO service_role;