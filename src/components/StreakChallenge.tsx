import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { 
  Swords, 
  UserPlus, 
  Trophy, 
  Clock, 
  Check, 
  X, 
  Flame,
  Users,
  Calendar,
  RotateCcw
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, differenceInDays, addDays } from "date-fns";
import { StreakHistoryGraph } from "./StreakHistoryGraph";

const DURATION_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
];

interface Challenge {
  id: string;
  challenger_id: string;
  challenged_id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  duration_days: number;
  challenger_streak: number;
  challenged_streak: number;
  winner_id: string | null;
  created_at: string;
}

interface UserProfile {
  user_id: string;
  display_name: string | null;
}

export const StreakChallenge = () => {
  const [challengeDialogOpen, setChallengeDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(7);
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: challenges, isLoading: challengesLoading } = useQuery({
    queryKey: ["streak-challenges", session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return [];
      
      const { data, error } = await supabase
        .from("streak_challenges")
        .select("*")
        .or(`challenger_id.eq.${session.user.id},challenged_id.eq.${session.user.id}`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Challenge[];
    },
    enabled: !!session?.user?.id,
  });

  const { data: searchResults } = useQuery({
    queryKey: ["user-search", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      
      const { data, error } = await supabase
        .from("streamer_profiles")
        .select("user_id, display_name")
        .ilike("display_name", `%${searchQuery}%`)
        .neq("user_id", session?.user?.id)
        .limit(5);

      if (error) throw error;
      return data as UserProfile[];
    },
    enabled: searchQuery.length >= 2 && !!session?.user?.id,
  });

  const { data: userProfiles } = useQuery({
    queryKey: ["challenge-profiles", challenges],
    queryFn: async () => {
      if (!challenges || challenges.length === 0) return {};
      
      const userIds = [...new Set(challenges.flatMap(c => [c.challenger_id, c.challenged_id]))];
      
      const { data, error } = await supabase
        .from("streamer_profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);

      if (error) throw error;
      
      const profileMap: Record<string, string> = {};
      data?.forEach(p => {
        profileMap[p.user_id] = p.display_name || `User ${p.user_id.slice(0, 6)}`;
      });
      return profileMap;
    },
    enabled: !!challenges && challenges.length > 0,
  });

  const createChallengeMutation = useMutation({
    mutationFn: async (challengedId: string) => {
      const endDate = addDays(new Date(), selectedDuration);
      const { error } = await supabase
        .from("streak_challenges")
        .insert({
          challenger_id: session?.user?.id,
          challenged_id: challengedId,
          duration_days: selectedDuration,
          end_date: endDate.toISOString().split('T')[0],
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streak-challenges"] });
      setChallengeDialogOpen(false);
      setSearchQuery("");
      setSelectedDuration(7);
      toast({
        title: "Challenge Sent!",
        description: `Waiting for your friend to accept the ${selectedDuration}-day challenge.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send challenge. Try again.",
        variant: "destructive",
      });
    },
  });

  const respondChallengeMutation = useMutation({
    mutationFn: async ({ challengeId, accept, durationDays }: { challengeId: string; accept: boolean; durationDays: number }) => {
      const { error } = await supabase
        .from("streak_challenges")
        .update({ status: accept ? "active" : "declined" })
        .eq("id", challengeId);

      if (error) throw error;
    },
    onSuccess: (_, { accept }) => {
      queryClient.invalidateQueries({ queryKey: ["streak-challenges"] });
      toast({
        title: accept ? "Challenge Accepted!" : "Challenge Declined",
        description: accept 
          ? "The streak competition has begun! Trade daily to build your streak." 
          : "You've declined the challenge.",
      });
    },
  });

  const rematchMutation = useMutation({
    mutationFn: async ({ opponentId, durationDays }: { opponentId: string; durationDays: number }) => {
      const endDate = addDays(new Date(), durationDays);
      const { error } = await supabase
        .from("streak_challenges")
        .insert({
          challenger_id: session?.user?.id,
          challenged_id: opponentId,
          duration_days: durationDays,
          end_date: endDate.toISOString().split('T')[0],
        });

      if (error) throw error;
    },
    onSuccess: (_, { durationDays }) => {
      queryClient.invalidateQueries({ queryKey: ["streak-challenges"] });
      toast({
        title: "Rematch Sent!",
        description: `Waiting for your opponent to accept the ${durationDays}-day rematch.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send rematch. Try again.",
        variant: "destructive",
      });
    },
  });

  const getDisplayName = (userId: string) => {
    return userProfiles?.[userId] || `User ${userId.slice(0, 6)}`;
  };

  const getStatusBadge = (challenge: Challenge) => {
    switch (challenge.status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "active":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30"><Flame className="w-3 h-3 mr-1" />Active</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30"><Trophy className="w-3 h-3 mr-1" />Completed</Badge>;
      case "declined":
        return <Badge variant="outline" className="bg-muted text-muted-foreground"><X className="w-3 h-3 mr-1" />Declined</Badge>;
      default:
        return null;
    }
  };

  const pendingChallenges = challenges?.filter(c => c.status === "pending" && c.challenged_id === session?.user?.id) || [];
  const activeChallenges = challenges?.filter(c => c.status === "active") || [];
  const pastChallenges = challenges?.filter(c => c.status === "completed" || c.status === "declined") || [];

  if (!session) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary" />
            Streak Challenges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            Sign in to challenge friends to streak competitions
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Swords className="w-5 h-5 text-primary" />
          Streak Challenges
        </CardTitle>
        <Dialog open={challengeDialogOpen} onOpenChange={setChallengeDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <UserPlus className="w-4 h-4" />
              Challenge Friend
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Challenge a Friend</DialogTitle>
              <DialogDescription>
                Search for a user to challenge them to a streak competition
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Challenge Duration</label>
                <Select
                  value={selectedDuration.toString()}
                  onValueChange={(v) => setSelectedDuration(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        <span className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchResults && searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map((user) => (
                    <div
                      key={user.user_id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span>{user.display_name || `User ${user.user_id.slice(0, 6)}`}</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => createChallengeMutation.mutate(user.user_id)}
                        disabled={createChallengeMutation.isPending}
                      >
                        <Swords className="w-4 h-4 mr-1" />
                        {selectedDuration}d Challenge
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {searchQuery.length >= 2 && searchResults?.length === 0 && (
                <p className="text-muted-foreground text-center text-sm">No users found</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-6">
        {challengesLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            {/* Pending Challenges (Incoming) */}
            {pendingChallenges.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Incoming Challenges</h4>
                {pendingChallenges.map((challenge) => (
                  <div
                    key={challenge.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                        <Swords className="w-5 h-5 text-yellow-500" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {getDisplayName(challenge.challenger_id)} challenged you!
                        </p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {challenge.duration_days}-day streak competition
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => respondChallengeMutation.mutate({ 
                          challengeId: challenge.id, 
                          accept: false,
                          durationDays: challenge.duration_days 
                        })}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => respondChallengeMutation.mutate({ 
                          challengeId: challenge.id, 
                          accept: true,
                          durationDays: challenge.duration_days 
                        })}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Accept
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Active Challenges */}
            {activeChallenges.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Active Challenges</h4>
                {activeChallenges.map((challenge) => {
                  const isChallenger = challenge.challenger_id === session?.user?.id;
                  const opponentId = isChallenger ? challenge.challenged_id : challenge.challenger_id;
                  const myStreak = isChallenger ? challenge.challenger_streak : challenge.challenged_streak;
                  const opponentStreak = isChallenger ? challenge.challenged_streak : challenge.challenger_streak;
                  const isWinning = myStreak > opponentStreak;
                  const daysRemaining = challenge.end_date 
                    ? Math.max(0, differenceInDays(new Date(challenge.end_date), new Date()))
                    : 0;

                  return (
                    <div
                      key={challenge.id}
                      className="p-4 rounded-lg bg-primary/5 border border-primary/20"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">vs {getDisplayName(opponentId)}</span>
                          {getStatusBadge(challenge)}
                        </div>
                        <div className="flex items-center gap-2">
                          {daysRemaining > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="w-3 h-3 mr-1" />
                              {daysRemaining}d left
                            </Badge>
                          )}
                          {isWinning && myStreak > 0 && (
                            <Badge className="bg-green-500/20 text-green-500">
                              <Trophy className="w-3 h-3 mr-1" />
                              Leading
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div className={`text-center p-3 rounded-lg ${isWinning ? 'bg-green-500/10' : 'bg-muted/50'}`}>
                          <p className="text-xs text-muted-foreground">Your Streak</p>
                          <p className="text-2xl font-bold flex items-center justify-center gap-1">
                            <Flame className={`w-5 h-5 ${myStreak > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
                            {myStreak}
                          </p>
                        </div>
                        <div className={`text-center p-3 rounded-lg ${!isWinning && opponentStreak > myStreak ? 'bg-red-500/10' : 'bg-muted/50'}`}>
                          <p className="text-xs text-muted-foreground">Opponent</p>
                          <p className="text-2xl font-bold flex items-center justify-center gap-1">
                            <Flame className={`w-5 h-5 ${opponentStreak > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
                            {opponentStreak}
                          </p>
                        </div>
                      </div>
                      
                      {/* Streak History Graph */}
                      {challenge.start_date && challenge.end_date && (
                        <StreakHistoryGraph
                          challengeId={challenge.id}
                          userId={session?.user?.id || ""}
                          opponentId={opponentId}
                          startDate={challenge.start_date}
                          endDate={challenge.end_date}
                          userDisplayName="You"
                          opponentDisplayName={getDisplayName(opponentId)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Past Challenges */}
            {pastChallenges.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Past Challenges</h4>
                {pastChallenges.slice(0, 3).map((challenge) => {
                  const isChallenger = challenge.challenger_id === session?.user?.id;
                  const opponentId = isChallenger ? challenge.challenged_id : challenge.challenger_id;
                  const didWin = challenge.winner_id === session?.user?.id;

                  return (
                    <div
                      key={challenge.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                    >
                      <div className="flex items-center gap-2">
                        <span>vs {getDisplayName(opponentId)}</span>
                        {getStatusBadge(challenge)}
                      </div>
                      <div className="flex items-center gap-2">
                        {challenge.status === "completed" && (
                          <>
                            <Badge variant={didWin ? "default" : "secondary"}>
                              {didWin ? "Won" : "Lost"}
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => rematchMutation.mutate({ 
                                opponentId, 
                                durationDays: challenge.duration_days 
                              })}
                              disabled={rematchMutation.isPending}
                            >
                              <RotateCcw className="w-3 h-3" />
                              Rematch
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty State */}
            {(!challenges || challenges.length === 0) && (
              <div className="text-center py-8">
                <Swords className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No challenges yet</p>
                <p className="text-sm text-muted-foreground">Challenge a friend to compete on trading streaks!</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
