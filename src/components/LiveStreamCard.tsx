import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Eye, Users, Play, Radio, Youtube } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStreamPresence } from '@/hooks/useStreamPresence';

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
}: LiveStreamCardProps) => {
  const navigate = useNavigate();
  
  // Use real-time presence for active streams
  const { viewerCount: liveViewerCount, isConnected } = useStreamPresence(isActive ? playbackId : undefined);
  
  // Use live count if available, otherwise fall back to prop
  const viewerCount = isActive && isConnected ? liveViewerCount : propViewerCount;

  const handleClick = () => {
    const url = streamType === 'webrtc' 
      ? `/watch/${playbackId}?type=webrtc`
      : `/watch/${playbackId}`;
    navigate(url);
  };

  return (
    <Card 
      className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all group"
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
        
        {/* Live badge */}
        {isActive && (
          <div className="absolute top-2 left-2">
            <Badge variant="destructive" className="gap-1 animate-live-pulse">
              <Radio className="w-2 h-2" />
              LIVE
            </Badge>
          </div>
        )}

        {/* Viewer count */}
        {isActive && (
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
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <Play className="h-16 w-16 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
        </div>
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
            {category && (
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
