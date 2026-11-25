import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Challenge {
  id: string;
  challenger_id: string;
  challenged_id: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  challenger_streak: number;
  challenged_streak: number;
}

interface VolumeRecord {
  user_id: string;
  created_at: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Cron-only endpoint — verify shared secret to prevent public invocation
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("Authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date().toISOString().split('T')[0];

    // Find active challenges that have ended
    const { data: endedChallenges, error: fetchError } = await supabase
      .from("streak_challenges")
      .select("*")
      .eq("status", "active")
      .not("accepted_at", "is", null)
      .lte("end_date", today);

    if (fetchError) {
      throw fetchError;
    }

    const results: { id: string; winner_id: string | null }[] = [];

    for (const challenge of (endedChallenges as Challenge[]) || []) {
      // Calculate streaks for both users during the challenge period
      const startDate = new Date(challenge.start_date);
      const endDate = new Date(challenge.end_date);

      const calculateStreak = async (userId: string): Promise<number> => {
        const { data: volumeData, error } = await supabase
          .from("volume_tracking")
          .select("created_at")
          .eq("user_id", userId)
          .not("verified_at", "is", null)
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString())
          .order("created_at", { ascending: true });

        if (error || !volumeData) return 0;

        // Get unique trading days
        const tradingDays = new Set(
          (volumeData as VolumeRecord[]).map((v) => v.created_at.split("T")[0])
        );

        // Calculate longest consecutive streak
        const sortedDays = Array.from(tradingDays).sort();
        let maxStreak = 0;
        let currentStreak = 0;
        let prevDate: Date | null = null;

        for (const day of sortedDays) {
          const currentDate = new Date(day);
          if (prevDate) {
            const diffDays = Math.floor(
              (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (diffDays === 1) {
              currentStreak++;
            } else {
              currentStreak = 1;
            }
          } else {
            currentStreak = 1;
          }
          maxStreak = Math.max(maxStreak, currentStreak);
          prevDate = currentDate;
        }

        return maxStreak;
      };

      const challengerStreak = await calculateStreak(challenge.challenger_id);
      const challengedStreak = await calculateStreak(challenge.challenged_id);

      // Determine winner
      let winnerId: string | null = null;
      if (challengerStreak > challengedStreak) {
        winnerId = challenge.challenger_id;
      } else if (challengedStreak > challengerStreak) {
        winnerId = challenge.challenged_id;
      }
      // If equal, it's a tie (winnerId remains null)

      // Update challenge
      const { error: updateError } = await supabase
        .from("streak_challenges")
        .update({
          status: "completed",
          challenger_streak: challengerStreak,
          challenged_streak: challengedStreak,
          winner_id: winnerId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", challenge.id);

      if (updateError) {
        console.error(`Failed to update challenge ${challenge.id}:`, updateError);
      } else {
        results.push({ id: challenge.id, winner_id: winnerId });

        // Award badges to winner
        if (winnerId) {
          const winnerStreak = winnerId === challenge.challenger_id ? challengerStreak : challengedStreak;

          // Count previous wins for this user
          const { count: previousWins } = await supabase
            .from("challenge_badges")
            .select("*", { count: "exact", head: true })
            .eq("user_id", winnerId)
            .eq("badge_type", "challenge_victory");

          const totalWins = (previousWins || 0) + 1;

          // Determine badge tier based on total wins
          let badgeType = "challenge_victory";
          let badgeName = "Challenge Victor";
          let badgeIcon = "trophy";
          let description = `Won a ${challenge.duration_days}-day streak challenge with ${winnerStreak} days`;

          if (totalWins >= 10) {
            badgeType = "challenge_legend";
            badgeName = "Challenge Legend";
            badgeIcon = "crown";
            description = `Achieved 10+ challenge victories! Latest: ${winnerStreak} day streak`;
          } else if (totalWins >= 5) {
            badgeType = "challenge_master";
            badgeName = "Challenge Master";
            badgeIcon = "medal";
            description = `Achieved 5+ challenge victories! Latest: ${winnerStreak} day streak`;
          } else if (totalWins >= 3) {
            badgeType = "challenge_champion";
            badgeName = "Challenge Champion";
            badgeIcon = "award";
            description = `Achieved 3+ challenge victories! Latest: ${winnerStreak} day streak`;
          }

          // Special badges for impressive streaks
          if (winnerStreak >= 25) {
            badgeType = "streak_dominator";
            badgeName = "Streak Dominator";
            badgeIcon = "flame";
            description = `Dominated with an incredible ${winnerStreak}-day streak!`;
          } else if (winnerStreak >= 14) {
            badgeType = "streak_warrior";
            badgeName = "Streak Warrior";
            badgeIcon = "swords";
            description = `Won with an impressive ${winnerStreak}-day streak!`;
          }

          await supabase.from("challenge_badges").insert({
            user_id: winnerId,
            badge_type: badgeType,
            badge_name: badgeName,
            badge_icon: badgeIcon,
            description: description,
            challenge_id: challenge.id,
            metadata: {
              streak: winnerStreak,
              duration_days: challenge.duration_days,
              total_wins: totalWins,
              opponent_streak: winnerId === challenge.challenger_id ? challengedStreak : challengerStreak
            }
          });
        }

        // Create notifications for both users
        const challengerNotif = {
          user_id: challenge.challenger_id,
          type: "streak_challenge_complete",
          title: "Streak Challenge Complete!",
          message: winnerId === challenge.challenger_id
            ? `You won the streak challenge with ${challengerStreak} days! 🏆`
            : winnerId === null
              ? `The streak challenge ended in a tie at ${challengerStreak} days!`
              : `You lost the streak challenge. Your streak: ${challengerStreak}, Opponent: ${challengedStreak}`,
          link: "/buyback-program",
          metadata: { challenge_id: challenge.id, won: winnerId === challenge.challenger_id }
        };

        const challengedNotif = {
          user_id: challenge.challenged_id,
          type: "streak_challenge_complete",
          title: "Streak Challenge Complete!",
          message: winnerId === challenge.challenged_id
            ? `You won the streak challenge with ${challengedStreak} days! 🏆`
            : winnerId === null
              ? `The streak challenge ended in a tie at ${challengedStreak} days!`
              : `You lost the streak challenge. Your streak: ${challengedStreak}, Opponent: ${challengerStreak}`,
          link: "/buyback-program",
          metadata: { challenge_id: challenge.id, won: winnerId === challenge.challenged_id }
        };

        await supabase.from("notifications").insert([challengerNotif, challengedNotif]);
      }
    }

    // Also update active challenges with current streak counts
    const { data: activeChallenges, error: activeError } = await supabase
      .from("streak_challenges")
      .select("*")
      .eq("status", "active")
      .not("accepted_at", "is", null)
      .gt("end_date", today);

    if (!activeError && activeChallenges) {
      for (const challenge of activeChallenges as Challenge[]) {
        const startDate = new Date(challenge.start_date);
        const now = new Date();

        const getRecentStreak = async (userId: string): Promise<number> => {
          const { data, error } = await supabase
            .from("volume_tracking")
            .select("created_at")
            .eq("user_id", userId)
            .not("verified_at", "is", null)
            .gte("created_at", startDate.toISOString())
            .lte("created_at", now.toISOString())
            .order("created_at", { ascending: false });

          if (error || !data) return 0;

          const tradingDays = new Set(
            (data as VolumeRecord[]).map((v) => v.created_at.split("T")[0])
          );
          const sortedDays = Array.from(tradingDays).sort().reverse();

          let streak = 0;
          let expectedDate = new Date(today);

          for (const day of sortedDays) {
            const dayDate = new Date(day);
            const diff = Math.floor(
              (expectedDate.getTime() - dayDate.getTime()) / (1000 * 60 * 60 * 24)
            );

            if (diff <= 1) {
              streak++;
              expectedDate = dayDate;
            } else {
              break;
            }
          }

          return streak;
        };

        const challengerStreak = await getRecentStreak(challenge.challenger_id);
        const challengedStreak = await getRecentStreak(challenge.challenged_id);

        await supabase
          .from("streak_challenges")
          .update({
            challenger_streak: challengerStreak,
            challenged_streak: challengedStreak,
            updated_at: new Date().toISOString(),
          })
          .eq("id", challenge.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        completed: results.length,
        results
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    );
  } catch (error: unknown) {
    console.error("Error resolving challenges:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    );
  }
});
