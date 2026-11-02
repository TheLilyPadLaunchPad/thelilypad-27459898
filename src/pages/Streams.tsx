// ============= Full file contents =============

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TipButton } from "@/components/TipButton";
import { FollowButton } from "@/components/FollowButton";
import { DonorLeaderboard } from "@/components/DonorLeaderboard";
import { LiveStreamCard } from "@/components/LiveStreamCard";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveStreamKind,
  streamPlaybackId,
  streamWatchUrl,
  youtubeWatchUrl,
} from "@/lib/streamPlayback";
import {
  countStreamsByStatus,
  filterStreamsByStatus,
  resolveStreamStatus,
  sortStreamsByStatus,
  STREAM_FILTERS,
  type StreamFilter,
} from "@/lib/streamStatus";
import { useSEO } from "@/hooks/useSEO";
import { useQuery } from "@tanstack/react-query";
import {
  Play,
  Users,
  MessageCircle,
  Radio,
  Search,
  Zap,
  Clock,
  RefreshCw,
  Eye,
} from "lucide-react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

interface StreamWithProfile {
  id: string;
  title: string;
  category: string | null;
  is_live: boolean;
  total_views: number;
  peak_viewers: number;
  started_at: string;
  ended_at: string | null;
  scheduled_at: string | null;
  user_id: string;
  stream_key_id: string | null;
  youtube_video_id: string | null;
  thumbnail_url: string | null;
}

interface StreamerProfile {
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  user_id: string;
}

const categories = ["All", "Gaming", "Art", "Music", "Just Chatting", "NFTs", "DeFi", "Crypto News"];

/** Copy shown above the grid, and when that grid turns out to be empty. */
const FILTER_COPY: Record<StreamFilter, { heading: string; blurb: string; empty: string; hint: string }> = {
  all: {
    heading: "All Streams",
    blurb: "Live now, coming up, and recently finished.",
    empty: "No streams yet",
    hint: "Check back later or start your own stream!",
  },
  live: {
    heading: "Live Now",
    blurb: "Streams happening right this minute.",
    empty: "No live streams right now",
    hint: "Check back later or start your own stream!",
  },
  scheduled: {
    heading: "Scheduled",
    blurb: "Streams creators have announced but not started yet.",
    empty: "Nothing scheduled right now",
    hint: "Announce your next stream and viewers can see it here.",
  },
  finished: {
    heading: "Finished",
    blurb: "Streams that have ended. Recordings open when the creator left one behind.",
    empty: "No finished streams yet",
    hint: "Past streams will collect here once creators sign off.",
  },
};

const Streams: React.FC = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [statusFilter, setStatusFilter] = useState<StreamFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useSEO({
    title: "Live Streams | The Lily Pad",
    description:
      "Watch live NFT minting events, art creation, auctions, and community streams. Join the action and support your favorite creators on Solana."
  });

  // Fetch streams from database
  const { data: dbStreams, isLoading: isLoadingDb, refetch } = useQuery({
    queryKey: ['live-streams', selectedCategory],
    queryFn: async () => {
      let query = supabase
        .from('streams')
        .select('*')
        .order('is_live', { ascending: false })
        .order('started_at', { ascending: false });

      if (selectedCategory !== 'All') {
        query = query.eq('category', selectedCategory);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as StreamWithProfile[];
    },
  });

  // Fetch streamer profiles separately
  const { data: profiles } = useQuery({
    queryKey: ['streamer-profiles', dbStreams?.map(s => s.user_id)],
    queryFn: async () => {
      if (!dbStreams || dbStreams.length === 0) return [];
      const userIds = [...new Set(dbStreams.map(s => s.user_id))];
      const { data, error } = await supabase
        .from('streamer_profiles_public')
        .select('user_id, display_name, avatar_url, is_verified')
        .in('user_id', userIds);
      if (error) throw error;
      return data as StreamerProfile[];
    },
    enabled: !!dbStreams && dbStreams.length > 0,
  });

  // Real-time subscription for stream updates
  useEffect(() => {
    const channel = supabase
      .channel('streams-realtime-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'streams',
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  // Helper to get profile for a stream
  const getProfile = (userId: string) => profiles?.find(p => p.user_id === userId);

  // Search narrows the rows that the status filter and the counts work from.
  const filteredStreams = React.useMemo(() => {
    const rows = dbStreams ?? [];
    if (!searchQuery) return rows;
    const query = searchQuery.toLowerCase();
    return rows.filter(stream => {
      const profile = getProfile(stream.user_id);
      return (
        stream.title.toLowerCase().includes(query) ||
        stream.category?.toLowerCase().includes(query) ||
        profile?.display_name?.toLowerCase().includes(query)
      );
    });
  }, [dbStreams, searchQuery, profiles]);

  const statusCounts = countStreamsByStatus(filteredStreams);
  const visibleStreams = sortStreamsByStatus(filterStreamsByStatus(filteredStreams, statusFilter));
  const liveStreams = filterStreamsByStatus(filteredStreams, 'live');
  const featuredStream = liveStreams[0];
  const featuredProfile = featuredStream ? getProfile(featuredStream.user_id) : null;
  const isLoadingStreams = isLoadingDb;

  // The featured live showcase only belongs to the "everything" and "live" views.
  const showFeatured = statusFilter === 'all' || statusFilter === 'live';
  const copy = FILTER_COPY[statusFilter];

  const replayUrlFor = (stream: StreamWithProfile) =>
    resolveStreamStatus(stream) === 'finished' && resolveStreamKind(stream) === 'youtube' && stream.youtube_video_id
      ? youtubeWatchUrl(stream.youtube_video_id)
      : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <h1 className="sr-only">Live Creator Streams on The Lily Pad</h1>

      {/* Hero / Featured Stream */}
      {showFeatured ? (
        <section className="pt-24 pb-8 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto">
            {featuredStream ? (
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Main Featured Stream */}
                <div className="lg:col-span-2">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative rounded-2xl overflow-hidden group cursor-pointer"
                    onClick={() => navigate(streamWatchUrl(featuredStream))}
                  >
                    <div className="aspect-video relative bg-muted">
                      {featuredStream.thumbnail_url ? (
                        <img
                          src={featuredStream.thumbnail_url}
                          alt={featuredStream.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                          <Radio className="w-16 h-16 text-primary/50" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                      {/* Live Badge */}
                      <div className="absolute top-4 left-4 flex items-center gap-2">
                        <Badge className="bg-red-500 text-white animate-live-pulse flex items-center gap-1">
                          <Radio className="w-3 h-3" />
                          LIVE
                        </Badge>
                        <Badge variant="secondary" className="bg-black/50 backdrop-blur-sm">
                          <Users className="w-3 h-3 mr-1" />
                          {featuredStream.peak_viewers.toLocaleString()}
                        </Badge>
                      </div>

                      {/* Play Button Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-20 h-20 bg-primary/90 rounded-full flex items-center justify-center shadow-glow">
                          <Play className="w-8 h-8 text-primary-foreground ml-1" />
                        </div>
                      </div>

                      {/* Stream Info */}
                      <div className="absolute bottom-0 left-0 right-0 p-6">
                        <div className="flex items-center gap-3 mb-3">
                          {featuredProfile?.avatar_url ? (
                            <img
                              src={featuredProfile.avatar_url}
                              alt={featuredProfile.display_name || 'Streamer'}
                              className="w-10 h-10 rounded-full border-2 border-primary object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary">
                              <span className="text-sm font-medium">
                                {featuredProfile?.display_name?.[0]?.toUpperCase() || '?'}
                              </span>
                            </div>
                          )}
                          <div>
                            <p className="text-white font-semibold">{featuredProfile?.display_name || 'Anonymous'}</p>
                            <p className="text-white/70 text-sm">{featuredStream.category || 'Streaming'}</p>
                          </div>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-4">{featuredStream.title}</h2>
                        <div className="flex items-center gap-4">
                          <Button className="bg-primary hover:bg-primary/90 shadow-glow">
                            <Play className="w-4 h-4 mr-2" />
                            Watch Now
                          </Button>
                          <TipButton
                            streamerId={featuredStream.user_id}
                            streamerName={featuredProfile?.display_name || 'Streamer'}
                            streamId={featuredStream.id}
                            variant="outline"
                            className="border-white/30 text-white hover:bg-white/10"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Sidebar - Stream Info & Leaderboard */}
                <div className="space-y-4">
                  {/* Stream Stats */}
                  <div className="bg-card rounded-xl p-5 border border-border">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" />
                      Live Stats
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <p className="text-2xl font-bold text-primary">{featuredStream.peak_viewers.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Peak Viewers</p>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <p className="text-2xl font-bold text-accent">{featuredStream.total_views.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Total Views</p>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-lg col-span-2">
                        <p className="text-lg font-medium text-muted-foreground">
                          Started {formatDistanceToNow(new Date(featuredStream.started_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Donor Leaderboard */}
                  <DonorLeaderboard
                    streamerId={featuredStream.user_id}
                    limit={5}
                    title="Top Supporters"
                  />

                  {/* Quick Actions */}
                  <div className="bg-card rounded-xl p-5 border border-border">
                    <h3 className="font-semibold mb-4">Quick Actions</h3>
                    <div className="flex flex-col gap-2">
                      <FollowButton streamerId={featuredStream.user_id} />
                      <Button variant="outline" className="justify-start" onClick={() => navigate(streamWatchUrl(featuredStream))}>
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Join Chat
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* No Featured Stream - Show CTA */
              <div className="text-center py-16 bg-card rounded-2xl border border-border">
                <Radio className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-2xl font-bold mb-2">No Live Streams</h2>
                <p className="text-muted-foreground mb-6">Be the first to go live and start streaming!</p>
                <Button onClick={() => navigate('/go-live')} size="lg">
                  <Play className="w-4 h-4 mr-2" />
                  Go Live
                </Button>
              </div>
            )}
          </div>
        </section>
      ) : (
        /* Scheduled / Finished views open with their own heading. */
        <section className="pt-24 pb-4 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              {statusFilter === 'scheduled'
                ? <Clock className="w-6 h-6 text-amber-500" />
                : <Eye className="w-6 h-6 text-muted-foreground" />}
              {copy.heading}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">{copy.blurb}</p>
          </div>
        </section>
      )}

      {/* Status & Category Filters */}
      <section className="px-6 pb-6">
        <div className="container mx-auto">
          <div
            role="group"
            aria-label="Filter streams by status"
            className="flex flex-wrap items-center gap-2 mb-4"
          >
            {STREAM_FILTERS.map((filter) => (
              <Button
                key={filter.key}
                variant={statusFilter === filter.key ? "default" : "outline"}
                size="sm"
                aria-pressed={statusFilter === filter.key}
                onClick={() => setStatusFilter(filter.key)}
                className="whitespace-nowrap gap-2"
              >
                {filter.key === 'live' && <Radio className="w-3 h-3" />}
                {filter.key === 'scheduled' && <Clock className="w-3 h-3" />}
                {filter.key === 'finished' && <Eye className="w-3 h-3" />}
                {filter.label}
                <span className="text-xs opacity-70">{statusCounts[filter.key]}</span>
              </Button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className="whitespace-nowrap"
                >
                  {category}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search streams..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                disabled={isLoadingStreams}
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingStreams ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Stream Grid */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              {statusFilter === 'scheduled'
                ? <Clock className="w-5 h-5 text-amber-500" />
                : statusFilter === 'finished'
                  ? <Eye className="w-5 h-5 text-muted-foreground" />
                  : <Radio className="w-5 h-5 text-red-500 animate-pulse" />}
              {copy.heading} ({statusCounts[statusFilter]})
            </h3>
          </div>
          <p className="text-sm text-muted-foreground -mt-3 mb-4">{copy.blurb}</p>

          {isLoadingStreams ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-video w-full" />
                  <CardContent className="p-4 space-y-3">
                    <div className="flex gap-3">
                      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : visibleStreams.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              {visibleStreams.map((stream) => {
                const profile = getProfile(stream.user_id);
                return (
                  <LiveStreamCard
                    key={stream.id}
                    id={stream.id}
                    playbackId={streamPlaybackId(stream)}
                    name={stream.title}
                    isActive={stream.is_live}
                    status={resolveStreamStatus(stream)}
                    scheduledAt={stream.scheduled_at}
                    endedAt={stream.ended_at}
                    replayUrl={replayUrlFor(stream)}
                    creatorName={profile?.display_name || 'Anonymous'}
                    creatorAvatar={profile?.avatar_url || undefined}
                    viewerCount={stream.is_live ? stream.peak_viewers : stream.total_views}
                    thumbnailUrl={stream.thumbnail_url || undefined}
                    category={stream.category || undefined}
                    streamType={resolveStreamKind(stream)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 mb-10 bg-muted/50 rounded-xl border border-border">
              {statusFilter === 'scheduled'
                ? <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                : statusFilter === 'finished'
                  ? <Eye className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  : <Radio className="w-12 h-12 mx-auto text-muted-foreground mb-4" />}
              <p className="text-muted-foreground">{copy.empty}</p>
              <p className="text-sm text-muted-foreground mt-1">{copy.hint}</p>
              <Button
                className="mt-4"
                onClick={() => navigate('/go-live')}
              >
                Go Live
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Streams;
