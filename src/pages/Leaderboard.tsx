import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Medal, Users, ArrowLeft, Home } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { useSEO } from '@/hooks/useSEO';
import { useBetaMode } from '@/hooks/useBetaMode';
import { useNavigate } from 'react-router-dom';

interface LeaderboardEntry {
  referrer_id: string;
  count: number;
  display_name: string | null;
  avatar_url: string | null;
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { isBetaMode } = useBetaMode();

  useSEO({ title: 'Referral Leaderboard | The Lily Pad', description: 'See top referrers on The Lily Pad' });

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        // Get referral counts grouped by referrer
        const { data: signups } = await supabase
          .from('referral_signups')
          .select('referrer_id');

        if (!signups || signups.length === 0) { setLoading(false); return; }

        // Count per referrer
        const counts: Record<string, number> = {};
        signups.forEach((s: any) => { counts[s.referrer_id] = (counts[s.referrer_id] || 0) + 1; });

        // Get profile info for top referrers
        const topIds = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([id]) => id);

        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', topIds);

        const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

        const leaderboard: LeaderboardEntry[] = topIds.map((id) => ({
          referrer_id: id,
          count: counts[id],
          display_name: (profileMap.get(id) as any)?.display_name || null,
          avatar_url: (profileMap.get(id) as any)?.avatar_url || null,
        }));

        setEntries(leaderboard);
      } catch (e) {
        console.error('Leaderboard error:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  const getMedalColor = (rank: number) => {
    if (rank === 0) return 'text-yellow-400';
    if (rank === 1) return 'text-gray-300';
    if (rank === 2) return 'text-amber-600';
    return 'text-muted-foreground';
  };

  // Back destination: always /waitroom when in beta, otherwise browser history
  const handleBack = () => {
    if (isBetaMode) {
      navigate('/waitroom');
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12 max-w-2xl">

        {/* Back nav */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" className="gap-2" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4" />
            {isBetaMode ? 'Back to Wait Room' : 'Back'}
          </Button>

          {/* Beta mode breadcrumb */}
          {isBetaMode && (
            <button
              id="leaderboard-back-to-waitroom"
              onClick={() => navigate('/waitroom')}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              Wait Room
            </button>
          )}
        </div>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Trophy className="w-6 h-6 text-yellow-400" />
              Referral Leaderboard
            </CardTitle>
            <p className="text-sm text-muted-foreground">Top referrers earn extra rewards when The Lily Pad launches!</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center text-muted-foreground py-8">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No referrals yet. Be the first!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry, i) => (
                  <motion.div
                    key={entry.referrer_id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`flex items-center gap-3 p-3 rounded-lg ${i < 3 ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50'}`}
                  >
                    <span className={`w-8 text-center font-bold ${getMedalColor(i)}`}>
                      {i < 3 ? <Medal className="w-5 h-5 mx-auto" /> : `#${i + 1}`}
                    </span>
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={entry.avatar_url || undefined} />
                      <AvatarFallback className="text-xs bg-primary/20">
                        {(entry.display_name || '?')[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 font-medium text-sm truncate">
                      {entry.display_name || `User ${entry.referrer_id.slice(0, 6)}`}
                    </span>
                    <span className="text-sm font-bold text-primary">{entry.count} referrals</span>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
