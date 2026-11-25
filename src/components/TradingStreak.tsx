import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame, Calendar, Trophy, Zap, Star, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, differenceInDays, startOfDay, eachDayOfInterval } from "date-fns";

interface StreakMilestone {
  days: number;
  name: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  reward: string;
}

const STREAK_MILESTONES: StreakMilestone[] = [
  { days: 3, name: "Getting Started", icon: Flame, color: "text-orange-500", bgColor: "bg-orange-500/10", reward: "1.1x volume bonus" },
  { days: 7, name: "Week Warrior", icon: Star, color: "text-amber-500", bgColor: "bg-amber-500/10", reward: "1.25x volume bonus" },
  { days: 14, name: "Dedicated Trader", icon: Zap, color: "text-yellow-500", bgColor: "bg-yellow-500/10", reward: "1.5x volume bonus" },
  { days: 30, name: "Monthly Master", icon: Trophy, color: "text-cyan-400", bgColor: "bg-cyan-400/10", reward: "2x volume bonus" },
  { days: 60, name: "Trading Legend", icon: Award, color: "text-purple-400", bgColor: "bg-purple-400/10", reward: "2.5x volume bonus" },
];

export function TradingStreak() {
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const userId = session?.user?.id;

  const { data: streakData, isLoading } = useQuery({
    queryKey: ['trading-streak', userId],
    queryFn: async () => {
      if (!userId) return null;

      // Fetch all trading activity for the last 90 days
      const ninetyDaysAgo = subDays(new Date(), 90).toISOString();

      const { data, error } = await supabase
        .from('volume_tracking')
        .select('created_at')
        .eq('user_id', userId)
        .not('verified_at', 'is', null)
        .gte('created_at', ninetyDaysAgo)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get unique trading days
      const tradingDays = new Set<string>();
      data?.forEach(entry => {
        const day = format(startOfDay(new Date(entry.created_at)), 'yyyy-MM-dd');
        tradingDays.add(day);
      });

      // Calculate current streak (must include today or yesterday)
      const today = startOfDay(new Date());
      const yesterday = startOfDay(subDays(new Date(), 1));
      const todayStr = format(today, 'yyyy-MM-dd');
      const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

      let currentStreak = 0;
      let checkDate = tradingDays.has(todayStr) ? today : 
                       tradingDays.has(yesterdayStr) ? yesterday : null;

      if (checkDate) {
        while (tradingDays.has(format(checkDate, 'yyyy-MM-dd'))) {
          currentStreak++;
          checkDate = subDays(checkDate, 1);
        }
      }

      // Calculate longest streak
      const sortedDays = Array.from(tradingDays).sort();
      let longestStreak = 0;
      let tempStreak = 1;

      for (let i = 1; i < sortedDays.length; i++) {
        const prevDate = new Date(sortedDays[i - 1]);
        const currDate = new Date(sortedDays[i]);
        const diff = differenceInDays(currDate, prevDate);

        if (diff === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);

      // Get last 7 days activity
      const last7Days = eachDayOfInterval({
        start: subDays(today, 6),
        end: today,
      }).map(date => ({
        date: format(date, 'yyyy-MM-dd'),
        dayName: format(date, 'EEE'),
        active: tradingDays.has(format(date, 'yyyy-MM-dd')),
        isToday: format(date, 'yyyy-MM-dd') === todayStr,
      }));

      // Total trading days
      const totalTradingDays = tradingDays.size;

      // Check if traded today
      const tradedToday = tradingDays.has(todayStr);

      return {
        currentStreak,
        longestStreak,
        totalTradingDays,
        last7Days,
        tradedToday,
      };
    },
    enabled: !!userId,
    refetchInterval: 60000,
  });

  const currentMilestone = useMemo(() => {
    if (!streakData) return null;
    return STREAK_MILESTONES.filter(m => streakData.currentStreak >= m.days).pop();
  }, [streakData]);

  const nextMilestone = useMemo(() => {
    if (!streakData) return STREAK_MILESTONES[0];
    return STREAK_MILESTONES.find(m => streakData.currentStreak < m.days) || null;
  }, [streakData]);

  const progressToNext = useMemo(() => {
    if (!streakData || !nextMilestone) return 100;
    const prevMilestone = STREAK_MILESTONES.filter(m => streakData.currentStreak >= m.days).pop();
    const start = prevMilestone?.days || 0;
    const end = nextMilestone.days;
    return ((streakData.currentStreak - start) / (end - start)) * 100;
  }, [streakData, nextMilestone]);

  if (!session) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Flame className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Trading Streak</CardTitle>
              <CardDescription>Sign in to track your streak</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="flex-1 h-8 rounded bg-muted/50" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="w-9 h-9 rounded-lg" />
            <div>
              <Skeleton className="h-5 w-28 mb-1" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full mb-3" />
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <Skeleton key={i} className="flex-1 h-8 rounded" />
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
            <div className={`p-2 rounded-lg ${currentMilestone?.bgColor || 'bg-orange-500/10'}`}>
              {currentMilestone ? (
                <currentMilestone.icon className={`w-5 h-5 ${currentMilestone.color}`} />
              ) : (
                <Flame className="w-5 h-5 text-orange-500" />
              )}
            </div>
            <div>
              <CardTitle className="text-lg">Trading Streak</CardTitle>
              <CardDescription>
                {currentMilestone ? currentMilestone.name : "Start your streak!"}
              </CardDescription>
            </div>
          </div>
          {streakData && streakData.currentStreak > 0 && (
            <Badge variant="secondary" className="gap-1 text-lg px-3 py-1">
              <Flame className="w-4 h-4 text-orange-500" />
              {streakData.currentStreak}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Streak Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/30 rounded-lg p-2 text-center">
            <div className="text-xl font-bold text-primary">
              {streakData?.currentStreak || 0}
            </div>
            <div className="text-[10px] text-muted-foreground">Current</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-2 text-center">
            <div className="text-xl font-bold">
              {streakData?.longestStreak || 0}
            </div>
            <div className="text-[10px] text-muted-foreground">Best</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-2 text-center">
            <div className="text-xl font-bold">
              {streakData?.totalTradingDays || 0}
            </div>
            <div className="text-[10px] text-muted-foreground">Total Days</div>
          </div>
        </div>

        {/* Weekly Activity */}
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
            <Calendar className="w-3 h-3" />
            Last 7 Days
          </div>
          <div className="flex gap-1">
            {streakData?.last7Days.map((day) => (
              <div
                key={day.date}
                className={`flex-1 h-10 rounded-lg flex flex-col items-center justify-center transition-all ${
                  day.active
                    ? 'bg-primary/20 border-2 border-primary'
                    : day.isToday
                    ? 'bg-muted/50 border-2 border-dashed border-muted-foreground/30'
                    : 'bg-muted/30'
                }`}
                title={day.date}
              >
                {day.active && <Flame className="w-3 h-3 text-primary" />}
                <span className="text-[10px] text-muted-foreground">{day.dayName}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Next Milestone Progress */}
        {nextMilestone && (
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <nextMilestone.icon className={`w-4 h-4 ${nextMilestone.color}`} />
                <span className="text-sm font-medium">{nextMilestone.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {streakData?.currentStreak || 0}/{nextMilestone.days} days
              </span>
            </div>
            <Progress value={progressToNext} className="h-1.5 mb-1" />
            <div className="text-xs text-muted-foreground">
              Reward: {nextMilestone.reward}
            </div>
          </div>
        )}

        {/* Today's Status */}
        {streakData && !streakData.tradedToday && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-center">
            <div className="text-sm font-medium text-amber-500 mb-1">
              Don't break your streak! 🔥
            </div>
            <p className="text-xs text-muted-foreground">
              Trade today to keep your {streakData.currentStreak > 0 ? `${streakData.currentStreak}-day` : ''} streak going
            </p>
          </div>
        )}

        {streakData?.tradedToday && streakData.currentStreak > 0 && (
          <div className="text-center text-xs text-green-500">
            ✓ You traded today! Streak maintained.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
