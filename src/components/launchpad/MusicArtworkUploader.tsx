import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Music, Image, X, Upload, Play, Pause, Edit2, ChevronUp, ChevronDown, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MusicMetadataEditor, MusicTrack, MusicMetadata } from './MusicMetadataEditor';
import { formatAudioDuration } from '@/hooks/useAudioDuration';

interface MusicArtworkUploaderProps {
  tracks: MusicTrack[];
  onTracksChange: (tracks: MusicTrack[]) => void;
  maxTracks?: number;
  disabled?: boolean;
}

const ACCEPTED_AUDIO_TYPES = {
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/flac': ['.flac'],
  'audio/x-flac': ['.flac'],
};

const ACCEPTED_IMAGE_TYPES = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
};

const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export const MusicArtworkUploader: React.FC<MusicArtworkUploaderProps> = ({
  tracks,
  onTracksChange,
  maxTracks = 100,
  disabled = false,
}) => {
  const [pendingAudioFiles, setPendingAudioFiles] = useState<{ id: string; file: File; preview: string; duration: number }[]>([]);
  const [editingTrack, setEditingTrack] = useState<MusicTrack | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRefs = React.useRef<{ [key: string]: HTMLAudioElement }>({});

  // Audio dropzone
  const onAudioDrop = useCallback(async (acceptedFiles: File[]) => {
    if (tracks.length + acceptedFiles.length > maxTracks) {
      toast.error(`Maximum ${maxTracks} tracks allowed`);
      return;
    }

    const validFiles: { id: string; file: File; preview: string; duration: number }[] = [];
    
    for (const file of acceptedFiles) {
      if (file.size > MAX_AUDIO_SIZE) {
        toast.error(`${file.name} is too large. Maximum size is 50MB`);
        continue;
      }
      
      // Detect duration
      const preview = URL.createObjectURL(file);
      const duration = await detectDuration(preview);
      
      validFiles.push({ id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, file, preview, duration });
    }
    
    if (validFiles.length > 0) {
      setPendingAudioFiles(prev => [...prev, ...validFiles]);
      toast.info(`${validFiles.length} audio file(s) ready. Now add cover art for each track.`);
    }
  }, [tracks.length, maxTracks]);

  const detectDuration = (src: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio(src);
      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration);
      });
      audio.addEventListener('error', () => {
        resolve(0);
      });
    });
  };

  // Cover art dropzone for pending audio
  const onCoverDrop = useCallback((pendingId: string, acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_SIZE) {
      toast.error(`Cover image is too large. Maximum size is 10MB`);
      return;
    }

    const pending = pendingAudioFiles.find(p => p.id === pendingId);
    if (!pending) return;

    const coverPreview = URL.createObjectURL(file);
    const newTrack: MusicTrack = {
      id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      audioFile: pending.file,
      audioPreview: pending.preview,
      coverFile: file,
      coverPreview,
      metadata: {
        name: pending.file.name.replace(/\.[^/.]+$/, ''),
        description: '',
        artist: '',
        album: '',
        trackNumber: tracks.length + 1,
        genre: '',
        bpm: null,
        durationSeconds: pending.duration,
      },
    };

    onTracksChange([...tracks, newTrack]);
    setPendingAudioFiles(prev => prev.filter(p => p.id !== pendingId));
    toast.success('Track added! Click edit to add metadata.');
  }, [pendingAudioFiles, tracks, onTracksChange]);

  const { getRootProps: getAudioRootProps, getInputProps: getAudioInputProps, isDragActive: isAudioDragActive } = useDropzone({
    onDrop: onAudioDrop,
    accept: ACCEPTED_AUDIO_TYPES,
    disabled,
    multiple: true,
  });

  const removeTrack = (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      URL.revokeObjectURL(track.audioPreview);
      URL.revokeObjectURL(track.coverPreview);
    }
    onTracksChange(
      tracks
        .filter(t => t.id !== trackId)
        .map((t, i) => ({ ...t, metadata: { ...t.metadata, trackNumber: i + 1 } }))
    );
  };

  const removePendingAudio = (pendingId: string) => {
    const pending = pendingAudioFiles.find(p => p.id === pendingId);
    if (pending) {
      URL.revokeObjectURL(pending.preview);
    }
    setPendingAudioFiles(prev => prev.filter(p => p.id !== pendingId));
  };

  const togglePlay = (trackId: string, audioSrc: string) => {
    const currentAudio = audioRefs.current[trackId];
    
    // Pause all other tracks
    Object.entries(audioRefs.current).forEach(([id, audio]) => {
      if (id !== trackId && audio) {
        audio.pause();
      }
    });

    if (!currentAudio) {
      const audio = new Audio(audioSrc);
      audio.addEventListener('ended', () => setPlayingTrackId(null));
      audioRefs.current[trackId] = audio;
      audio.play();
      setPlayingTrackId(trackId);
    } else if (playingTrackId === trackId) {
      currentAudio.pause();
      setPlayingTrackId(null);
    } else {
      currentAudio.play();
      setPlayingTrackId(trackId);
    }
  };

  const handleMetadataSave = (updatedTrack: MusicTrack) => {
    onTracksChange(tracks.map(t => t.id === updatedTrack.id ? updatedTrack : t));
  };

  const moveTrack = (fromIndex: number, toIndex: number) => {
    const newTracks = [...tracks];
    const [removed] = newTracks.splice(fromIndex, 1);
    newTracks.splice(toIndex, 0, removed);
    // Update track numbers
    const updatedTracks = newTracks.map((track, index) => ({
      ...track,
      metadata: { ...track.metadata, trackNumber: index + 1 },
    }));
    onTracksChange(updatedTracks);
  };

  return (
    <div className="space-y-6">
      {/* Audio Upload Zone */}
      <div
        {...getAudioRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
          isAudioDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getAudioInputProps()} />
        <Music className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-lg font-medium mb-2">
          {isAudioDragActive ? "Drop audio files here" : "Drag & drop audio files"}
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          or click to browse • MP3, WAV, FLAC up to 50MB
        </p>
        <Button variant="outline" disabled={disabled}>
          <Upload className="h-4 w-4 mr-2" />
          Select Audio Files
        </Button>
      </div>

      {/* Pending Audio Files (need cover art) */}
      {pendingAudioFiles.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            Pending - Add Cover Art ({pendingAudioFiles.length})
          </h4>
          
          {pendingAudioFiles.map((pending) => (
            <PendingAudioCard
              key={pending.id}
              file={pending.file}
              preview={pending.preview}
              duration={pending.duration}
              onCoverDrop={(files) => onCoverDrop(pending.id, files)}
              onRemove={() => removePendingAudio(pending.id)}
            />
          ))}
        </div>
      )}

      {/* Added Tracks */}
      {tracks.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium">
            Tracks ({tracks.length})
          </h4>
          
          <div className="space-y-3">
            {tracks.map((track, index) => (
              <TrackCard
                key={track.id}
                track={track}
                index={index}
                isPlaying={playingTrackId === track.id}
                onPlay={() => togglePlay(track.id, track.audioPreview)}
                onEdit={() => setEditingTrack(track)}
                onRemove={() => removeTrack(track.id)}
                onMoveUp={index > 0 ? () => moveTrack(index, index - 1) : undefined}
                onMoveDown={index < tracks.length - 1 ? () => moveTrack(index, index + 1) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Metadata Editor */}
      <MusicMetadataEditor
        track={editingTrack}
        open={!!editingTrack}
        onOpenChange={(open) => !open && setEditingTrack(null)}
        onSave={handleMetadataSave}
      />
    </div>
  );
};

// Pending Audio Card Component
interface PendingAudioCardProps {
  file: File;
  preview: string;
  duration: number;
  onCoverDrop: (files: File[]) => void;
  onRemove: () => void;
}

const PendingAudioCard: React.FC<PendingAudioCardProps> = ({
  file,
  preview,
  duration,
  onCoverDrop,
  onRemove,
}) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onCoverDrop,
    accept: ACCEPTED_IMAGE_TYPES,
    multiple: false,
  });

  return (
    <Card className="p-4 border-amber-500/50 bg-amber-500/5">
      <div className="flex items-center gap-4">
        <div
          {...getRootProps()}
          className={cn(
            "w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all",
            isDragActive ? "border-primary bg-primary/10" : "border-muted-foreground/30 hover:border-primary"
          )}
        >
          <input {...getInputProps()} />
          <Image className="h-6 w-6 text-muted-foreground" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{file.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatAudioDuration(duration)} • {(file.size / (1024 * 1024)).toFixed(1)}MB
          </p>
          <p className="text-xs text-amber-600 mt-1">
            ⬅️ Drop or click to add cover art
          </p>
        </div>
        
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
};

// Track Card Component
interface TrackCardProps {
  track: MusicTrack;
  index: number;
  isPlaying: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

const TrackCard: React.FC<TrackCardProps> = ({
  track,
  index,
  isPlaying,
  onPlay,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
}) => {
  const isComplete = track.metadata.name && track.metadata.artist;

  return (
    <Card className={cn(
      "p-4 transition-all",
      !isComplete && "border-amber-500/50"
    )}>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            aria-label="Move track up"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <span className="text-xs font-mono">{index + 1}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            aria-label="Move track down"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="relative group">
          <img
            src={track.coverPreview}
            alt={track.metadata.name || 'Cover'}
            className="w-14 h-14 rounded-lg object-cover"
          />
          <button
            onClick={onPlay}
            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 text-white" />
            ) : (
              <Play className="h-6 w-6 text-white" />
            )}
          </button>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">
              {track.metadata.name || 'Untitled Track'}
            </p>
            {!isComplete && (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                Needs metadata
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {track.metadata.artist || 'Unknown Artist'}
            {track.metadata.album && ` • ${track.metadata.album}`}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span>{formatAudioDuration(track.metadata.durationSeconds || 0)}</span>
            {track.metadata.genre && <Badge variant="secondary" className="text-xs">{track.metadata.genre}</Badge>}
            {track.metadata.bpm && <span>{track.metadata.bpm} BPM</span>}
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default MusicArtworkUploader;
