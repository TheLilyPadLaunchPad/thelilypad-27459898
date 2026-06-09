import { useParams } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { usePublicProfile } from '@/hooks/usePublicProfile';
import { useWalletNFTs, NFT } from '@/hooks/useWalletNFTs';
import { useSEO } from '@/hooks/useSEO';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WalletNFTDetailModal } from '@/components/wallet/WalletNFTDetailModal';
import {
  Lock, Twitter, Youtube, MessageCircle, Instagram, Music2, ExternalLink, Image as ImageIcon, User, Radio, Rocket, Activity, Sparkles
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { ProfileSocialHeader } from '@/components/social/ProfileSocialHeader';
import { TopSupportersCard } from '@/components/social/TopSupportersCard';
import { ActivityFeed } from '@/components/social/ActivityFeed';

const socialIcons: Record<string, typeof Twitter> = {
  twitter: Twitter,
  youtube: Youtube,
  discord: MessageCircle,
  instagram: Instagram,
  tiktok: Music2,
};

export default function PublicProfile() {
  const { identifier } = useParams<{ identifier: string }>();
  const { profile, linkedWallets, loading, error } = usePublicProfile(identifier);
  const [selectedNft, setSelectedNft] = useState<NFT | null>(null);
  const { walletAddress } = useAuth();
  const navigate = useNavigate();

  // Gather all wallet addresses for NFT fetching
  const allAddresses = useMemo(() => {
    if (!profile) return [];
    const addrs = [profile.wallet_address];
    linkedWallets.forEach(w => {
      if (!addrs.includes(w.wallet_address)) addrs.push(w.wallet_address);
    });
    return addrs;
  }, [profile, linkedWallets]);

  const primaryAddress = allAddresses[0] || null;
  const { nfts, isLoading: nftsLoading } = useWalletNFTs(
    profile && !(profile as any).is_private ? primaryAddress : null,
    'solana-mainnet'
  );

  // Fetch active stream
  const { data: liveStream } = useQuery({
    queryKey: ['public-profile-live-stream', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('streams')
        .select('id, title, is_live')
        .eq('user_id', profile!.id)
        .eq('is_live', true)
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.is_streamer && !!profile?.id,
    refetchInterval: 30000
  });

  // Fetch created collections (Launchpad)
  const { data: createdCollections, isLoading: collectionsLoading } = useQuery({
    queryKey: ['public-profile-collections', primaryAddress],
    queryFn: async () => {
      if (!primaryAddress) return [];
      const { data } = await supabase
        .from('collections')
        .select('id, name, image_url, status, minted, total_supply')
        .eq('creator_address', primaryAddress)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!profile?.is_creator && !!primaryAddress
  });

  const displayName = profile?.display_name || profile?.wallet_address?.slice(0, 8) + '...';

  useSEO({
    title: profile ? `${displayName} | The Lily Pad` : 'Profile | The Lily Pad',
    description: profile?.bio || `Check out ${displayName}'s profile on The Lily Pad`,
  });

  const socials = profile ? [
    { key: 'twitter', value: profile.social_twitter },
    { key: 'youtube', value: profile.social_youtube },
    { key: 'discord', value: profile.social_discord },
    { key: 'instagram', value: profile.social_instagram },
    { key: 'tiktok', value: profile.social_tiktok },
  ].filter(s => s.value) : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12 max-w-4xl">
          <Skeleton className="h-48 w-full rounded-xl mb-6" />
          <div className="flex items-center gap-4 mb-8">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-60" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12 max-w-4xl text-center">
          <User className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Profile Not Found</h1>
          <p className="text-muted-foreground">This user doesn't exist or their profile is unavailable.</p>
        </main>
      </div>
    );
  }

  const isOwnProfile = walletAddress && profile && (profile.wallet_address === walletAddress);
  const isPrivate = (profile as any).is_private;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12 max-w-4xl">
        {/* Banner */}
        {profile.banner_url ? (
          <div className="h-48 md:h-56 rounded-xl overflow-hidden mb-6 bg-muted">
            <img
              src={profile.banner_url}
              alt="Banner"
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="h-32 rounded-xl mb-6 bg-gradient-to-r from-primary/20 to-accent/20" />
        )}

        {/* Profile Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8 -mt-12 sm:-mt-14 px-4">
          <div className="relative">
            <Avatar className={`h-24 w-24 border-4 border-background shadow-lg ${liveStream ? 'ring-4 ring-red-500 animate-pulse-slow' : ''}`}>
              <AvatarImage src={profile.avatar_url || undefined} alt={displayName} />
              <AvatarFallback className="text-2xl bg-primary/20 text-primary">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {liveStream && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border-2 border-background shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
              </div>
            )}
          </div>

          <div className="flex-1 mt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold">{displayName}</h1>
                  {profile.is_verified && (
                    <Badge className="bg-primary/20 text-primary border-primary/30">Verified</Badge>
                  )}
                  {profile.is_creator && (
                    <Badge variant="outline" className="text-xs">Creator</Badge>
                  )}
                  {profile.is_streamer && (
                    <Badge variant="outline" className="text-xs">Streamer</Badge>
                  )}
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1">
                    <Sparkles className="w-3 h-3" /> Whitelisted
                  </Badge>
                </div>
                {profile.bio && (
                  <p className="text-muted-foreground mt-1 text-sm max-w-lg">{profile.bio}</p>
                )}
                <ProfileSocialHeader targetUserId={profile.id} className="mt-3" />
              </div>
              <div className="flex gap-2">
                {isOwnProfile && (
                  <Button onClick={() => navigate('/waitroom')} variant="outline" className="border-primary/30 bg-primary/5 hover:bg-primary/10 gap-2 shrink-0">
                    <ImageIcon className="w-4 h-4" /> Whitelisted Pass
                  </Button>
                )}
                {liveStream && (
                  <Button onClick={() => navigate(`/streamer/${profile.id}`)} className="bg-red-500 hover:bg-red-600 text-white gap-2 shrink-0">
                    <Radio className="w-4 h-4" /> Watch Stream
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Socials */}
        {socials.length > 0 && (
          <div className="flex gap-2 mb-8 flex-wrap px-4">
            {socials.map(({ key, value }) => {
              const Icon = socialIcons[key] || ExternalLink;
              return (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  asChild
                >
                  <a
                    href={value!.startsWith('http') ? value! : `https://${value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </a>
                </Button>
              );
            })}
          </div>
        )}

        {/* Linked Wallets Badges */}
        {linkedWallets.length > 0 && (
          <div className="flex gap-2 mb-8 flex-wrap px-4">
            {linkedWallets.map(w => (
              <Badge key={w.id} variant="outline" className="font-mono text-xs">
                {w.chain.toUpperCase()} · {w.wallet_address.slice(0, 6)}...{w.wallet_address.slice(-4)}
              </Badge>
            ))}
          </div>
        )}

        {/* NFT Grid or Private Notice */}
        {isPrivate ? (
          <div className="text-center py-16">
            <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold mb-1">Private Collection</h2>
            <p className="text-muted-foreground text-sm">
              This user has chosen to keep their NFT portfolio private.
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Created Collections */}
            {(profile.is_creator && (createdCollections?.length || collectionsLoading)) ? (
              <div>
                <div className="flex items-center gap-2 mb-4 px-4">
                  <Rocket className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Created Collections</h2>
                  {createdCollections && createdCollections.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{createdCollections.length}</Badge>
                  )}
                </div>
                {collectionsLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="aspect-[3/4] rounded-lg" />)}
                  </div>
                ) : createdCollections && createdCollections.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4">
                    {createdCollections.map(collection => (
                      <button
                        key={collection.id}
                        onClick={() => navigate(`/collection/${collection.id}`)}
                        className="group text-left border border-border/50 rounded-xl overflow-hidden hover:border-primary/50 transition-all hover:shadow-md bg-muted/20 pb-3"
                      >
                        <div className="aspect-square relative overflow-hidden bg-muted mb-3">
                          {collection.image_url ? (
                            <img src={collection.image_url} alt={collection.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                            </div>
                          )}
                          <div className="absolute top-2 right-2">
                            <Badge variant="secondary" className="text-[10px] bg-background/80 backdrop-blur-md">
                              {collection.status === 'live' ? <span className="flex items-center gap-1 text-green-500"><Activity className="w-3 h-3" /> Live</span> : collection.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="px-3">
                          <h3 className="font-semibold text-sm truncate">{collection.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {collection.minted} / {collection.total_supply > 0 ? collection.total_supply : '∞'} Minted
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground px-4">
                    <Rocket className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No collections created yet.</p>
                  </div>
                )}
              </div>
            ) : null}

            {/* Collected NFTs */}
            <div>
              <div className="flex items-center gap-2 mb-4 px-4">
                <ImageIcon className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Collected NFTs</h2>
                {nfts.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{nfts.length}</Badge>
                )}
              </div>

              {nftsLoading ? (
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 px-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-lg" />
                  ))}
                </div>
              ) : nfts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No NFTs to display yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 px-4">
                  {nfts.map(nft => (
                    <button
                      key={nft.tokenId}
                      onClick={() => setSelectedNft(nft)}
                      className="aspect-square rounded-lg overflow-hidden bg-muted border border-border/50 hover:border-primary/50 transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {nft.image ? (
                        <img
                          src={nft.image}
                          alt={nft.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* NFT Detail Modal */}
      {selectedNft && (
        <WalletNFTDetailModal
          nft={selectedNft}
          isOpen={!!selectedNft}
          onClose={() => setSelectedNft(null)}
          network="solana-mainnet"
        />
      )}
    </div>
  );
}
