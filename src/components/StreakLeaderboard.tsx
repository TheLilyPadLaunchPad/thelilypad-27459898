import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame, Trophy, Medal, Crown, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay } from "date-fns";

interface StreakEntry {
  userId: string;
  displayName: string;
  currentStreak: number;
  isCurrentUser: boolean;
}

export function StreakLeaderboard() {
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const currentUserId = session?.user?.id;

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['streak-leaderboard'],
    queryFn: async () => {
      // Get all volume tracking entries from last 90 days
      const ninetyDaysAgo = subDays(new Date(), 90).toISOString();
      
      const { data, error } = await supabase
        .from('volume_tracking')
        .select('user_id, created_at')
        .not('verified_at', 'is', null)
        .gte('created_at', ninetyDaysAgo)
        .not('user_id', 'is', null);

      if (error) throw error;

      // Group by user and calculate streaks
      const userTradingDays = new Map<string, Set<string>>();
      
      data?.forEach(entry => {
        if (!entry.user_id) return;
        const day = format(startOfDay(new Date(entry.created_at)), 'yyyy-MM-dd');
        if (!userTradingDays.has(entry.user_id)) {
          userTradingDays.set(entry.user_id, new Set());
        }
        userTradingDays.get(entry.user_id)!.add(day);
      });

      // Calculate current streak for each user
      const today = startOfDay(new Date());
      const yesterday = startOfDay(subDays(new Date(), 1));
      const todayStr = format(today, 'yyyy-MM-dd');
      const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

      const userStreaks: { userId: string; currentStreak: number }[] = [];

      userTradingDays.forEach((tradingDays, userId) => {
        let currentStreak = 0;
        let checkDate = tradingDays.has(todayStr) ? today : 
                        tradingDays.has(yesterdayStr) ? yesterday : null;

        if (checkDate) {
          while (tradingDays.has(format(checkDate, 'yyyy-MM-dd'))) {
            currentStreak++;
            checkDate = subDays(checkDate, 1);
          }
        }

        if (currentStreak > 0) {
          userStreaks.push({ userId, currentStreak });
        }
      });

      // Sort by streak length
      userStreaks.sort((a, b) => b.currentStreak - a.currentStreak);

      // Get top 10
      const top10 = userStreaks.slice(0, 10);

      // Fetch display names for top users
      const userIds = top10.map(u => u.userId);
      const { data: profiles } = await supabase
        .from('streamer_profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);

      const profileMap = new Map((profiles as { user_id: string; display_name: string }[] | null)?.map(p => [p.user_id, p.display_name]) || []);

      return top10.map((entry, index) => ({
        userId: entry.userId,
        displayName: profileMap.get(entry.userId) || `Trader ${entry.userId.slice(0, 6)}`,
        currentStreak: entry.currentStreak,
        isCurrentUser: entry.userId === currentUserId,
        rank: index + 1,
      }));
    },
    refetchInterval: 60000,
  });

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-5 h-5 text-amber-400" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Medal className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="w-5 text-center font-bold text-muted-foreground">{rank}</span>;
    }
  };

  const getStreakColor = (streak: number) => {
    if (streak >= 30) return "text-purple-400";
    if (streak >= 14) return "text-cyan-400";
    if (streak >= 7) return "text-amber-500";
    return "text-orange-500";
  };

  const getStreakBg = (streak: number) => {
    if (streak >= 30) return "bg-purple-500/10 border-purple-500/30";
    if (streak >= 14) return "bg-cyan-500/10 border-cyan-500/30";
    if (streak >= 7) return "bg-amber-500/10 border-amber-500/30";
    return "bg-orange-500/10 border-orange-500/30";
  };

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="w-9 h-9 rounded-lg" />
            <div>
              <Skeleton className="h-5 w-32 mb-1" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Trophy className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Streak Leaderboard</CardTitle>
              <CardDescription>Top active trading streaks</CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Flame className="w-3 h-3 text-orange-500" />
            Top 10
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {leaderboard && leaderboard.length > 0 ? (
          <div className="space-y-2">
            {leaderboard.map((entry) => (
              <div
                key={entry.userId}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  entry.isCurrentUser
                    ? 'bg-primary/10 border border-primary/30'
                    : 'bg-muted/30 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-center w-8">
                  {getRankIcon(entry.rank)}
                </div>
                
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="p-1.5 rounded-full bg-muted">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">
                      {entry.displayName}
                      {entry.isCurrentUser && (
                        <Badge variant="outline" className="ml-2 text-xs py-0">You</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${getStreakBg(entry.currentStreak)}`}>
                  <Flame className={`w-4 h-4 ${getStreakColor(entry.currentStreak)}`} />
                  <span className={`font-bold ${getStreakColor(entry.currentStreak)}`}>
                    {entry.currentStreak}
                  </span>
                  <span className="text-xs text-muted-foreground">days</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="p-3 rounded-full bg-muted/50 w-fit mx-auto mb-3">
              <Flame className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No active streaks yet. Start trading to appear on the leaderboard!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
