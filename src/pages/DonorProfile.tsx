import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSEO } from "@/hooks/useSEO";
import {
  Crown, Gem, Shield, Star, Heart, Gift,
  TrendingUp, Calendar, User, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ProfileSocialHeader } from "@/components/social/ProfileSocialHeader";
import { ActivityFeed } from "@/components/social/ActivityFeed";

type DonorTier = 'platinum' | 'gold' | 'silver' | 'bronze' | null;

interface DonationRecord {
  id: string;
  amount: number;
  message: string | null;
  created_at: string;
  streamer_id: string;
}

interface FavoriteStreamer {
  streamer_id: string;
  total_donated: number;
  donation_count: number;
}

const getTierFromAmount = (amount: number): DonorTier => {
  if (amount >= 10) return 'platinum';
  if (amount >= 5) return 'gold';
  if (amount >= 1) return 'silver';
  if (amount >= 0.1) return 'bronze';
  return null;
};

const tierConfig: Record<NonNullable<DonorTier>, {
  label: string;
  icon: typeof Crown;
  className: string;
  minAmount: number;
  description: string;
}> = {
  platinum: {
    label: 'Platinum',
    icon: Crown,
    className: 'bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0',
    minAmount: 10,
    description: 'Elite supporter status'
  },
  gold: {
    label: 'Gold',
    icon: Gem,
    className: 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-0',
    minAmount: 5,
    description: 'Premium supporter'
  },
  silver: {
    label: 'Silver',
    icon: Shield,
    className: 'bg-gradient-to-r from-gray-400 to-slate-500 text-white border-0',
    minAmount: 1,
    description: 'Dedicated supporter'
  },
  bronze: {
    label: 'Bronze',
    icon: Star,
    className: 'bg-gradient-to-r from-amber-700 to-orange-700 text-white border-0',
    minAmount: 0.1,
    description: 'Rising supporter'
  }
};

const allTiers: NonNullable<DonorTier>[] = ['bronze', 'silver', 'gold', 'platinum'];

const DonorProfile = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [favoriteStreamers, setFavoriteStreamers] = useState<FavoriteStreamer[]>([]);
  const [totalDonated, setTotalDonated] = useState(0);
  const [currentTier, setCurrentTier] = useState<DonorTier>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useSEO({
    title: "Donor Profile | The Lily Pad",
    description: "View your donation history, supporter tier, and favorite streamers. Track your contributions to the Lily Pad community."
  });

  useEffect(() => {
    const fetchDonorData = async () => {
      setLoading(true);

      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        setLoading(false);
        return;
      }

      const userId = session.user.id;
      setUserId(userId);
      setWalletAddress(session.user.email?.split('@')[0] || userId.slice(0, 8));

      // Fetch donations made by this user
      const { data: earningsData, error } = await supabase
        .from('earnings')
        .select('id, amount, message, created_at, user_id')
        .eq('from_user_id', userId)
        .eq('type', 'tip')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching donations:', error);
        setLoading(false);
        return;
      }

      const donationRecords: DonationRecord[] = (earningsData || []).map(e => ({
        id: e.id,
        amount: Number(e.amount),
        message: e.message,
        created_at: e.created_at,
        streamer_id: e.user_id
      }));

      setDonations(donationRecords);

      // Calculate total donated
      const total = donationRecords.reduce((sum, d) => sum + d.amount, 0);
      setTotalDonated(total);
      setCurrentTier(getTierFromAmount(total));

      // Calculate favorite streamers
      const streamerMap = new Map<string, FavoriteStreamer>();
      donationRecords.forEach(d => {
        const existing = streamerMap.get(d.streamer_id);
        if (existing) {
          existing.total_donated += d.amount;
          existing.donation_count += 1;
        } else {
          streamerMap.set(d.streamer_id, {
            streamer_id: d.streamer_id,
            total_donated: d.amount,
            donation_count: 1
          });
        }
      });

      const sortedStreamers = Array.from(streamerMap.values())
        .sort((a, b) => b.total_donated - a.total_donated)
        .slice(0, 5);

      setFavoriteStreamers(sortedStreamers);
      setLoading(false);
    };

    fetchDonorData();
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="max-w-4xl mx-auto space-y-6">
            <Skeleton className="h-48 w-full rounded-xl" />
            <div className="grid md:grid-cols-2 gap-6">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
            <Skeleton className="h-96 rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Back Button */}
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          {/* Profile Header */}
          <Card className="border-border/50 bg-gradient-to-br from-card via-card to-primary/5 overflow-hidden">
            <CardContent className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <Avatar className={`h-24 w-24 border-4 ${currentTier ? 'border-primary' : 'border-border'}`}>
                  <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold">
                    <User className="h-10 w-10" />
                  </AvatarFallback>
                </Avatar>
                <div className="text-center md:text-left flex-1">
                  <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                    <h1 className="text-2xl md:text-3xl font-bold">
                      {walletAddress || 'Anonymous Donor'}
                    </h1>
                    {currentTier && (
                      <Badge className={`text-sm px-3 py-1 ${tierConfig[currentTier].className}`}>
                        {(() => {
                          const TierIcon = tierConfig[currentTier].icon;
                          return <TierIcon className="h-4 w-4 mr-1.5" />;
                        })()}
                        {tierConfig[currentTier].label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground">
                    {currentTier ? tierConfig[currentTier].description : 'Start donating to earn badges!'}
                  </p>
                  {userId && <ProfileSocialHeader targetUserId={userId} className="mt-3 justify-center md:justify-start" showFollowButton={false} />}
                </div>
                <div className="text-center md:text-right">
                  <p className="text-sm text-muted-foreground">Total Donated</p>
                  <p className="text-3xl font-bold text-primary">{totalDonated.toFixed(4)} SOL</p>
                  <p className="text-sm text-muted-foreground">{donations.length} donations</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Badges Earned */}
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-primary" />
                  Badges Earned
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {allTiers.map((tier) => {
                  const config = tierConfig[tier];
                  const TierIcon = config.icon;
                  const isEarned = currentTier && allTiers.indexOf(currentTier) >= allTiers.indexOf(tier);

                  return (
                    <div
                      key={tier}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${isEarned
                          ? 'bg-primary/5 border-primary/20'
                          : 'bg-muted/30 border-border/50 opacity-50'
                        }`}
                    >
                      <div className={`p-2 rounded-full ${isEarned ? config.className : 'bg-muted text-muted-foreground'}`}>
                        <TierIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium ${isEarned ? '' : 'text-muted-foreground'}`}>
                          {config.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {config.minAmount}+ SOL total
                        </p>
                      </div>
                      {isEarned && (
                        <Badge variant="outline" className="text-primary border-primary/30">
                          Earned
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Favorite Streamers */}
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" />
                  Favorite Streamers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {favoriteStreamers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Heart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No donations yet</p>
                    <p className="text-sm">Support streamers to see them here!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {favoriteStreamers.map((streamer, index) => (
                      <div
                        key={streamer.streamer_id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/20"
                      >
                        <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-muted-foreground">
                          #{index + 1}
                        </span>
                        <Avatar className="h-10 w-10 border border-border">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm">
                            {streamer.streamer_id.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">
                            {streamer.streamer_id.slice(0, 8)}...
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {streamer.donation_count} tips
                          </p>
                        </div>
                        <p className="font-bold text-primary text-sm">
                          {streamer.total_donated.toFixed(4)} SOL
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Donation History */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Donation History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {donations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Gift className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">No donations yet</p>
                  <p className="text-sm">Start supporting your favorite streamers!</p>
                  <Button
                    className="mt-4"
                    onClick={() => navigate('/streams')}
                  >
                    Browse Streams
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {donations.map((donation) => (
                    <div
                      key={donation.id}
                      className="flex items-start gap-4 p-4 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div className="p-2 rounded-full bg-primary/10">
                        <Gift className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-medium">
                            Donated to {donation.streamer_id.slice(0, 8)}...
                          </p>
                          <p className="font-bold text-primary whitespace-nowrap">
                            {donation.amount.toFixed(4)} SOL
                          </p>
                        </div>
                        {donation.message && (
                          <p className="text-sm text-muted-foreground italic mb-1">
                            "{donation.message}"
                          </p>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(donation.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default DonorProfile;
