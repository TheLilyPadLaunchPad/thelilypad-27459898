import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Music2, Clock, Eye, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MusicTrack } from './MusicMetadataEditor';
import { formatAudioDuration } from '@/hooks/useAudioDuration';

interface Props {
  collectionName: string;
  symbol?: string;
  description: string;
  coverImage: string | null;
  tracks: MusicTrack[];
}

/** Live preview of how a music collection will look on the marketplace before launch. */
export const MusicMarketplacePreview: React.FC<Props> = ({ collectionName, symbol, description, coverImage, tracks }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selected = tracks.find(t => t.id === selectedId) ?? tracks[0];
  const heroCover = coverImage || tracks[0]?.coverPreview || null;
  const totalSeconds = tracks.reduce((s, t) => s + (t.metadata.durationSeconds || 0), 0);
  const artists = [...new Set(tracks.map(t => t.metadata.artist).filter(Boolean))];

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const toggle = (t: MusicTrack) => {
    if (playingId === t.id) { audioRef.current?.pause(); setPlayingId(null); return; }
    audioRef.current?.pause();
    const a = new Audio(t.audioPreview);
    a.onended = () => setPlayingId(null);
    a.play().catch(() => setPlayingId(null));
    audioRef.current = a;
    setPlayingId(t.id);
  };

  const missing: string[] = [];
  if (!collectionName.trim()) missing.push('collection name');
  if (!description.trim()) missing.push('collection description');
  if (!coverImage) missing.push('collection cover');
  const tracksNoDesc = tracks.filter(t => !t.metadata.description.trim()).length;
  const tracksNoArtist = tracks.filter(t => !t.metadata.artist.trim()).length;

  return (
    <Card className="p-4 md:p-5 space-y-5 bg-muted/30">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-primary" />
        <h4 className="font-semibold">Marketplace preview</h4>
        <Badge variant="secondary" className="ml-auto text-xs">Updates as you type</Badge>
      </div>

      {/* Collection header as shown on the marketplace */}
      <div className="flex flex-col sm:flex-row gap-4 rounded-xl border bg-card p-4">
        <div className="w-full sm:w-32 aspect-square rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
          {heroCover ? <img src={heroCover} alt="Collection cover" className="w-full h-full object-cover" /> : <Music2 className="h-10 w-10 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="text-xs">{tracks.length > 1 ? 'Album' : 'Single'}</Badge>
            {symbol && <span className="text-xs font-mono text-muted-foreground">{symbol}</span>}
          </div>
          <h3 className="text-xl font-bold truncate">{collectionName || 'Untitled collection'}</h3>
          <p className="text-sm text-muted-foreground">
            {artists.length ? artists.join(', ') : 'Unknown artist'} · {tracks.length} track{tracks.length === 1 ? '' : 's'}
            {totalSeconds > 0 && ` · ${formatAudioDuration(totalSeconds)}`}
          </p>
          <p className="text-sm line-clamp-3 whitespace-pre-line">{description || <span className="italic text-muted-foreground">No description yet</span>}</p>
        </div>
      </div>

      {tracks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Add tracks to see their cards.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
          {/* Tracklist */}
          <div className="space-y-2">
            {tracks.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={cn('w-full flex items-center gap-3 rounded-lg border bg-card p-2 text-left transition-colors', selected?.id === t.id ? 'border-primary' : 'hover:border-primary/40')}
              >
                <span className="w-5 text-xs font-mono text-muted-foreground">{i + 1}</span>
                <img src={t.coverPreview} alt="" className="w-10 h-10 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{t.metadata.name || 'Untitled track'}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.metadata.artist || 'Unknown artist'}</p>
                </div>
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{formatAudioDuration(t.metadata.durationSeconds || 0)}</span>
              </button>
            ))}
          </div>

          {/* Single NFT card */}
          {selected && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="relative aspect-square bg-muted">
                <img src={selected.coverPreview} alt={selected.metadata.name} className="w-full h-full object-cover" />
                <Button size="icon" className="absolute bottom-3 right-3 rounded-full h-12 w-12 shadow-lg" onClick={() => toggle(selected)} aria-label={playingId === selected.id ? 'Pause' : 'Play'}>
                  {playingId === selected.id ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>
              </div>
              <div className="p-4 space-y-2">
                <p className="text-xs text-muted-foreground truncate">{collectionName || 'Untitled collection'}</p>
                <h5 className="font-semibold truncate">{selected.metadata.name || 'Untitled track'}</h5>
                <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-line">{selected.metadata.description || <span className="italic">No track description yet</span>}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    ['Artist', selected.metadata.artist],
                    ['Genre', selected.metadata.genre],
                    ['BPM', selected.metadata.bpm ? String(selected.metadata.bpm) : ''],
                    ['Album', selected.metadata.album],
                    ['Track', selected.metadata.trackNumber ? `#${selected.metadata.trackNumber}` : ''],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="text-xs font-normal"><span className="text-muted-foreground mr-1">{k}</span>{v}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(missing.length > 0 || tracksNoDesc > 0 || tracksNoArtist > 0) && (
        <div className="flex gap-2 text-xs text-muted-foreground rounded-lg border border-dashed p-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-0.5">
            {missing.length > 0 && <p>Still missing: {missing.join(', ')}.</p>}
            {tracksNoArtist > 0 && <p>{tracksNoArtist} track(s) have no artist.</p>}
            {tracksNoDesc > 0 && <p>{tracksNoDesc} track(s) have no description.</p>}
          </div>
        </div>
      )}
    </Card>
  );
};

export default MusicMarketplacePreview;
