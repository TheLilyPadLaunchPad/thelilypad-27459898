import { useParams, useNavigate } from 'react-router-dom';
import { WebRTCViewer } from '@/components/streaming/WebRTCViewer';
import { LiveChat } from '@/components/LiveChat';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Radio,
  Users,
  Share2,
  Copy,
  Check,
  Youtube,
  ExternalLink,
} from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useStreamPresence } from '@/hooks/useStreamPresence';
import { resolveStreamKind, youtubeWatchUrl } from '@/lib/streamPlayback';

interface StreamRow {
  id: string;
  title: string;
  category: string | null;
  youtube_video_id: string | null;
  stream_key_id: string | null;
  user_id: string;
}

const Watch = () => {
  const { playbackId } = useParams<{ playbackId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [stream, setStream] = useState<StreamRow | null>(null);
  const [streamerName, setStreamerName] = useState<string | null>(null);
  const [streamLoaded, setStreamLoaded] = useState(false);

  // Track viewer presence for real-time viewer count
  const { viewerCount, isConnected } = useStreamPresence(playbackId);

  useEffect(() => {
    if (!playbackId || !/^[0-9a-f-]{36}$/i.test(playbackId)) {
      setStreamLoaded(true);
      return;
    }
    let cancelled = false;
    supabase
      .from('streams')
      .select('id, title, category, youtube_video_id, stream_key_id, user_id')
      .eq('id', playbackId)
      .maybeSingle()
      .then(async ({ data }) => {
        if (cancelled) return;
        if (data) {
          const row = data as StreamRow;
          setStream(row);
          const { data: profile } = await supabase
            .from('streamer_profiles_public')
            .select('display_name')
            .eq('user_id', row.user_id)
            .maybeSingle();
          if (!cancelled) setStreamerName(profile?.display_name ?? null);
        }
        setStreamLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [playbackId]);

  const videoId = stream?.youtube_video_id ?? null;
  const isYouTube = resolveStreamKind(stream ?? {}) === 'youtube';
  const sourceLabel = isYouTube ? 'YouTube Live' : 'Browser Stream';

  useSEO({
    title: stream?.title ? `${stream.title} | Live on The Lily Pad` : 'Watch Live | The Lily Pad',
    description: "Watch live streams on The Lily Pad. Join the chat, support creators, and be part of the community."
  });

  const shareUrl = window.location.href;

  const copyShareLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({
      title: 'Link copied!',
      description: 'Share this link to invite others to watch.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const shareStream = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Watch this live stream!',
          text: 'Join me watching this live stream on The Lily Pad',
          url: shareUrl,
        });
      } catch {
        copyShareLink();
      }
    } else {
      copyShareLink();
    }
  };

  if (!playbackId) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto py-24 text-center">
          <Radio className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">No stream specified</p>
          <Button variant="link" onClick={() => navigate('/streams')}>
            Browse Streams
          </Button>
        </div>
      </div>
    );
  }

  // An id that matches no live stream must not show an empty "live" player.
  if (streamLoaded && !stream) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto py-24 text-center">
          <Radio className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-semibold mb-2">This stream isn't live right now.</p>
          <p className="text-muted-foreground mb-4">
            It may have ended, or the link may be out of date.
          </p>
          <Button variant="outline" onClick={() => navigate('/streams')}>
            Browse live streams
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-6 pt-24 max-w-7xl px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            {isYouTube && videoId && (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href={youtubeWatchUrl(videoId)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Watch on YouTube
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={copyShareLink}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              Copy Link
            </Button>
            <Button variant="outline" size="sm" onClick={shareStream}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Video Player */}
          <div className="lg:col-span-3">
            {isYouTube && videoId ? (
              <iframe
                className="w-full aspect-video rounded-xl overflow-hidden border border-border"
                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`}
                title={stream?.title || 'YouTube Live stream'}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <WebRTCViewer
                className="w-full aspect-video rounded-xl overflow-hidden"
              />
            )}
            
            {/* Stream Info Below Player */}
            <div className="mt-4 p-4 bg-card rounded-xl border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-lg font-semibold">{stream?.title || "Live Stream"}</h1>
                    <Badge className="bg-red-500 text-white">
                      <Radio className="w-3 h-3 mr-1 animate-pulse" />
                      LIVE
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {streamerName ? `${streamerName} • ` : ''}
                    {sourceLabel}
                    {stream?.category ? ` • ${stream.category}` : ''}
                  </p>
                  {isYouTube && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Not loading? The video must be public or unlisted on YouTube with embedding allowed.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="text-sm">
                    {isConnected ? `${viewerCount} watching` : 'Connecting...'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Live Chat Sidebar */}
          <div className="lg:col-span-1 h-[calc(100vh-200px)] min-h-[400px]">
            <LiveChat 
              playbackId={playbackId} 
              className="h-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Watch;
