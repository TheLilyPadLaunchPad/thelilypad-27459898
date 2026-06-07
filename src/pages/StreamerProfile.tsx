import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ipfsToHttp } from "@/lib/ipfs";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DonorLeaderboard } from "@/components/DonorLeaderboard";
import { TipButton } from "@/components/TipButton";
import { FollowButton } from "@/components/FollowButton";
import { ClipCreationModal } from "@/components/ClipCreationModal";
import { ClipShareMenu } from "@/components/ClipShareMenu";
import { ClipAnalytics } from "@/components/ClipAnalytics";
import { PublicBadgeShowcase } from "@/components/PublicBadgeShowcase";
import { useSEO } from "@/hooks/useSEO";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  User, ArrowLeft, Calendar, Clock, CheckCircle,
  Twitter, Youtube, MessageCircle, Instagram, Music2,
  Users, Video, Eye, Sparkles, ExternalLink, Play, ImageIcon, Scissors, Film, Pencil, Trash2, Layers
} from "lucide-react";
import { StreamerPlaylistDisplay } from "@/components/streaming/StreamerPlaylistDisplay";
import { VerifiedBadge } from "@/components/VerifiedBadge";


interface ScheduleItem {
  day: string;
  time: string;
  timezone?: string;
}

interface StreamerProfileData {
  id: string;
  user_id: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  categories: string[] | null;
  social_twitter: string | null;
  social_youtube: string | null;
  social_discord: string | null;
  social_instagram: string | null;
  social_tiktok: string | null;
  schedule: ScheduleItem[];
  is_verified: boolean;
  playlist_ids: string[] | null;
}

interface StreamerStats {
  followerCount: number;
  totalStreams: number;
  totalViews: number;
  collectionsCount: number;
  isLive: boolean;
  currentStreamTitle?: string;
}

interface RecentStream {
  id: string;
  title: string;
  category: string | null;
  thumbnail_url: string | null;
  total_views: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

interface Clip {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  clip_url: string | null;
  stream_id: string | null;
  start_time_seconds: number;
  duration_seconds: number;
  views: number;
  created_at: string;
}

interface CreatorCollection {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  status: string;
  total_supply: number;
  minted: number;
  created_at: string;
}

const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const socialConfig = {
  twitter: { icon: Twitter, label: 'Twitter', color: 'hover:text-sky-500', bgHover: 'hover:bg-sky-500/10' },
  youtube: { icon: Youtube, label: 'YouTube', color: 'hover:text-red-500', bgHover: 'hover:bg-red-500/10' },
  discord: { icon: MessageCircle, label: 'Discord', color: 'hover:text-indigo-500', bgHover: 'hover:bg-indigo-500/10' },
  instagram: { icon: Instagram, label: 'Instagram', color: 'hover:text-pink-500', bgHover: 'hover:bg-pink-500/10' },
  tiktok: { icon: Music2, label: 'TikTok', color: 'hover:text-foreground', bgHover: 'hover:bg-foreground/10' },
};

const StreamerProfile = () => {
  const { streamerId } = useParams<{ streamerId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StreamerProfileData | null>(null);
  const [stats, setStats] = useState<StreamerStats>({ followerCount: 0, totalStreams: 0, totalViews: 0, collectionsCount: 0, isLive: false });
  const [recentStreams, setRecentStreams] = useState<RecentStream[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [collections, setCollections] = useState<CreatorCollection[]>([]);
  const [showClipModal, setShowClipModal] = useState(false);
  const [editingClip, setEditingClip] = useState<Clip | null>(null);
  const [deletingClipId, setDeletingClipId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const isOwnProfile = currentUserId === streamerId;
  const { toast } = useToast();

  useSEO({
    title: profile?.display_name ? `${profile.display_name} | The Lily Pad` : "Streamer Profile | The Lily Pad",
    description: profile?.bio || "View streamer profile, clips, NFT collections, and schedule. Follow and support your favorite creators on The Lily Pad.",
    ogType: "profile",
    structuredData: profile
      ? {
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          mainEntity: {
            "@type": "Person",
            name: profile.display_name || "Creator",
            description: profile.bio || undefined,
            image: profile.avatar_url || undefined,
            url: typeof window !== "undefined" ? window.location.href : undefined,
          },
        }
      : undefined,
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (!streamerId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Fetch streamer profile from public view (excludes sensitive wallet addresses)
        const { data: profileData, error: profileError } = await supabase
          .from('streamer_profiles_public')
          .select('*')
          .eq('user_id', streamerId)
          .maybeSingle();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
        }

        // Parse schedule JSON safely
        let parsedSchedule: ScheduleItem[] = [];
        if (profileData?.schedule) {
          try {
            const rawSchedule = profileData.schedule as unknown;
            parsedSchedule = Array.isArray(rawSchedule)
              ? (rawSchedule as ScheduleItem[])
              : [];
          } catch {
            parsedSchedule = [];
          }
        }

        setProfile(profileData ? {
          ...profileData,
          schedule: parsedSchedule,
          banner_url: (profileData as any).banner_url || null,
          playlist_ids: Array.isArray((profileData as any).playlist_ids) ? (profileData as any).playlist_ids : null
        } : null);

        // Fetch follower count
        const { count: followerCount } = await supabase
          .from('followers')
          .select('*', { count: 'exact', head: true })
          .eq('streamer_id', streamerId);

        // Fetch streams with views
        const { data: streams } = await supabase
          .from('streams')
          .select('id, title, category, thumbnail_url, total_views, is_live, started_at, ended_at, duration_seconds')
          .eq('user_id', streamerId)
          .order('started_at', { ascending: false });

        const totalStreams = streams?.length || 0;
        const totalViews = streams?.reduce((sum, s) => sum + (s.total_views || 0), 0) || 0;
        const liveStream = streams?.find(s => s.is_live);

        // Get past broadcasts (not live, limit to 6)
        const pastStreams = streams?.filter(s => !s.is_live).slice(0, 6) || [];
        setRecentStreams(pastStreams);

        // Fetch clips
        const { data: clipsData } = await supabase
          .from('clips')
          .select('id, title, description, thumbnail_url, clip_url, stream_id, start_time_seconds, duration_seconds, views, created_at')
          .eq('user_id', streamerId)
          .order('created_at', { ascending: false })
          .limit(6);

        setClips(clipsData || []);

        // Fetch collections
        const { data: collectionsData, count: collectionsCount } = await supabase
          .from('collections')
          .select('id, name, description, image_url, status, total_supply, minted, created_at', { count: 'exact' })
          .eq('creator_id', streamerId)
          .order('created_at', { ascending: false })
          .limit(6);

        setCollections(collectionsData || []);

        setStats({
          followerCount: followerCount || 0,
          totalStreams,
          totalViews,
          collectionsCount: collectionsCount || 0,
          isLive: !!liveStream,
          currentStreamTitle: liveStream?.title
        });
      } catch (error) {
        console.error('Error fetching streamer profile data:', error);
      } finally {
        setLoading(false);
      }
    };

    const checkCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };

    fetchProfile();
    checkCurrentUser();
  }, [streamerId]);

  // Parallax scroll effect — uses framer-motion for GPU-accelerated transforms
  const { scrollYProgress } = useScroll({
    target: bannerRef,
    offset: ['start start', 'end start'],
  });
  const bannerScale = useTransform(scrollYProgress, [0, 1], [1.05, 1.15]);
  const bannerY = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);

  const handleClipCreated = () => {
    // Refetch clips
    if (streamerId) {
      supabase
        .from('clips')
        .select('id, title, description, thumbnail_url, clip_url, stream_id, start_time_seconds, duration_seconds, views, created_at')
        .eq('user_id', streamerId)
        .order('created_at', { ascending: false })
        .limit(6)
        .then(({ data }) => setClips(data || []));
    }
  };

  const handleEditClip = (clip: Clip) => {
    setEditingClip(clip);
    setShowClipModal(true);
  };

  const handleDeleteClip = async (clipId: string) => {
    setDeletingClipId(clipId);
    try {
      const { error } = await supabase.from('clips').delete().eq('id', clipId);
      if (error) throw error;

      setClips(prev => prev.filter(c => c.id !== clipId));
      toast({
        title: "Clip deleted",
        description: "The clip has been removed.",
      });
    } catch (error) {
      console.error("Error deleting clip:", error);
      toast({
        title: "Error",
        description: "Failed to delete clip. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingClipId(null);
    }
  };

  const handleCloseClipModal = () => {
    setShowClipModal(false);
    setEditingClip(null);
  };

  const socialLinks = [
    { key: 'twitter' as const, url: profile?.social_twitter },
    { key: 'youtube' as const, url: profile?.social_youtube },
    { key: 'discord' as const, url: profile?.social_discord },
    { key: 'instagram' as const, url: profile?.social_instagram },
    { key: 'tiktok' as const, url: profile?.social_tiktok },
  ].filter(link => link.url);

  const statItems = [
    { icon: Users, label: 'Followers', value: stats.followerCount, color: 'text-primary' },
    { icon: Video, label: 'Streams', value: stats.totalStreams, color: 'text-blue-500' },
    { icon: Eye, label: 'Total Views', value: stats.totalViews, color: 'text-emerald-500' },
    { icon: Layers, label: 'Collections', value: stats.collectionsCount, color: 'text-purple-500' },
  ];

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="max-w-5xl mx-auto space-y-6">
            <Skeleton className="h-80 w-full rounded-2xl" />
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
            <div className="grid lg:grid-cols-3 gap-6">
              <Skeleton className="h-64 rounded-xl lg:col-span-2" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Back Button */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Button
              variant="ghost"
              onClick={() => navigate(-1)}
              className="gap-2 hover:bg-muted/50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </motion.div>

          {/* Hero Profile Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-0 bg-gradient-to-br from-primary/10 via-card to-card overflow-hidden relative">
              {/* Banner Image with Parallax (framer-motion GPU-accelerated) */}
              {profile?.banner_url ? (
                <div ref={bannerRef} className="relative h-48 md:h-64 w-full overflow-hidden">
                  {!bannerLoaded && (
                    <Skeleton className="absolute inset-0 w-full h-full" />
                  )}
                  <motion.img
                    src={ipfsToHttp(profile.banner_url)}
                    alt="Profile banner"
                    className={`w-full h-[120%] object-cover transition-opacity duration-300 ${bannerLoaded ? 'opacity-100' : 'opacity-0'}`}
                    style={{
                      scale: bannerScale,
                      y: bannerY,
                    }}
                    onLoad={() => setBannerLoaded(true)}
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/placeholder.svg'; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                </div>
              ) : (
                <>
                  {/* Decorative elements (fallback when no banner) */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
                </>
              )}

              <CardContent className={`p-8 md:p-10 relative ${profile?.banner_url ? '-mt-20 md:-mt-28' : ''}`}>
                <div className="flex flex-col lg:flex-row items-center gap-8">
                  {/* Avatar Section */}
                  <div className="relative flex-shrink-0">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/50 rounded-full blur-xl opacity-30 scale-110" />
                      <Avatar className="h-36 w-36 border-4 border-background shadow-2xl relative">
                        {profile?.avatar_url ? (
                          <AvatarImage src={ipfsToHttp(profile.avatar_url)} alt={profile.display_name || 'Streamer'} className="object-cover" />
                        ) : (
                          <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-4xl font-bold">
                            <User className="h-16 w-16" />
                          </AvatarFallback>
                        )}
                      </Avatar>
                    </div>
                    {stats.isLive && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -bottom-2 left-1/2 -translate-x-1/2"
                      >
                        <Badge className="bg-red-500 text-white px-4 py-1 text-sm font-semibold shadow-lg animate-pulse">
                          <span className="w-2 h-2 bg-white rounded-full mr-2 inline-block animate-pulse" />
                          LIVE NOW
                        </Badge>
                      </motion.div>
                    )}
                  </div>

                  {/* Profile Info */}
                  <div className="flex-1 text-center lg:text-left">
                    <div className="flex items-center justify-center lg:justify-start gap-3 mb-3 flex-wrap">
                      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                        {profile?.display_name || streamerId?.slice(0, 8) || 'Unknown Streamer'}
                      </h1>
                      {profile?.is_verified && (
                        <VerifiedBadge size={24} />
                      )}
                      {streamerId && (
                        <PublicBadgeShowcase userId={streamerId} compact />
                      )}
                    </div>

                    {profile?.bio && (
                      <p className="text-muted-foreground text-lg max-w-2xl mb-4 leading-relaxed">
                        {profile.bio}
                      </p>
                    )}

                    {/* Categories */}
                    {profile?.categories && profile.categories.length > 0 && (
                      <div className="flex items-center justify-center lg:justify-start gap-2 mb-5 flex-wrap">
                        {profile.categories.map((category, idx) => (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="bg-muted/50 hover:bg-muted transition-colors"
                          >
                            <Sparkles className="h-3 w-3 mr-1" />
                            {category}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Social Links */}
                    {socialLinks.length > 0 && (
                      <div className="flex items-center justify-center lg:justify-start gap-2 mb-6">
                        {socialLinks.map((link) => {
                          const config = socialConfig[link.key];
                          const Icon = config.icon;
                          return (
                            <a
                              key={link.key}
                              href={link.url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`p-3 rounded-xl bg-muted/30 border border-border/50 transition-all duration-200 ${config.color} ${config.bgHover} hover:scale-105 hover:shadow-lg group`}
                              title={config.label}
                            >
                              <Icon className="h-5 w-5" />
                            </a>
                          );
                        })}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center justify-center lg:justify-start gap-3">
                      {streamerId && (
                        <FollowButton
                          streamerId={streamerId}
                          onFollowChange={(following) => {
                            setStats(prev => ({
                              ...prev,
                              followerCount: following ? prev.followerCount + 1 : prev.followerCount - 1
                            }));
                          }}
                        />
                      )}
                      {streamerId && (
                        <TipButton
                          streamerId={streamerId}
                          streamerName={profile?.display_name || 'Streamer'}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Stats Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            {statItems.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.05 }}
                >
                  <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 group">
                    <CardContent className="p-4 md:p-6 text-center">
                      <div className={`inline-flex p-3 rounded-xl bg-muted/50 ${stat.color} mb-3 group-hover:scale-110 transition-transform`}>
                        <Icon className="h-5 w-5 md:h-6 md:w-6" />
                      </div>
                      <p className="text-2xl md:text-3xl font-bold mb-1">{formatNumber(stat.value)}</p>
                      <p className="text-xs md:text-sm text-muted-foreground">{stat.label}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Challenge Badges Section */}
          {streamerId && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <PublicBadgeShowcase
                userId={streamerId}
                displayName={profile?.display_name || undefined}
              />
            </motion.div>
          )}

          {/* Music Playlists */}
          {profile?.playlist_ids && profile.playlist_ids.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.27 }}
            >
              <StreamerPlaylistDisplay playlistIds={profile.playlist_ids} />
            </motion.div>
          )}

          {/* Live Stream Banner */}
          {stats.isLive && stats.currentStreamTitle && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="border-red-500/30 bg-gradient-to-r from-red-500/10 via-card to-card overflow-hidden">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-full bg-red-500/20 animate-pulse">
                        <Video className="h-6 w-6 text-red-500" />
                      </div>
                      <div>
                        <p className="text-sm text-red-400 font-medium mb-1">Currently Streaming</p>
                        <p className="text-lg font-semibold">{stats.currentStreamTitle}</p>
                      </div>
                    </div>
                    <Link to="/streams">
                      <Button variant="outline" className="border-red-500/30 hover:bg-red-500/10">
                        Watch Now
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* NFT Collections Section */}
          {(collections.length > 0 || isOwnProfile) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 }}
            >
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Layers className="h-5 w-5 text-purple-500" />
                    NFT Collections
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {stats.collectionsCount > 6 && (
                      <Link to={`/streamer/${streamerId}/collections`}>
                        <Button size="sm" variant="ghost" className="text-purple-500 hover:text-purple-400">
                          View All ({stats.collectionsCount})
                        </Button>
                      </Link>
                    )}
                    {isOwnProfile && (
                      <Link to="/launchpad">
                        <Button size="sm" variant="outline" className="gap-2">
                          <Layers className="h-4 w-4" />
                          Create Collection
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {collections.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {collections.map((collection, index) => {
                        const mintProgress = collection.total_supply > 0
                          ? (collection.minted / collection.total_supply) * 100
                          : 0;
                        const statusConfig = {
                          live: { label: 'LIVE', bg: 'bg-green-500', text: 'text-white' },
                          upcoming: { label: 'UPCOMING', bg: 'bg-yellow-500', text: 'text-black' },
                          ended: { label: 'ENDED', bg: 'bg-muted', text: 'text-muted-foreground' },
                        };
                        const status = statusConfig[collection.status as keyof typeof statusConfig] || statusConfig.upcoming;

                        return (
                          <motion.div
                            key={collection.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.35 + index * 0.05 }}
                          >
                            <Link to={`/collection/${collection.id}`}>
                              <Card className="overflow-hidden border-border/50 hover:border-purple-500/50 transition-all duration-300 group cursor-pointer hover:shadow-lg hover:shadow-purple-500/10">
                                {/* Collection Image */}
                                <div className="relative aspect-[16/9] overflow-hidden bg-muted/50">
                                  {collection.image_url ? (
                                    <img
                                      src={ipfsToHttp(collection.image_url)}
                                      alt={collection.name}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                      onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/placeholder.svg'; }}
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-primary/10">
                                      <Layers className="h-12 w-12 text-purple-500/50" />
                                    </div>
                                  )}

                                  {/* Status Badge */}
                                  <div className="absolute top-2 right-2">
                                    <Badge className={`${status.bg} ${status.text} text-xs font-semibold px-2 py-0.5`}>
                                      {status.label}
                                    </Badge>
                                  </div>
                                </div>

                                {/* Collection Info */}
                                <CardContent className="p-4">
                                  <h3 className="font-semibold text-base mb-2 line-clamp-1 group-hover:text-purple-500 transition-colors">
                                    {collection.name}
                                  </h3>

                                  {/* Mint Progress */}
                                  <div className="space-y-2">
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-purple-500 to-primary rounded-full transition-all duration-500"
                                        style={{ width: `${mintProgress}%` }}
                                      />
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                      <span>{collection.minted} / {collection.total_supply} minted</span>
                                      <span>{mintProgress.toFixed(0)}%</span>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            </Link>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <div className="p-4 rounded-full bg-purple-500/10 w-fit mx-auto mb-4">
                        <Layers className="h-10 w-10 text-purple-500/50" />
                      </div>
                      <p className="font-medium mb-1">No collections yet</p>
                      <p className="text-sm mb-4">Launch your first NFT collection!</p>
                      {isOwnProfile && (
                        <Link to="/launchpad">
                          <Button variant="outline" className="gap-2">
                            <Layers className="h-4 w-4" />
                            Create Collection
                          </Button>
                        </Link>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Schedule */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="lg:col-span-2"
            >
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Calendar className="h-5 w-5 text-primary" />
                    Streaming Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {profile?.schedule && profile.schedule.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {profile.schedule
                        .sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day))
                        .map((item, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.4 + index * 0.05 }}
                            className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
                          >
                            <div className="p-2.5 rounded-xl bg-primary/10">
                              <Clock className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold">{item.day}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.time} {item.timezone && <span className="text-xs opacity-70">({item.timezone})</span>}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <div className="p-4 rounded-full bg-muted/30 w-fit mx-auto mb-4">
                        <Calendar className="h-10 w-10 opacity-50" />
                      </div>
                      <p className="font-medium mb-1">No schedule set</p>
                      <p className="text-sm">Check back later for streaming times!</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Top Supporters */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <DonorLeaderboard
                streamerId={streamerId}
                limit={5}
                title="Top Supporters"
              />
            </motion.div>
          </div>

          {/* Recent Streams */}
          {recentStreams.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Play className="h-5 w-5 text-primary" />
                    Recent Broadcasts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recentStreams.map((stream, index) => (
                      <motion.div
                        key={stream.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + index * 0.05 }}
                        className="group"
                      >
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-muted/50 border border-border/50">
                          {stream.thumbnail_url ? (
                            <img
                              src={ipfsToHttp(stream.thumbnail_url)}
                              alt={stream.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/placeholder.svg'; }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted/50 to-muted">
                              <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
                            </div>
                          )}

                          {/* Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                          {/* Duration badge */}
                          {stream.duration_seconds && (
                            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-xs font-medium">
                              {formatDuration(stream.duration_seconds)}
                            </div>
                          )}

                          {/* Play icon overlay */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="p-3 rounded-full bg-primary/90 text-primary-foreground">
                              <Play className="h-6 w-6 fill-current" />
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 space-y-1">
                          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                            {stream.title}
                          </h3>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {formatNumber(stream.total_views)} views
                            </span>
                            <span>{formatDate(stream.started_at)}</span>
                          </div>
                          {stream.category && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              {stream.category}
                            </Badge>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Clips/Highlights */}
          {(clips.length > 0 || isOwnProfile) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Scissors className="h-5 w-5 text-primary" />
                    Highlights & Clips
                  </CardTitle>
                  {isOwnProfile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowClipModal(true)}
                      className="gap-2"
                    >
                      <Scissors className="h-4 w-4" />
                      Create Clip
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {clips.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {clips.map((clip, index) => (
                        <motion.div
                          key={clip.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.55 + index * 0.05 }}
                          className="group relative"
                        >
                          <a
                            href={clip.clip_url || '#'}
                            target={clip.clip_url ? "_blank" : undefined}
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <div className="relative aspect-video rounded-xl overflow-hidden bg-muted/50 border border-border/50">
                              {clip.thumbnail_url ? (
                                <img
                                  src={ipfsToHttp(clip.thumbnail_url)}
                                  alt={clip.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/placeholder.svg'; }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-muted">
                                  <Film className="h-10 w-10 text-primary/50" />
                                </div>
                              )}

                              {/* Gradient overlay */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                              {/* Duration badge */}
                              <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-primary/90 text-primary-foreground text-xs font-medium">
                                {formatDuration(clip.duration_seconds)}
                              </div>

                              {/* Clip icon badge */}
                              <div className="absolute top-2 left-2 p-1.5 rounded-lg bg-black/50 backdrop-blur-sm">
                                <Scissors className="h-3.5 w-3.5 text-white" />
                              </div>

                              {/* Play icon overlay */}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="p-3 rounded-full bg-primary/90 text-primary-foreground shadow-lg">
                                  <Play className="h-6 w-6 fill-current" />
                                </div>
                              </div>
                            </div>
                          </a>

                          <div className="mt-3 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors flex-1">
                                {clip.title}
                              </h3>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ClipShareMenu
                                  clipId={clip.id}
                                  clipTitle={clip.title}
                                  clipUrl={clip.clip_url}
                                  streamerName={profile?.display_name || undefined}
                                />
                                {isOwnProfile && (
                                  <>
                                    <ClipAnalytics
                                      clipId={clip.id}
                                      clipTitle={clip.title}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        handleEditClip(clip);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        handleDeleteClip(clip.id);
                                      }}
                                      disabled={deletingClipId === clip.id}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                            {clip.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {clip.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {formatNumber(clip.views)} views
                              </span>
                              <span>{formatDate(clip.created_at)}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <div className="p-4 rounded-full bg-muted/30 w-fit mx-auto mb-4">
                        <Scissors className="h-10 w-10 opacity-50" />
                      </div>
                      <p className="font-medium mb-1">No clips yet</p>
                      <p className="text-sm mb-4">Create highlights from your past broadcasts!</p>
                      {isOwnProfile && (
                        <Button
                          variant="outline"
                          onClick={() => setShowClipModal(true)}
                          className="gap-2"
                        >
                          <Scissors className="h-4 w-4" />
                          Create Your First Clip
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </main>

      {/* Clip Creation/Edit Modal */}
      {streamerId && (
        <ClipCreationModal
          open={showClipModal}
          onOpenChange={handleCloseClipModal}
          userId={streamerId}
          onClipCreated={handleClipCreated}
          editingClip={editingClip}
        />
      )}
    </div>
  );
};

export default StreamerProfile;
