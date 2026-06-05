import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, CheckCircle, Heart, Radio, ExternalLink, Calendar, Tag, Loader2, Sparkles, Filter, ArrowUpDown, Search, X, LayoutGrid, List } from "lucide-react";
import { LilyPadLogo } from "@/components/LilyPadLogo";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { FollowButton } from "@/components/FollowButton";
import { StreamerSchedules } from "@/components/StreamerSchedules";
import { NextStreamCountdown } from "@/components/NextStreamCountdown";
import { useSEO } from "@/hooks/useSEO";

// Public streamer profile (excludes sensitive wallet addresses)
type StreamerProfilePublic = Omit<Tables<"streamer_profiles">, "payout_wallet_address" | "sol_wallet_address">;
type StreamerWithStatus = StreamerProfilePublic & { is_live: boolean; followed_at?: string };

type SortOption = "live" | "name" | "recent";
type ViewMode = "grid" | "list";

const STORAGE_KEY = "following-filters";
const ITEMS_PER_PAGE = 12;

const getStoredFilters = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
};

const Following = () => {
  const storedFilters = getStoredFilters();
  
  const [followedStreamers, setFollowedStreamers] = useState<StreamerWithStatus[]>([]);
  const [recommendedStreamers, setRecommendedStreamers] = useState<StreamerWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(storedFilters?.category || "all");
  const [sortBy, setSortBy] = useState<SortOption>(storedFilters?.sortBy || "live");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [liveOnly, setLiveOnly] = useState<boolean>(storedFilters?.liveOnly || false);
  const [viewMode, setViewMode] = useState<ViewMode>(storedFilters?.viewMode || "grid");
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useSEO({
    title: "Lily Following | The Lily Pad",
    description: "Stay updated with your favorite streamers. See who's live, upcoming schedules, and never miss a stream from creators you follow."
  });

  // Persist filter preferences to localStorage
  useEffect(() => {
    const filters = {
      category: selectedCategory,
      sortBy,
      liveOnly,
      viewMode,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [selectedCategory, sortBy, liveOnly, viewMode]);

  // Keyboard shortcuts for search
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      searchInputRef.current?.focus();
    }
    if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
      e.preventDefault();
      setSearchQuery("");
      searchInputRef.current?.blur();
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Get unique categories from followed streamers
  const availableCategories = useMemo(() => {
    const categories = new Set<string>();
    followedStreamers.forEach((streamer) => {
      if (Array.isArray(streamer.categories)) {
        streamer.categories.forEach((cat) => categories.add(cat));
      }
    });
    return Array.from(categories).sort();
  }, [followedStreamers]);

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (selectedCategory !== "all") count++;
    if (sortBy !== "live") count++; // "live" is the default sort
    if (liveOnly) count++;
    return count;
  }, [searchQuery, selectedCategory, sortBy, liveOnly]);

  // Filter and sort streamers
  const filteredStreamers = useMemo(() => {
    let result = followedStreamers;
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (streamer) =>
          (streamer.display_name || "").toLowerCase().includes(query)
      );
    }
    
    // Filter by live only
    if (liveOnly) {
      result = result.filter((streamer) => streamer.is_live);
    }
    
    // Filter by category
    if (selectedCategory !== "all") {
      result = result.filter(
        (streamer) =>
          Array.isArray(streamer.categories) &&
          streamer.categories.includes(selectedCategory)
      );
    }
    
    // Sort based on selected option
    return [...result].sort((a, b) => {
      switch (sortBy) {
        case "live":
          // Live first, then alphabetical
          if (a.is_live && !b.is_live) return -1;
          if (!a.is_live && b.is_live) return 1;
          return (a.display_name || "").localeCompare(b.display_name || "");
        case "name":
          return (a.display_name || "").localeCompare(b.display_name || "");
        case "recent":
          // Most recently followed first
          {
            const dateA = a.followed_at ? new Date(a.followed_at).getTime() : 0;
            const dateB = b.followed_at ? new Date(b.followed_at).getTime() : 0;
            return dateB - dateA;
          }
        default:
          return 0;
      }
    });
  }, [followedStreamers, selectedCategory, sortBy, searchQuery, liveOnly]);

  // Initial auth check
  useEffect(() => {
    checkAuthAndFetch();
  }, []);

  // Infinite scroll observer
  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && userId) {
          setPage(prev => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, userId]);

  // Load more when page changes
  useEffect(() => {
    if (page > 1 && userId) {
      fetchMoreStreamers(userId, page);
    }
  }, [page, userId]);

  useEffect(() => {
    if (!userId) return;

    // Subscribe to real-time updates for streams (live status changes)
    const streamsChannel = supabase
      .channel('following-streams-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'streams',
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const stream = payload.new as { user_id: string; is_live: boolean };
            setFollowedStreamers((prev) =>
              prev.map((streamer) =>
                streamer.user_id === stream.user_id
                  ? { ...streamer, is_live: stream.is_live }
                  : streamer
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(streamsChannel);
    };
  }, [userId]);

  const checkAuthAndFetch = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    setUserId(user.id);
    await fetchFollowedStreamers(user.id);
  };

  const fetchFollowedStreamers = async (currentUserId: string) => {
    setLoading(true);
    setPage(1);
    setHasMore(true);
    
    try {
      // Get total count first
      const { count } = await supabase
        .from("followers")
        .select("*", { count: 'exact', head: true })
        .eq("follower_id", currentUserId);

      setTotalCount(count || 0);

      // Fetch first page of followed streamer IDs with created_at for sorting
      const { data: follows, error: followsError } = await supabase
        .from("followers")
        .select("streamer_id, created_at")
        .eq("follower_id", currentUserId)
        .order("created_at", { ascending: false })
        .range(0, ITEMS_PER_PAGE - 1);

      if (followsError) throw followsError;

      const streamerIds = (follows?.map((f) => f.streamer_id) || []) as string[];
      const followDates = new Map(follows?.map((f) => [f.streamer_id, f.created_at]) || []);

      if (streamerIds.length === 0) {
        setFollowedStreamers([]);
        setHasMore(false);
        await fetchRecommendedStreamers(currentUserId, [], []);
        setLoading(false);
        return;
      }

      setHasMore(follows!.length === ITEMS_PER_PAGE);

      // Fetch streamer profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("streamer_profiles_public")
        .select("*")
        .in("user_id", streamerIds);

      if (profilesError) throw profilesError;

      // Fetch live streams for followed streamers
      const { data: liveStreams, error: liveError } = await supabase
        .from("streams")
        .select("user_id")
        .eq("is_live", true)
        .in("user_id", streamerIds);

      if (liveError) throw liveError;

      const liveStreamersSet = new Set(liveStreams?.map((s) => s.user_id) || []);

      const streamersWithStatus: StreamerWithStatus[] = (profiles || []).map((profile) => ({
        ...profile,
        is_live: liveStreamersSet.has(profile.user_id),
        followed_at: followDates.get(profile.user_id),
      }));

      setFollowedStreamers(streamersWithStatus);

      // Get categories from followed streamers for recommendations
      const followedCategories = Array.from(
        new Set((profiles || []).flatMap((p: any) => p.categories || []))
      ) as string[];

      await fetchRecommendedStreamers(currentUserId, streamerIds as string[], followedCategories);
    } catch (error) {
      console.error("Error fetching followed streamers:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMoreStreamers = async (currentUserId: string, pageNum: number) => {
    setLoadingMore(true);
    
    try {
      const from = (pageNum - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data: follows, error: followsError } = await supabase
        .from("followers")
        .select("streamer_id, created_at")
        .eq("follower_id", currentUserId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (followsError) throw followsError;

      if (!follows || follows.length === 0) {
        setHasMore(false);
        return;
      }

      setHasMore(follows.length === ITEMS_PER_PAGE);

      const streamerIds = follows.map((f) => f.streamer_id);
      const followDates = new Map(follows.map((f) => [f.streamer_id, f.created_at]));

      const { data: profiles, error: profilesError } = await supabase
        .from("streamer_profiles")
        .select("*")
        .in("user_id", streamerIds);

      if (profilesError) throw profilesError;

      const { data: liveStreams } = await supabase
        .from("streams")
        .select("user_id")
        .eq("is_live", true)
        .in("user_id", streamerIds);

      const liveStreamersSet = new Set(liveStreams?.map((s) => s.user_id) || []);

      const newStreamers: StreamerWithStatus[] = (profiles || []).map((profile) => ({
        ...profile,
        is_live: liveStreamersSet.has(profile.user_id),
        followed_at: followDates.get(profile.user_id),
      }));

      setFollowedStreamers(prev => [...prev, ...newStreamers]);
    } catch (error) {
      console.error("Error fetching more streamers:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const fetchRecommendedStreamers = async (
    currentUserId: string,
    followedIds: string[],
    categories: string[]
  ) => {
    try {
      // Fetch all streamers that user doesn't follow (excluding self)
      let query = supabase
        .from("streamer_profiles")
        .select("*")
        .neq("user_id", currentUserId);

      if (followedIds.length > 0) {
        // Filter out already followed streamers
        for (const id of followedIds) {
          query = query.neq("user_id", id);
        }
      }

      const { data: allStreamers, error: streamersError } = await query.limit(50);

      if (streamersError) throw streamersError;

      if (!allStreamers || allStreamers.length === 0) {
        setRecommendedStreamers([]);
        return;
      }

      // Score streamers by matching categories
      const scoredStreamers = allStreamers.map((streamer) => {
        const streamerCategories = streamer.categories || [];
        const matchingCategories = streamerCategories.filter((c) =>
          categories.includes(c)
        );
        return {
          ...streamer,
          score: matchingCategories.length,
        };
      });

      // Sort by score (most matching categories first), then by verified, then alphabetically
      scoredStreamers.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.is_verified && !b.is_verified) return -1;
        if (!a.is_verified && b.is_verified) return 1;
        return (a.display_name || "").localeCompare(b.display_name || "");
      });

      // Take top recommendations (those with matching categories, or top streamers if no matches)
      const topRecommendations = scoredStreamers.slice(0, 6);

      // Fetch live status for recommendations
      const recommendedIds = topRecommendations.map((s) => s.user_id);
      const { data: liveStreams } = await supabase
        .from("streams")
        .select("user_id")
        .eq("is_live", true)
        .in("user_id", recommendedIds);

      const liveSet = new Set(liveStreams?.map((s) => s.user_id) || []);

      const recommendedWithStatus: StreamerWithStatus[] = topRecommendations.map((s) => ({
        ...s,
        is_live: liveSet.has(s.user_id),
      }));

      // Sort recommendations: live first
      recommendedWithStatus.sort((a, b) => {
        if (a.is_live && !b.is_live) return -1;
        if (!a.is_live && b.is_live) return 1;
        return 0;
      });

      setRecommendedStreamers(recommendedWithStatus);
    } catch (error) {
      console.error("Error fetching recommended streamers:", error);
    }
  };

  const handleFollowChange = () => {
    if (userId) {
      fetchFollowedStreamers(userId);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getSocialCount = (streamer: StreamerProfilePublic) => {
    let count = 0;
    if (streamer.social_twitter) count++;
    if (streamer.social_youtube) count++;
    if (streamer.social_discord) count++;
    if (streamer.social_instagram) count++;
    if (streamer.social_tiktok) count++;
    return count;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <LilyPadLogo size={64} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Lily Following
            </span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Stay updated with your favorite streamers and never miss when they go live
          </p>
          
          {/* Next Stream Countdown & Schedules */}
          {!loading && followedStreamers.length > 0 && (
            <div className="max-w-xl mx-auto mt-8 space-y-4">
              <NextStreamCountdown streamers={followedStreamers} />
              <StreamerSchedules streamers={followedStreamers} />
            </div>
          )}
        </div>

        {/* Stats and Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Heart className="h-4 w-4" />
            <span>
              {totalCount} streamer{totalCount !== 1 ? "s" : ""} followed
            </span>
            {followedStreamers.filter((s) => s.is_live).length > 0 && (
              <>
                <span className="text-border">•</span>
                <Radio className="h-4 w-4 text-red-500" />
                <span className="text-red-500">
                  {followedStreamers.filter((s) => s.is_live).length} live now
                </span>
              </>
            )}
          </div>

          {/* Search and Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Active Filters Badge & Clear Button */}
            {activeFiltersCount > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                  {activeFiltersCount} filter{activeFiltersCount !== 1 ? "s" : ""} active
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("all");
                    setSortBy("live");
                    setLiveOnly(false);
                  }}
                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
            )}

            {/* Live Only Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="live-only"
                checked={liveOnly}
                onCheckedChange={setLiveOnly}
                className="data-[state=checked]:bg-red-500"
              />
              <Label htmlFor="live-only" className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1">
                <Radio className="h-3 w-3" />
                Live Only
              </Label>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search (⌘K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-[200px] bg-card border-border"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
                <SelectTrigger className="w-[160px] bg-card border-border">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="live">Live Status</SelectItem>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                  <SelectItem value="recent">Recently Followed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            {availableCategories.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-[180px] bg-card border-border">
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border z-50">
                    <SelectItem value="all">All Categories</SelectItem>
                    {availableCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("grid")}
                className={`rounded-none h-8 px-3 ${viewMode === "grid" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("list")}
                className={`rounded-none h-8 px-3 ${viewMode === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Category Chips */}
        {availableCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="text-sm text-muted-foreground mr-1">Categories:</span>
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              All
            </button>
            {availableCategories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl p-6 border border-border">
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-16 w-16 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-muted rounded w-32 animate-pulse" />
                    <div className="h-4 bg-muted rounded w-20 animate-pulse" />
                  </div>
                </div>
                <div className="h-16 bg-muted rounded mb-4 animate-pulse" />
                <div className="flex gap-2">
                  <div className="h-8 bg-muted rounded w-20 animate-pulse" />
                  <div className="h-8 bg-muted rounded w-24 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : followedStreamers.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No streamers followed yet</h3>
            <p className="text-muted-foreground mb-6">
              Discover talented creators and follow them to see their updates here
            </p>
            <Link to="/streamers">
              <Button variant="default">
                Explore Streamers
              </Button>
            </Link>
          </div>
        ) : filteredStreamers.length === 0 ? (
          <div className="text-center py-16">
            <Tag className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No streamers in this category</h3>
            <p className="text-muted-foreground mb-6">
              None of your followed streamers are in the "{selectedCategory}" category
            </p>
            <Button variant="outline" onClick={() => setSelectedCategory("all")}>
              Show All Streamers
            </Button>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStreamers.map((streamer, index) => (
              <motion.div
                key={streamer.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link to={`/streamer/${streamer.user_id}`}>
                  <div className="group bg-card rounded-xl p-6 border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10">
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className="relative">
                        <Avatar className={`h-16 w-16 ring-2 ${streamer.is_live ? 'ring-red-500' : 'ring-border'} group-hover:ring-primary/50 transition-all`}>
                          <AvatarImage src={streamer.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/20 text-primary text-lg">
                            {getInitials(streamer.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        {streamer.is_live && (
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase animate-pulse">
                            Live
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg truncate">
                            {streamer.display_name || "Anonymous"}
                          </h3>
                          {streamer.is_verified && (
                            <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Joined {new Date(streamer.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <FollowButton 
                        streamerId={streamer.user_id} 
                        variant="compact" 
                        onFollowChange={handleFollowChange}
                      />
                    </div>

                    {/* Bio */}
                    <p className="text-muted-foreground text-sm line-clamp-3 mb-4 min-h-[3.75rem]">
                      {streamer.bio || "No bio yet"}
                    </p>

                    {/* Stats */}
                    <div className="flex flex-wrap gap-2">
                      {streamer.is_live && (
                        <Badge variant="destructive" className="bg-red-500 animate-pulse">
                          <Radio className="h-3 w-3 mr-1" />
                          Live Now
                        </Badge>
                      )}
                      {streamer.is_verified && (
                        <Badge variant="default" className="bg-primary/20 text-primary border-0">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      )}
                      {getSocialCount(streamer) > 0 && (
                        <Badge variant="secondary">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          {getSocialCount(streamer)} Social Link{getSocialCount(streamer) !== 1 ? "s" : ""}
                        </Badge>
                      )}
                      {streamer.schedule && Array.isArray(streamer.schedule) && streamer.schedule.length > 0 && (
                        <Badge variant="outline">
                          <Calendar className="h-3 w-3 mr-1" />
                          Has Schedule
                        </Badge>
                      )}
                      {Array.isArray(streamer.categories) && streamer.categories.slice(0, 2).map((category) => (
                        <Badge key={category} variant="outline" className="bg-accent/10 border-accent/30 text-accent">
                          <Tag className="h-3 w-3 mr-1" />
                          {category}
                        </Badge>
                      ))}
                    </div>

                    {/* View Profile Button */}
                    <Button
                      variant="ghost"
                      className="w-full mt-4 group-hover:bg-primary/10 group-hover:text-primary"
                    >
                      View Profile
                    </Button>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          /* List View */
          <div className="flex flex-col gap-2">
            {filteredStreamers.map((streamer, index) => (
              <motion.div
                key={streamer.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <Link to={`/streamer/${streamer.user_id}`}>
                  <div className="group flex items-center gap-4 bg-card rounded-lg p-4 border border-border hover:border-primary/50 transition-all duration-200 hover:bg-card/80">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <Avatar className={`h-12 w-12 ring-2 ${streamer.is_live ? 'ring-red-500' : 'ring-border'} group-hover:ring-primary/50 transition-all`}>
                        <AvatarImage src={streamer.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary">
                          {getInitials(streamer.display_name)}
                        </AvatarFallback>
                      </Avatar>
                      {streamer.is_live && (
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-sm uppercase animate-pulse">
                          Live
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">
                          {streamer.display_name || "Anonymous"}
                        </h3>
                        {streamer.is_verified && (
                          <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                        )}
                        {streamer.is_live && (
                          <Badge variant="destructive" className="bg-red-500 animate-pulse text-[10px] h-5">
                            <Radio className="h-2.5 w-2.5 mr-1" />
                            Live
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {streamer.bio || "No bio yet"}
                      </p>
                    </div>

                    {/* Categories */}
                    <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                      {Array.isArray(streamer.categories) && streamer.categories.slice(0, 2).map((category) => (
                        <Badge key={category} variant="outline" className="bg-accent/10 border-accent/30 text-accent text-xs">
                          {category}
                        </Badge>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.preventDefault()}>
                      <FollowButton 
                        streamerId={streamer.user_id} 
                        variant="compact" 
                        onFollowChange={handleFollowChange}
                      />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {/* Infinite Scroll Trigger */}
        {!loading && filteredStreamers.length > 0 && (
          <div ref={loadMoreRef} className="flex justify-center py-8">
            {loadingMore ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading more...</span>
              </div>
            ) : hasMore ? (
              <Button 
                variant="outline" 
                onClick={() => setPage(prev => prev + 1)}
              >
                Load More
              </Button>
            ) : followedStreamers.length > ITEMS_PER_PAGE ? (
              <p className="text-sm text-muted-foreground">
                You've reached the end • {totalCount} streamers total
              </p>
            ) : null}
          </div>
        )}
        {!loading && recommendedStreamers.length > 0 && (
          <section className="mt-16">
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="h-6 w-6 text-accent" />
              <h2 className="text-2xl font-bold">Recommended for You</h2>
            </div>
            <p className="text-muted-foreground mb-6">
              Based on the categories of streamers you follow
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommendedStreamers.map((streamer, index) => (
                <motion.div
                  key={streamer.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link to={`/streamer/${streamer.user_id}`}>
                    <div className="group bg-card rounded-xl p-6 border border-border hover:border-accent/50 transition-all duration-300 hover:shadow-lg hover:shadow-accent/10">
                      {/* Header */}
                      <div className="flex items-center gap-4 mb-4">
                        <div className="relative">
                          <Avatar className={`h-16 w-16 ring-2 ${streamer.is_live ? 'ring-red-500' : 'ring-border'} group-hover:ring-accent/50 transition-all`}>
                            <AvatarImage src={streamer.avatar_url || undefined} />
                            <AvatarFallback className="bg-accent/20 text-accent text-lg">
                              {getInitials(streamer.display_name)}
                            </AvatarFallback>
                          </Avatar>
                          {streamer.is_live && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase animate-pulse">
                              Live
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg truncate">
                              {streamer.display_name || "Anonymous"}
                            </h3>
                            {streamer.is_verified && (
                              <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Joined {new Date(streamer.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <FollowButton 
                          streamerId={streamer.user_id} 
                          variant="compact" 
                          onFollowChange={handleFollowChange}
                        />
                      </div>

                      {/* Bio */}
                      <p className="text-muted-foreground text-sm line-clamp-3 mb-4 min-h-[3.75rem]">
                        {streamer.bio || "No bio yet"}
                      </p>

                      {/* Categories */}
                      <div className="flex flex-wrap gap-2">
                        {streamer.is_live && (
                          <Badge variant="destructive" className="bg-red-500 animate-pulse">
                            <Radio className="h-3 w-3 mr-1" />
                            Live Now
                          </Badge>
                        )}
                        {streamer.is_verified && (
                          <Badge variant="default" className="bg-primary/20 text-primary border-0">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                        {Array.isArray(streamer.categories) && streamer.categories.slice(0, 3).map((category) => (
                          <Badge key={category} variant="outline" className="bg-accent/10 border-accent/30 text-accent">
                            <Tag className="h-3 w-3 mr-1" />
                            {category}
                          </Badge>
                        ))}
                      </div>

                      {/* View Profile Button */}
                      <Button
                        variant="ghost"
                        className="w-full mt-4 group-hover:bg-accent/10 group-hover:text-accent"
                      >
                        View Profile
                      </Button>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Following;
