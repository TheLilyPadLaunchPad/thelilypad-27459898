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
  rank_position: number;
  display_name: string | null;
  avatar_url: string | null;
  referral_count: number;
  is_me: boolean;
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
        // Everyone who joined the referral program, including members with 0 referrals
        const { data, error } = await (supabase.rpc as any)('get_referral_leaderboard', { limit_count: 500 });
        if (error) throw error;
        setEntries((data || []) as LeaderboardEntry[]);
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
            <p className="text-sm text-muted-foreground">Everyone in the referral program is listed here. Top referrers earn extra rewards when The Lily Pad launches!</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center text-muted-foreground py-8">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No one has joined the referral program yet. Be the first!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry, i) => (
                  <motion.div
                    key={entry.rank_position}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i, 20) * 0.05 }}
                    className={`flex items-center gap-3 p-3 rounded-lg ${entry.is_me || (i < 3 && entry.referral_count > 0) ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50'}`}
                  >
                    <span className={`w-8 text-center font-bold ${entry.referral_count > 0 ? getMedalColor(i) : 'text-muted-foreground'}`}>
                      {i < 3 && entry.referral_count > 0 ? <Medal className="w-5 h-5 mx-auto" /> : `#${i + 1}`}
                    </span>
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={entry.avatar_url || undefined} />
                      <AvatarFallback className="text-xs bg-primary/20">
                        {(entry.display_name || '?')[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 font-medium text-sm truncate">
                      {entry.display_name || 'Lily Pad member'}{entry.is_me ? ' (you)' : ''}
                    </span>
                    <span className="text-sm font-bold text-primary">{entry.referral_count} {entry.referral_count === 1 ? 'referral' : 'referrals'}</span>
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
