import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Users, Copy, Share2, Trophy, ExternalLink, FlaskConical, Lock, ArrowRight, Medal, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useReferralCode } from '@/hooks/useReferralCode';
import { useBetaMode } from '@/hooks/useBetaMode';
import { LilyPadLogo } from '@/components/LilyPadLogo';
import { useSEO } from '@/hooks/useSEO';
import { WLCard } from '@/components/waitroom/WLCard';
import { Navbar } from '@/components/Navbar';

interface ChatMessage {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  content: string;
  created_at: string;
}

export default function WaitRoom() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [topReferrers, setTopReferrers] = useState<{ display_name: string | null; avatar_url: string | null; count: number }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { profile } = useUserProfile();
  const { walletAddress } = useAuth();
  const { referralCode, referralCount, loading: refLoading } = useReferralCode();
  const { isBetaMode } = useBetaMode();
  const navigate = useNavigate();

  useSEO({ title: 'The Lily Pad - Wait Room', description: 'Hang out and chat while we get everything ready!' });

  // Fetch top 3 referrers for the leaderboard preview
  useEffect(() => {
    const fetchTop = async () => {
      const { data: signups } = await supabase.from('referral_signups').select('referrer_id');
      if (!signups?.length) return;
      const counts: Record<string, number> = {};
      signups.forEach((s: any) => { counts[s.referrer_id] = (counts[s.referrer_id] || 0) + 1; });
      const topIds = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
      const { data: profiles } = await supabase
        .from('user_profiles').select('user_id, display_name, avatar_url').in('user_id', topIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      setTopReferrers(topIds.map(id => ({
        display_name: (profileMap.get(id) as any)?.display_name || null,
        avatar_url:   (profileMap.get(id) as any)?.avatar_url   || null,
        count:        counts[id],
      })));
    };
    fetchTop();
  }, []);

  // Fetch initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('waitroom_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100);
      if (data) setMessages(data as ChatMessage[]);
    };
    fetchMessages();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('waitroom-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waitroom_messages' }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessage]);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: profile?.user_id || 'anon', online_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [profile?.user_id]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !profile) return;
    setSending(true);
    try {
      await (supabase.from('waitroom_messages') as any).insert({
        user_id: profile.user_id,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        content: newMessage.trim(),
      });
      setNewMessage('');
    } catch (e: any) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const affiliateLink = referralCode
    ? `${window.location.origin}/auth?ref=${referralCode}`
    : '';

  const copyAffiliateLink = () => {
    navigator.clipboard.writeText(affiliateLink);
    toast.success('Affiliate link copied!');
  };

  const shortWallet = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">

        {/* Beta Mode Banner */}
        <AnimatePresence>
          {isBetaMode && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="mb-6 max-w-6xl mx-auto"
            >
              <div className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/10 via-orange-500/5 to-red-500/10 p-4">
                {/* Animated shimmer */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/5 to-transparent animate-[shimmer_3s_ease-in-out_infinite] pointer-events-none" />
                <div className="relative flex items-center gap-4">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                    <FlaskConical className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Lock className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-sm font-bold text-red-400 uppercase tracking-wider">Beta Access Only</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      The Lily Pad is currently in <span className="text-foreground font-semibold">private beta</span>. 
                      You're in the Wait Room — hang out, chat, and climb the leaderboard while we get everything ready.
                      You'll gain full access when beta opens! 🐸
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Left sidebar - WL Card & Affiliate */}
          <div className="lg:col-span-1 space-y-4">
            <WLCard
              displayName={profile?.display_name || shortWallet(walletAddress || '')}
              avatarUrl={profile?.avatar_url || undefined}
              affiliateLink={affiliateLink}
              referralCount={referralCount}
            />

            {/* Affiliate section */}
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-primary" /> Share & Earn
                </h3>
                <p className="text-xs text-muted-foreground">
                  Share your affiliate link and earn rewards for every friend who joins The Lily Pad!
                </p>
                {affiliateLink && (
                  <div className="flex gap-2">
                    <Input value={affiliateLink} readOnly className="text-xs" />
                    <Button size="sm" variant="outline" onClick={copyAffiliateLink}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Leaderboard Preview Card ─────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <Card className="border-yellow-500/20 bg-gradient-to-b from-yellow-500/5 to-card/80 backdrop-blur-sm overflow-hidden group cursor-pointer hover:border-yellow-500/40 transition-colors"
                onClick={() => navigate('/leaderboard')}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2 text-sm">
                      <Trophy className="w-4 h-4 text-yellow-400" />
                      Referral Leaderboard
                    </h3>
                    <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500 px-1.5 h-4">
                      LIVE
                    </Badge>
                  </div>

                  {/* Your rank chip */}
                  {referralCount > 0 && (
                    <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
                      <Star className="w-3.5 h-3.5 text-primary shrink-0" />
                      <p className="text-xs font-medium">
                        You have <span className="text-primary font-bold">{referralCount} referral{referralCount !== 1 ? 's' : ''}</span>
                      </p>
                    </div>
                  )}

                  {/* Top 3 preview */}
                  {topReferrers.length > 0 ? (
                    <div className="space-y-1.5">
                      {topReferrers.map((entry, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className={`w-5 text-center text-xs font-bold shrink-0 ${
                            i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : 'text-amber-600'
                          }`}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                          </span>
                          <Avatar className="w-5 h-5 shrink-0">
                            <AvatarImage src={entry.avatar_url || undefined} />
                            <AvatarFallback className="text-[9px] bg-primary/20">
                              {(entry.display_name || '?')[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="flex-1 text-xs truncate font-medium">
                            {entry.display_name || 'Anonymous'}
                          </span>
                          <span className="text-xs font-bold text-primary shrink-0">
                            {entry.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No entries yet — be first! 🐸
                    </p>
                  )}

                  {/* CTA */}
                  <button
                    id="waitroom-view-leaderboard"
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 hover:border-yellow-500/40 transition-all text-sm font-semibold text-yellow-500 group-hover:gap-3"
                    onClick={(e) => { e.stopPropagation(); navigate('/leaderboard'); }}
                  >
                    <Trophy className="w-4 h-4" />
                    View Full Leaderboard
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </button>
                </CardContent>
              </Card>
            </motion.div>

          </div>

          {/* Chat area */}
          <div className="lg:col-span-2">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm h-[calc(100vh-12rem)]">
              <div className="p-4 border-b border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <LilyPadLogo size={32} />
                  <div>
                    <h2 className="font-bold text-lg">The Lily Pad Wait Room</h2>
                    <p className="text-xs text-muted-foreground">Hang out while we get everything ready 🐸</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <Users className="w-4 h-4" />
                  <span>{onlineCount} online</span>
                </div>
              </div>

              <ScrollArea className="flex-1 h-[calc(100%-8rem)]">
                <div className="p-4 space-y-3">
                  {messages.length === 0 && (
                    <div className="text-center text-muted-foreground py-12">
                      <LilyPadLogo size={48} />
                      <p className="mt-4">No messages yet. Be the first to say hello! 👋</p>
                    </div>
                  )}
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-3"
                    >
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarImage src={msg.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-primary/20">
                          {msg.display_name?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-sm truncate">
                            {msg.display_name || 'Anonymous'}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/90 break-words">{msg.content}</p>
                      </div>
                    </motion.div>
                  ))}
                  <div ref={scrollRef} />
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-border/50">
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                  className="flex gap-2"
                >
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    maxLength={500}
                    disabled={sending}
                  />
                  <Button type="submit" disabled={sending || !newMessage.trim()} size="icon">
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
