import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { Activity, Flame } from "lucide-react";

interface StreakHistoryGraphProps {
  challengeId: string;
  userId: string;
  opponentId: string;
  startDate: string;
  endDate: string;
  userDisplayName?: string;
  opponentDisplayName?: string;
}

interface DailyData {
  date: string;
  displayDate: string;
  userVolume: number;
  opponentVolume: number;
  userActive: boolean;
  opponentActive: boolean;
}

export const StreakHistoryGraph = ({
  challengeId,
  userId,
  opponentId,
  startDate,
  endDate,
  userDisplayName = "You",
  opponentDisplayName = "Opponent",
}: StreakHistoryGraphProps) => {
  const { data: chartData, isLoading } = useQuery({
    queryKey: ["streak-history", challengeId, userId, opponentId],
    queryFn: async () => {
      // Get volume data for both users during the challenge period
      const { data: volumeData, error } = await supabase
        .from("volume_tracking")
        .select("user_id, volume_amount, created_at")
        .not("verified_at", "is", null)
        .in("user_id", [userId, opponentId])
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Generate all days in the challenge period
      const start = parseISO(startDate);
      const end = new Date() < parseISO(endDate) ? new Date() : parseISO(endDate);
      const allDays = eachDayOfInterval({ start, end });

      // Aggregate volume by day for each user
      const dailyData: DailyData[] = allDays.map((day) => {
        const dayStr = format(day, "yyyy-MM-dd");

        const userDayVolume = volumeData
          ?.filter(
            (v) =>
              v.user_id === userId &&
              format(parseISO(v.created_at), "yyyy-MM-dd") === dayStr
          )
          .reduce((sum, v) => sum + Number(v.volume_amount), 0) || 0;

        const opponentDayVolume = volumeData
          ?.filter(
            (v) =>
              v.user_id === opponentId &&
              format(parseISO(v.created_at), "yyyy-MM-dd") === dayStr
          )
          .reduce((sum, v) => sum + Number(v.volume_amount), 0) || 0;

        return {
          date: dayStr,
          displayDate: format(day, "MMM d"),
          userVolume: userDayVolume,
          opponentVolume: opponentDayVolume,
          userActive: userDayVolume > 0,
          opponentActive: opponentDayVolume > 0,
        };
      });

      return dailyData;
    },
    enabled: !!challengeId && !!userId && !!opponentId,
  });

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[150px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!chartData || chartData.length === 0) {
    return null;
  }

  const userActiveDays = chartData.filter((d) => d.userActive).length;
  const opponentActiveDays = chartData.filter((d) => d.opponentActive).length;

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Daily Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="userGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="opponentGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="displayDate"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number, name: string) => [
                  `${value.toFixed(2)} SOL`,
                  name === "userVolume" ? userDisplayName : opponentDisplayName,
                ]}
              />
              <Area
                type="monotone"
                dataKey="userVolume"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#userGradient)"
                name="userVolume"
              />
              <Area
                type="monotone"
                dataKey="opponentVolume"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                fill="url(#opponentGradient)"
                name="opponentVolume"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-muted-foreground">
              {userDisplayName}: <span className="text-foreground font-medium">{userActiveDays}</span> active days
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-destructive" />
            <span className="text-muted-foreground">
              {opponentDisplayName}: <span className="text-foreground font-medium">{opponentActiveDays}</span> active days
            </span>
          </div>
        </div>

        {/* Activity streak indicators */}
        <div className="flex gap-1 flex-wrap">
          {chartData.map((day, i) => (
            <div
              key={day.date}
              className={`w-6 h-6 rounded flex items-center justify-center text-xs ${day.userActive && day.opponentActive
                  ? "bg-yellow-500/20 text-yellow-500"
                  : day.userActive
                    ? "bg-primary/20 text-primary"
                    : day.opponentActive
                      ? "bg-destructive/20 text-destructive"
                      : "bg-muted/30 text-muted-foreground"
                }`}
              title={`${day.displayDate}: ${day.userActive ? "You traded" : ""}${day.userActive && day.opponentActive ? " & " : ""
                }${day.opponentActive ? "Opponent traded" : ""}`}
            >
              {day.userActive || day.opponentActive ? (
                <Flame className="w-3 h-3" />
              ) : (
                <span className="opacity-50">·</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
