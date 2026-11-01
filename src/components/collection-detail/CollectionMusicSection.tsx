import { useEffect, useState } from 'react';
import { Music2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { collectionMusicTracks } from '@/lib/collectionMusic';
import { formatAudioDuration } from '@/hooks/useAudioDuration';

interface Props {
  collection: { id: string; name: string; image_url: string | null; artworks_metadata?: unknown };
}

export function CollectionMusicSection({ collection }: Props) {
  const [tracks, setTracks] = useState<ReturnType<typeof collectionMusicTracks>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    supabase.from('collection_audio_metadata').select('*').eq('collection_id', collection.id).order('track_number')
      .then(({ data, error: queryError }) => {
        if (!active) return;
        setError(Boolean(queryError));
        setTracks(collectionMusicTracks(collection, data || []));
        setLoading(false);
      });
    return () => { active = false; };
  }, [collection.id, collection.artworks_metadata, collection.name, collection.image_url, attempt]);

  const selected = tracks.find(track => track.id === selectedId) || tracks[0];
  return (
    <section aria-label="Collection music" className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2"><Music2 className="h-5 w-5 text-primary" />Tracks</h2>
      {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading tracks" /> : error ? (
        <div className="space-y-2"><p className="text-sm text-muted-foreground">Tracks couldn’t be loaded.</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>
      ) : !selected ? <p className="text-sm text-muted-foreground">No published audio tracks yet.</p> : (
        <>
          <div className="flex items-start gap-4">
            {selected.coverUrl && <img src={selected.coverUrl} alt={selected.name} className="h-24 w-24 rounded-lg object-cover shrink-0" />}
            <div className="min-w-0 space-y-2 flex-1">
              <h3 className="font-semibold break-words">{selected.name}</h3>
              <p className="text-sm text-muted-foreground">{selected.artist}</p>
              <div className="flex flex-wrap gap-2">
                {selected.genre && <Badge variant="outline">{selected.genre}</Badge>}
                {selected.bpm != null && <Badge variant="outline">{selected.bpm} BPM</Badge>}
                {selected.duration != null && <Badge variant="secondary">{formatAudioDuration(selected.duration)}</Badge>}
              </div>
            </div>
          </div>
          {selected.description && <p className="text-sm whitespace-pre-line break-words">{selected.description}</p>}
          <audio key={selected.id} controls preload="metadata" src={selected.audioUrl} className="w-full" aria-label={`Audio for ${selected.name}`}
            onPlay={() => { document.querySelectorAll('audio').forEach(audio => { if (audio.src !== selected.audioUrl) audio.pause(); }); }} />
          <div className="divide-y divide-border">
            {tracks.map((track, index) => (
              <Button key={track.id} type="button" variant="ghost" aria-pressed={track.id === selected.id} onClick={() => setSelectedId(track.id)}
                className="w-full h-auto justify-start gap-3 rounded-none py-3 text-left">
                <span className="w-5 shrink-0 text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{track.name}</span><span className="block truncate text-xs text-muted-foreground">{track.artist}</span></span>
                {track.duration != null && <span className="text-xs text-muted-foreground shrink-0">{formatAudioDuration(track.duration)}</span>}
              </Button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}