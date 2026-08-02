import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Radio, Sparkles, Loader2, Image as ImageIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ipfsToHttp } from "@/lib/ipfs";
import { getCurrencySymbol } from "@/lib/chainUtils";
import { SmartImage } from "@/components/ui/smart-image";

interface Collection {
  id: string;
  name: string;
  creator_address: string;
  image_url: string | null;
  status: string;
  minted: number;
  total_supply: number;
  phases: unknown;
  chain: string;
}

export const MarketplacePreview: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch real collections from database
  const { data: collections, isLoading } = useQuery({
    queryKey: ['marketplace-preview-collections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collections')
        .select('id, name, creator_address, image_url, status, minted, total_supply, phases, chain')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) throw error;
      return data as Collection[];
    },
  });

  // Real-time subscription for collections changes
  useEffect(() => {
    const channel = supabase
      .channel('marketplace-preview-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'collections'
        },
        () => {
          // Invalidate and refetch when any collection changes
          queryClient.invalidateQueries({ queryKey: ['marketplace-preview-collections'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const getPrice = (collection: Collection) => {
    const phases = collection.phases as any[];
    if (!phases || phases.length === 0) return "TBA";
    const publicPhase = phases.find(p => p.id === "public") || phases[0];
    if (!publicPhase?.price || parseFloat(publicPhase.price) === 0) return "Free";
    return `${publicPhase.price} ${getCurrencySymbol(collection.chain)}`;
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <section className="py-16 relative">
      {/* Background accent */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-secondary/5 to-transparent" />

      <div className="container mx-auto px-6 relative">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Explore the <span className="gradient-text">Marketplace</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Discover, collect, and trade premium NFT collections on Solana.
          </p>
        </div>

        {/* Collections grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : collections && collections.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map((collection, index) => (
              <div
                key={collection.id}
                onClick={() => navigate(`/launchpad/${collection.id}`)}
                className="group glass-card overflow-hidden hover:border-primary/50 transition-all duration-500 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10 cursor-pointer animate-fade-in"
                style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'backwards' }}
              >
                {/* Image area */}
                <div className="aspect-square bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative overflow-hidden">
                  {collection.image_url ? (
                    <SmartImage
                      src={ipfsToHttp(collection.image_url)}
                      alt={collection.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      displayWidth={480}
                      sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
                    />
                  ) : (
                    <ImageIcon className="w-16 h-16 text-muted-foreground" />
                  )}

                  {/* Live badge */}
                  {collection.status === 'live' && (
                    <div className="absolute top-4 left-4 flex items-center gap-2 bg-destructive/90 text-destructive-foreground px-3 py-1 rounded-full text-xs font-semibold">
                      <Radio className="w-3 h-3" />
                      LIVE
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>

                {/* Info */}
                <div className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-lg group-hover:text-primary transition-colors">
                        {collection.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        by {formatAddress(collection.creator_address)}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between text-sm">
                    <div>
                      <span className="text-muted-foreground">Price</span>
                      <p className="font-semibold text-primary">{getPrice(collection)}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-muted-foreground">Minted</span>
                      <p className="font-semibold">{collection.minted}/{collection.total_supply}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No collections yet. Be the first to create one!</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate('/launchpad')}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Create Collection
            </Button>
          </div>
        )}

        {/* CTA */}
        {collections && collections.length > 0 && (
          <div className="text-center mt-12">
            <Button
              variant="outline"
              size="lg"
              className="group"
              onClick={() => navigate('/marketplace')}
            >
              Explore All Collections
              <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};
