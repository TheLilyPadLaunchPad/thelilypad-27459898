import { useParams, useNavigate } from 'react-router-dom';
import { WebRTCViewer } from '@/components/streaming/WebRTCViewer';
import { LiveChat } from '@/components/LiveChat';
import { TipButton } from '@/components/TipButton';
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
  Clock,
  Eye,
  ExternalLink,
} from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useStreamPresence } from '@/hooks/useStreamPresence';
import { resolveStreamKind, youtubeWatchUrl } from '@/lib/streamPlayback';
import { resolveStreamStatus } from '@/lib/streamStatus';
import { formatDistanceToNow } from 'date-fns';

interface StreamRow {
  id: string;
  title: string;
  category: string | null;
  youtube_video_id: string | null;
  stream_key_id: string | null;
  user_id: string;
  is_live: boolean;
  scheduled_at: string | null;
  ended_at: string | null;
}

/** "in 2 hours" / "3 days ago" — null when there is no usable date. */
function relativeFrom(value?: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  try {
    return formatDistanceToNow(new Date(parsed), { addSuffix: true });
  } catch {
    return null;
  }
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
      .select('id, title, category, youtube_video_id, stream_key_id, user_id, is_live, scheduled_at, ended_at')
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
  const status = stream ? resolveStreamStatus(stream) : 'finished';
  const startsIn = status === 'scheduled' ? relativeFrom(stream?.scheduled_at) : null;
  const endedAgo = status === 'finished' ? relativeFrom(stream?.ended_at) : null;

  const statusNotice =
    status === 'scheduled'
      ? `This stream starts ${startsIn ?? 'soon'}. The player opens when the creator goes live.`
      : status === 'finished'
        ? `This stream ended ${endedAgo ?? 'earlier'}. The recording still plays when the creator left one behind.`
        : null;

  useSEO({
    title: stream?.title
      ? `${stream.title} | ${status === 'live' ? 'Live' : status === 'scheduled' ? 'Scheduled' : 'Replay'} on The Lily Pad`
      : 'Watch Live | The Lily Pad',
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

  // An id that matches no stream at all must not show an empty "live" player.
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
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h1 className="text-lg font-semibold">{stream?.title || "Live Stream"}</h1>
                    {status === 'live' && (
                      <Badge className="bg-red-500 text-white">
                        <Radio className="w-3 h-3 mr-1 animate-pulse" />
                        LIVE
                      </Badge>
                    )}
                    {status === 'scheduled' && (
                      <Badge variant="secondary" className="bg-amber-500/90 text-amber-950 gap-1">
                        <Clock className="w-3 h-3" />
                        Scheduled
                      </Badge>
                    )}
                    {status === 'finished' && (
                      <Badge variant="outline" className="gap-1">
                        <Eye className="w-3 h-3" />
                        Finished
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {streamerName ? `${streamerName} • ` : ''}
                    {sourceLabel}
                    {stream?.category ? ` • ${stream.category}` : ''}
                  </p>
                  {statusNotice && (
                    <p className="text-xs text-muted-foreground mt-2">{statusNotice}</p>
                  )}
                  {isYouTube && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Not loading? The video must be public or unlisted on YouTube with embedding allowed.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {stream?.user_id && (
                    <TipButton
                      key={stream.user_id}
                      streamerId={stream.user_id}
                      streamerName={streamerName || 'this creator'}
                      streamId={stream.id}
                      size="sm"
                    />
                  )}
                  {status === 'live' && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span className="text-sm">
                        {isConnected ? `${viewerCount} watching` : 'Connecting...'}
                      </span>
                    </div>
                  )}
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
