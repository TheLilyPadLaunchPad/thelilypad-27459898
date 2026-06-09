import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Music, 
  Disc3, 
  Play, 
  Users, 
  ExternalLink, 
  Twitter, 
  Globe,
  Copy,
  Check,
  ArrowLeft
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MusicNFTCard } from '@/components/music/MusicNFTCard';
import { MusicDetailModal } from '@/components/music/MusicDetailModal';
import { useAudioPlayer } from '@/providers/AudioPlayerProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ProfileSocialHeader } from '@/components/social/ProfileSocialHeader';
import { TopSupportersCard } from '@/components/social/TopSupportersCard';
import { ActivityFeed } from '@/components/social/ActivityFeed';

interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  audioUrl: string;
  coverUrl: string;
  duration?: number;
  genre?: string;
  bpm?: number;
}

interface MusicCollection {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  creator_address: string;
  total_supply: number;
  minted: number;
  phases: any[];
  collection_type: string;
  created_at: string;
  tracks: MusicTrack[];
}

interface ArtistInfo {
  address: string;
  displayName: string;
  avatar?: string;
  banner?: string;
  bio?: string;
  twitter?: string;
  website?: string;
  totalTracks: number;
  totalCollections: number;
  totalMinted: number;
}

export default function ArtistProfile() {
  const { artistAddress } = useParams<{ artistAddress: string }>();
  const [artist, setArtist] = useState<ArtistInfo | null>(null);
  const [collections, setCollections] = useState<MusicCollection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCollection, setSelectedCollection] = useState<MusicCollection | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [artistUserId, setArtistUserId] = useState<string | null>(null);

  const { setQueue } = useAudioPlayer();

  useEffect(() => {
    if (artistAddress) {
      fetchArtistData();
      // Resolve user_id from wallet for social features
      (async () => {
        const { data } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('wallet_address', artistAddress)
          .maybeSingle();
        setArtistUserId((data as any)?.id ?? null);
      })();
    }
  }, [artistAddress]);

  const fetchArtistData = async () => {
    if (!artistAddress) return;
    
    setIsLoading(true);
    try {
      // Fetch all music collections by this creator
      const { data: collectionsData, error } = await supabase
        .from('collections')
        .select('*')
        .eq('creator_address', artistAddress)
        .eq('media_type', 'audio')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch audio metadata and streamer profile
      const collectionsWithTracks = await Promise.all(
        (collectionsData || []).map(async (collection) => {
          const { data: audioData } = await supabase
            .from('collection_audio_metadata')
            .select('*')
            .eq('collection_id', collection.id)
            .order('track_number');

          const tracks: MusicTrack[] = (audioData || []).map((audio: any) => ({
            id: audio.artwork_id,
            name: collection.name,
            artist: audio.artist || 'Unknown Artist',
            audioUrl: audio.audio_url,
            coverUrl: audio.cover_art_url || collection.image_url || '',
            duration: audio.duration_seconds,
            genre: audio.genre,
            bpm: audio.bpm,
          }));

          return {
            id: collection.id,
            name: collection.name,
            description: collection.description,
            image_url: collection.image_url,
            creator_address: collection.creator_address,
            total_supply: collection.total_supply,
            minted: collection.minted,
            phases: Array.isArray(collection.phases) ? collection.phases : [],
            collection_type: collection.collection_type,
            created_at: collection.created_at,
            tracks,
          } as MusicCollection;
        })
      );

      setCollections(collectionsWithTracks);

      // Try to get streamer profile for this address
      type ProfileResult = { display_name: string | null; avatar_url: string | null; banner_url: string | null; bio: string | null; social_twitter: string | null };
      let profileData: ProfileResult | null = null;
      const { data: rawProfile } = await (supabase.from('streamer_profiles') as any)
        .select('display_name, avatar_url, banner_url, bio, social_twitter')
        .eq('wallet_address', artistAddress)
        .maybeSingle();
      profileData = rawProfile as ProfileResult | null;

      // Calculate stats
      const totalTracks = collectionsWithTracks.reduce((acc, c) => acc + c.tracks.length, 0);
      const totalMinted = collectionsWithTracks.reduce((acc, c) => acc + c.minted, 0);

      // Get primary artist name from tracks
      const artistNames = collectionsWithTracks
        .flatMap(c => c.tracks)
        .map(t => t.artist)
        .filter(a => a && a !== 'Unknown Artist');
      const primaryArtistName = artistNames[0] || null;

      setArtist({
        address: artistAddress,
        displayName: profileData?.display_name || primaryArtistName || `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`,
        avatar: profileData?.avatar_url || collectionsWithTracks[0]?.image_url || undefined,
        banner: profileData?.banner_url || undefined,
        bio: profileData?.bio || undefined,
        twitter: profileData?.social_twitter || undefined,
        website: undefined,
        totalTracks,
        totalCollections: collectionsWithTracks.length,
        totalMinted,
      });
    } catch (error) {
      console.error('Error fetching artist data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyAddress = () => {
    if (artistAddress) {
      navigator.clipboard.writeText(artistAddress);
      setCopied(true);
      toast.success('Address copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePlayAll = () => {
    const allTracks = collections.flatMap(c => 
      c.tracks.map(t => ({
        ...t,
        collectionId: c.id,
      }))
    );
    
    if (allTracks.length > 0) {
      setQueue(allTracks, 0);
      toast.success(`Playing ${allTracks.length} tracks`);
    }
  };

  const categorizeCollection = (collection: MusicCollection): 'singles' | 'one_of_one' | 'editions' | 'albums' => {
    const trackCount = collection.tracks.length;
    const supply = collection.total_supply;

    if (trackCount > 1) return 'albums';
    if (supply === 1) return 'one_of_one';
    if (supply <= 10) return 'editions';
    return 'singles';
  };

  const handleCollectionClick = (collection: MusicCollection) => {
    setSelectedCollection(collection);
    setIsDetailOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8 pt-24">
          <Skeleton className="h-48 w-full rounded-xl mb-8" />
          <div className="flex items-center gap-4 mb-8">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8 pt-24 text-center">
          <Music className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h1 className="text-2xl font-bold mb-2">Artist Not Found</h1>
          <p className="text-muted-foreground mb-4">
            This artist hasn't released any music NFTs yet.
          </p>
          <Button asChild>
            <Link to="/music-store">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Music Store
            </Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-16">
        {/* Banner */}
        <div className="relative h-48 md:h-64 bg-gradient-to-br from-primary/20 via-primary/10 to-background overflow-hidden">
          {artist.banner ? (
            <img
              src={artist.banner}
              alt="Artist banner"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Music className="h-24 w-24 text-primary/20" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        </div>

        <div className="container mx-auto px-4">
          {/* Artist Info */}
          <div className="relative -mt-16 mb-8">
            <div className="flex flex-col md:flex-row items-start md:items-end gap-6">
              <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
                <AvatarImage src={artist.avatar} alt={artist.displayName} />
                <AvatarFallback className="text-3xl bg-primary/20">
                  {artist.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h1 className="text-3xl md:text-4xl font-bold">{artist.displayName}</h1>
                  <Badge variant="secondary" className="text-xs">
                    <Music className="h-3 w-3 mr-1" />
                    Artist
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground mb-4">
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {artistAddress?.slice(0, 10)}...{artistAddress?.slice(-8)}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleCopyAddress}
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>

                {artist.bio && (
                  <p className="text-muted-foreground max-w-2xl mb-4">
                    {artist.bio}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {artist.twitter && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={artist.twitter} target="_blank" rel="noopener noreferrer">
                        <Twitter className="h-4 w-4 mr-2" />
                        Twitter
                      </a>
                    </Button>
                  )}
                  {artist.website && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={artist.website} target="_blank" rel="noopener noreferrer">
                        <Globe className="h-4 w-4 mr-2" />
                        Website
                      </a>
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handlePlayAll} disabled={collections.length === 0}>
                  <Play className="h-4 w-4 mr-2" />
                  Play All
                </Button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Releases', value: artist.totalCollections, icon: Disc3 },
              { label: 'Total Tracks', value: artist.totalTracks, icon: Music },
              { label: 'NFTs Minted', value: artist.totalMinted, icon: Users },
              { 
                label: 'Total Supply', 
                value: collections.reduce((acc, c) => acc + c.total_supply, 0), 
                icon: ExternalLink 
              },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <stat.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Releases */}
          <Tabs defaultValue="all" className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Releases</h2>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="latest">Latest</TabsTrigger>
                <TabsTrigger value="popular">Popular</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="all">
              {collections.length === 0 ? (
                <div className="text-center py-16">
                  <Music className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-xl font-semibold mb-2">No releases yet</h3>
                  <p className="text-muted-foreground">
                    This artist hasn't released any music NFTs.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {collections.map((collection, index) => (
                    <motion.div
                      key={collection.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <MusicNFTCard
                        collection={collection}
                        tracks={collection.tracks}
                        category={categorizeCollection(collection)}
                        onClick={() => handleCollectionClick(collection)}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="latest">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {collections.slice(0, 10).map((collection, index) => (
                  <motion.div
                    key={collection.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <MusicNFTCard
                      collection={collection}
                      tracks={collection.tracks}
                      category={categorizeCollection(collection)}
                      onClick={() => handleCollectionClick(collection)}
                    />
                  </motion.div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="popular">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {[...collections]
                  .sort((a, b) => b.minted - a.minted)
                  .slice(0, 10)
                  .map((collection, index) => (
                    <motion.div
                      key={collection.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <MusicNFTCard
                        collection={collection}
                        tracks={collection.tracks}
                        category={categorizeCollection(collection)}
                        onClick={() => handleCollectionClick(collection)}
                      />
                    </motion.div>
                  ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Detail Modal */}
      <MusicDetailModal
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        collection={selectedCollection}
        tracks={selectedCollection?.tracks || []}
      />
    </div>
  );
}
