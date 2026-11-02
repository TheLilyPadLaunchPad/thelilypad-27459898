import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Eye, Play, Radio, Youtube, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStreamPresence } from '@/hooks/useStreamPresence';
import { resolveStreamStatus, type StreamStatus } from '@/lib/streamStatus';
import { formatDistanceToNow } from 'date-fns';

interface LiveStreamCardProps {
  id: string;
  playbackId: string;
  name: string;
  isActive: boolean;
  creatorName?: string;
  creatorAvatar?: string;
  viewerCount?: number;
  thumbnailUrl?: string;
  category?: string;
  streamType?: 'youtube' | 'webrtc' | 'hls';
  /** Overrides the state inferred from `isActive`. */
  status?: StreamStatus;
  scheduledAt?: string | null;
  endedAt?: string | null;
  /** Set when a finished stream can still be watched, e.g. a YouTube recording. */
  replayUrl?: string | null;
}

/** "in 2 hours" / "3 days ago" — null when the row carries no usable date. */
function relativeTime(value?: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  try {
    return formatDistanceToNow(new Date(parsed), { addSuffix: true });
  } catch {
    return null;
  }
}

export const LiveStreamCard = ({
  id,
  playbackId,
  name,
  isActive,
  creatorName = 'Anonymous',
  creatorAvatar,
  viewerCount: propViewerCount = 0,
  thumbnailUrl,
  category,
  streamType = 'hls',
  status,
  scheduledAt,
  endedAt,
  replayUrl,
}: LiveStreamCardProps) => {
  const navigate = useNavigate();
  const state: StreamStatus = status ?? resolveStreamStatus({ is_live: isActive, ended_at: endedAt, scheduled_at: scheduledAt });

  // Use real-time presence for active streams
  const { viewerCount: liveViewerCount, isConnected } = useStreamPresence(state === 'live' ? playbackId : undefined);

  // Use live count if available, otherwise fall back to prop
  const viewerCount = state === 'live' && isConnected ? liveViewerCount : propViewerCount;

  const startsIn = state === 'scheduled' ? relativeTime(scheduledAt) : null;
  const endedAgo = state === 'finished' ? relativeTime(endedAt) : null;

  // A scheduled stream has nothing to watch yet, and a finished one only
  // opens when there is a recording behind it.
  const canOpen = state === 'live' || (state === 'finished' && !!replayUrl);

  const handleClick = () => {
    if (state === 'live') {
      navigate(streamType === 'webrtc' ? `/watch/${playbackId}?type=webrtc` : `/watch/${playbackId}`);
      return;
    }
    if (state === 'finished' && replayUrl) {
      window.open(replayUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Card
      role={canOpen ? 'link' : undefined}
      aria-disabled={!canOpen}
      aria-label={
        state === 'scheduled'
          ? `${name} — scheduled ${startsIn ?? 'to start'}`
          : state === 'finished'
            ? `${name} — finished${endedAgo ? ` ${endedAgo}` : ''}`
            : `${name} — live now`
      }
      className={`overflow-hidden transition-all group ${
        canOpen
          ? 'cursor-pointer hover:ring-2 hover:ring-primary'
          : 'cursor-default opacity-90'
      }`}
      onClick={handleClick}
    >
      <div className="relative aspect-video bg-muted">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
            <Play className="h-12 w-12 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-2 left-2">
          {state === 'live' && (
            <Badge variant="destructive" className="gap-1 animate-live-pulse">
              <Radio className="w-2 h-2" />
              LIVE
            </Badge>
          )}
          {state === 'scheduled' && (
            <Badge variant="secondary" className="gap-1 bg-amber-500/90 text-amber-950 hover:bg-amber-500/90">
              <Clock className="w-2 h-2" />
              Scheduled
            </Badge>
          )}
          {state === 'finished' && (
            <Badge variant="outline" className="gap-1 bg-black/50 text-white">
              <Eye className="w-2 h-2" />
              Finished
            </Badge>
          )}
        </div>

        {/* Viewer count */}
        {state === 'live' && (
          <div className="absolute top-2 right-2">
            <Badge variant="secondary" className="gap-1">
              <Eye className="h-3 w-3" />
              {viewerCount}
            </Badge>
          </div>
        )}

        {/* Stream type badge */}
        {streamType === 'webrtc' && (
          <div className="absolute bottom-2 right-2">
            <Badge variant="outline" className="bg-black/50 text-white text-xs">
              Browser
            </Badge>
          </div>
        )}

        {streamType === 'youtube' && (
          <div className="absolute bottom-2 right-2">
            <Badge variant="outline" className="bg-black/50 text-white text-xs gap-1">
              <Youtube className="h-3 w-3" />
              YouTube
            </Badge>
          </div>
        )}

        {/* Hover overlay */}
        {canOpen && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <Play className="h-16 w-16 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
          </div>
        )}
      </div>

      <CardContent className="p-3">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={creatorAvatar} />
            <AvatarFallback>{creatorName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate">{name}</h3>
            <p className="text-muted-foreground text-xs truncate">{creatorName}</p>
            {state === 'scheduled' && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Starts {startsIn ?? 'soon'}
              </p>
            )}
            {state === 'finished' && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {viewerCount} view{viewerCount === 1 ? '' : 's'}
                {endedAgo ? ` • ended ${endedAgo}` : ''}
              </p>
            )}
            {state !== 'scheduled' && state !== 'finished' && category && (
              <Badge variant="secondary" className="text-xs mt-1">
                {category}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveStreamCard;
