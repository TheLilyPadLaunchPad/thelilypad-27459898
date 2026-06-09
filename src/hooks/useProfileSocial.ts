import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProfileSocialCounts {
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
}

/**
 * Live follower/following counts + isFollowing flag for a target user.
 * Subscribes to realtime inserts/deletes on the `followers` table.
 */
export function useProfileSocial(targetUserId: string | null | undefined) {
  const [counts, setCounts] = useState<ProfileSocialCounts>({
    followersCount: 0,
    followingCount: 0,
    isFollowing: false,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!targetUserId) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_profile_social_counts", {
      target_user_id: targetUserId,
    });
    if (!error && data) {
      setCounts(data as unknown as ProfileSocialCounts);
    }
    setLoading(false);
  }, [targetUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!targetUserId) return;
    const channel = supabase
      .channel(`followers:${targetUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "followers", filter: `streamer_id=eq.${targetUserId}` },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "followers", filter: `follower_id=eq.${targetUserId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetUserId, refresh]);

  return { ...counts, loading, refresh };
}
