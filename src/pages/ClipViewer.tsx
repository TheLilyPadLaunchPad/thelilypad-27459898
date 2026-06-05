import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipShareMenu } from "@/components/ClipShareMenu";
import { ClipReactions } from "@/components/ClipReactions";
import { CommentThread, CommentData } from "@/components/CommentThread";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useSEO } from "@/hooks/useSEO";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  User, Eye, Calendar, Film, Play,
  MessageSquare, Send, ArrowLeft
} from "lucide-react";

interface ClipData {
  id: string;
  title: string;
  description: string | null;
  clip_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number;
  views: number;
  created_at: string;
  user_id: string;
  streamer?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

// Using CommentData from CommentThread component

interface RelatedClip {
  id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number;
  views: number;
  user_id: string;
  streamer?: {
    display_name: string | null;
  };
}

const ClipViewer = () => {
  const { clipId } = useParams<{ clipId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [clip, setClip] = useState<ClipData | null>(null);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [relatedClips, setRelatedClips] = useState<RelatedClip[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useSEO({
    title: clip?.title ? `${clip.title} | The Lily Pad` : "Watch Clip | The Lily Pad",
    description: clip?.description || "Watch and share clips from The Lily Pad. React, comment, and discover more content from your favorite creators."
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!clipId) return;
      setLoading(true);

      // Fetch clip data
      const { data: clipData, error: clipError } = await supabase
        .from("clips")
        .select("*")
        .eq("id", clipId)
        .maybeSingle();

      if (clipError || !clipData) {
        console.error("Error fetching clip:", clipError);
        setLoading(false);
        return;
      }

      // Fetch streamer profile
      const { data: streamerData } = await supabase
        .from("streamer_profiles")
        .select("display_name, avatar_url")
        .eq("user_id", clipData.user_id)
        .maybeSingle();

      setClip({
        ...clipData,
        streamer: streamerData || undefined,
      });

      // Track view event via edge function with rate limiting
      supabase.functions.invoke('track-clip-event', {
        body: {
          clip_id: clipId,
          event_type: 'view',
        },
      }).catch((error) => {
        console.error("Error tracking view:", error);
      });

      // Fetch comments
      const { data: commentsData } = await supabase
        .from("clip_comments")
        .select("*")
        .eq("clip_id", clipId)
        .order("created_at", { ascending: true });

      // Fetch profiles for commenters
      if (commentsData && commentsData.length > 0) {
        const userIds = [...new Set(commentsData.map(c => c.user_id))];
        const { data: profiles } = await supabase
          .from("streamer_profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", userIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        
        // Build threaded comments
        const commentsWithProfiles: CommentData[] = commentsData.map(comment => ({
          ...comment,
          profile: profileMap.get(comment.user_id) || undefined,
          replies: [],
        }));

        // Create a map for quick lookup
        const commentMap = new Map(commentsWithProfiles.map(c => [c.id, c]));
        
        // Build thread structure
        const rootComments: CommentData[] = [];
        commentsWithProfiles.forEach(comment => {
          if (comment.parent_id) {
            const parent = commentMap.get(comment.parent_id);
            if (parent) {
              parent.replies = parent.replies || [];
              parent.replies.push(comment);
            }
          } else {
            rootComments.push(comment);
          }
        });

        // Reverse to show newest first for root comments
        setComments(rootComments.reverse());
      } else {
        setComments([]);
      }

      // Fetch related clips (same streamer, excluding current)
      const { data: relatedData } = await supabase
        .from("clips")
        .select("id, title, thumbnail_url, duration_seconds, views, user_id")
        .eq("user_id", clipData.user_id)
        .neq("id", clipId)
        .order("views", { ascending: false })
        .limit(6);

      if (relatedData) {
        setRelatedClips(
          relatedData.map(r => ({
            ...r,
            streamer: streamerData || undefined,
          }))
        );
      }

      setLoading(false);
    };

    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };

    fetchData();
    checkUser();
  }, [clipId]);

  // Function to refetch and rebuild comment threads
  const refetchComments = async () => {
    if (!clipId) return;
    
    const { data: commentsData } = await supabase
      .from("clip_comments")
      .select("*")
      .eq("clip_id", clipId)
      .order("created_at", { ascending: true });

    if (commentsData && commentsData.length > 0) {
      const userIds = [...new Set(commentsData.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from("streamer_profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      const commentsWithProfiles: CommentData[] = commentsData.map(comment => ({
        ...comment,
        profile: profileMap.get(comment.user_id) || undefined,
        replies: [],
      }));

      const commentMap = new Map(commentsWithProfiles.map(c => [c.id, c]));
      
      const rootComments: CommentData[] = [];
      commentsWithProfiles.forEach(comment => {
        if (comment.parent_id) {
          const parent = commentMap.get(comment.parent_id);
          if (parent) {
            parent.replies = parent.replies || [];
            parent.replies.push(comment);
          }
        } else {
          rootComments.push(comment);
        }
      });

      setComments(rootComments.reverse());
    } else {
      setComments([]);
    }
  };

  // Real-time comments subscription
  useEffect(() => {
    if (!clipId) return;

    const channel = supabase
      .channel("clip-comments")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "clip_comments",
          filter: `clip_id=eq.${clipId}`,
        },
        async (payload) => {
          const insertedComment = payload.new as CommentData;
          
          // Fetch profile for new comment
          const { data: profile } = await supabase
            .from("streamer_profiles")
            .select("display_name, avatar_url")
            .eq("user_id", insertedComment.user_id)
            .maybeSingle();

          const commentWithProfile: CommentData = {
            ...insertedComment,
            profile: profile || undefined,
            replies: [],
          };

          if (insertedComment.parent_id) {
            // It's a reply - need to refetch to rebuild thread structure
            // For simplicity, we'll trigger a refetch
            refetchComments();
          } else {
            // It's a root comment
            setComments(prev => [commentWithProfile, ...prev]);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "clip_comments",
          filter: `clip_id=eq.${clipId}`,
        },
        (payload) => {
          setComments(prev => prev.filter(c => c.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clipId]);

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !clipId || !currentUserId) {
      if (!currentUserId) {
        toast({
          title: "Sign in required",
          description: "Please sign in to leave a comment.",
          variant: "destructive",
        });
      }
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("clip_comments").insert({
      clip_id: clipId,
      user_id: currentUserId,
      content: newComment.trim(),
    });

    if (error) {
      console.error("Error posting comment:", error);
      toast({
        title: "Error",
        description: "Failed to post comment. Please try again.",
        variant: "destructive",
      });
    } else {
      setNewComment("");
      toast({
        title: "Comment posted!",
        description: "Your comment has been added.",
      });
    }
    setSubmitting(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    const { error } = await supabase
      .from("clip_comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete comment.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Comment deleted",
        description: "Your comment has been removed.",
      });
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="max-w-6xl mx-auto">
            <Skeleton className="w-full aspect-video rounded-xl mb-6" />
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-20 w-full" />
              </div>
              <Skeleton className="h-64" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="max-w-2xl mx-auto text-center py-16">
            <Film className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h1 className="text-2xl font-bold mb-2">Clip not found</h1>
            <p className="text-muted-foreground mb-6">
              This clip may have been deleted or doesn't exist.
            </p>
            <Button onClick={() => navigate(-1)} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-6xl mx-auto">
          {/* Breadcrumb Navigation */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-6"
          >
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/" className="hover:text-primary transition-colors">Home</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/streams" className="hover:text-primary transition-colors">Streams</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="truncate max-w-[200px]">{clip.title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Video Player */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="border-0 overflow-hidden bg-black">
                  <CardContent className="p-0">
                    <div className="relative aspect-video">
                      {clip.clip_url ? (
                        <video
                          src={clip.clip_url}
                          controls
                          autoPlay
                          className="w-full h-full"
                          poster={clip.thumbnail_url || undefined}
                        />
                      ) : clip.thumbnail_url ? (
                        <div className="relative w-full h-full">
                          <img
                            src={clip.thumbnail_url}
                            alt={clip.title}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <div className="text-center text-white">
                              <Play className="h-16 w-16 mx-auto mb-2 opacity-50" />
                              <p className="text-sm opacity-75">Video unavailable</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <Film className="h-16 w-16 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Clip Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <h1 className="text-2xl font-bold">{clip.title}</h1>
                      <ClipShareMenu
                        clipId={clip.id}
                        clipTitle={clip.title}
                        clipUrl={clip.clip_url}
                        streamerName={clip.streamer?.display_name || undefined}
                      />
                    </div>

                    {clip.description && (
                      <p className="text-muted-foreground mb-4">{clip.description}</p>
                    )}

                    <div className="flex items-center gap-6 text-sm text-muted-foreground mb-4">
                      <span className="flex items-center gap-1.5">
                        <Eye className="h-4 w-4" />
                        {formatNumber(clip.views)} views
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        {formatDistanceToNow(new Date(clip.created_at), { addSuffix: true })}
                      </span>
                    </div>

                    {/* Reactions */}
                    <div className="mb-4">
                      <ClipReactions clipId={clip.id} />
                    </div>

                    {/* Streamer Info */}
                    <Link
                      to={`/streamer/${clip.user_id}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        {clip.streamer?.avatar_url ? (
                          <AvatarImage src={clip.streamer.avatar_url} />
                        ) : (
                          <AvatarFallback>
                            <User className="h-5 w-5" />
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {clip.streamer?.display_name || "Unknown Streamer"}
                        </p>
                        <p className="text-xs text-muted-foreground">View profile</p>
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Comments Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      Comments ({comments.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Comment Input */}
                    <div className="flex gap-3">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-2">
                        <Textarea
                          placeholder={currentUserId ? "Add a comment..." : "Sign in to comment..."}
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          disabled={!currentUserId}
                          className="min-h-[80px] resize-none"
                        />
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            onClick={handleSubmitComment}
                            disabled={!newComment.trim() || submitting || !currentUserId}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            {submitting ? "Posting..." : "Post"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Comments List */}
                    {comments.length > 0 ? (
                      <div className="space-y-4 pt-4 border-t border-border/50">
                        {comments.map((comment) => (
                          <CommentThread
                            key={comment.id}
                            comment={comment}
                            currentUserId={currentUserId}
                            clipId={clipId!}
                            onDelete={handleDeleteComment}
                            onReplyAdded={refetchComments}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No comments yet</p>
                        <p className="text-xs">Be the first to comment!</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Sidebar - Related Clips */}
            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">More from this creator</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {relatedClips.length > 0 ? (
                      relatedClips.map((relatedClip, index) => (
                        <motion.div
                          key={relatedClip.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 + index * 0.05 }}
                        >
                          <Link
                            to={`/clip/${relatedClip.id}`}
                            className="flex gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                          >
                            <div className="relative w-28 aspect-video rounded-lg overflow-hidden bg-muted shrink-0">
                              {relatedClip.thumbnail_url ? (
                                <img
                                  src={relatedClip.thumbnail_url}
                                  alt={relatedClip.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Film className="h-6 w-6 text-muted-foreground/50" />
                                </div>
                              )}
                              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-medium">
                                {formatDuration(relatedClip.duration_seconds)}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                                {relatedClip.title}
                              </h3>
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatNumber(relatedClip.views)} views
                              </p>
                            </div>
                          </Link>
                        </motion.div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Film className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No other clips yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ClipViewer;
