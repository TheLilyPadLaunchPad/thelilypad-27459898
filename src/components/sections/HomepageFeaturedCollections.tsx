import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, Sparkles, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { ipfsToHttp } from "@/lib/ipfs";
import {
import { SmartImage } from "@/components/ui/smart-image";
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

interface FeaturedCollection {
  id: string;
  collection_id: string;
  display_order: number;
  collection: {
    id: string;
    name: string;
    image_url: string | null;
    creator_address: string;
    status: string;
    minted: number;
    total_supply: number;
  };
}

export const HomepageFeaturedCollections: React.FC = () => {
  const [collections, setCollections] = useState<FeaturedCollection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchFeaturedCollections();
  }, []);

  const fetchFeaturedCollections = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from("featured_collections")
        .select(`
          id,
          collection_id,
          display_order,
          collection:collections (
            id,
            name,
            image_url,
            creator_address,
            status,
            minted,
            total_supply
          )
        `)
        .eq("feature_type", "homepage")
        .eq("is_active", true)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("display_order", { ascending: true })
        .limit(5);

      if (error) throw error;

      const validCollections = (data || []).filter(
        (item): item is FeaturedCollection => item.collection !== null
      );

      setCollections(validCollections);
    } catch (error) {
      console.error("Error fetching homepage featured collections:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatAddress = (address: string | null) =>
    address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Anonymous";

  if (isLoading) {
    return (
      <section className="py-8">
        <div className="flex items-center gap-2 mb-6">
          <Star className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-bold">Featured Collections</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (collections.length === 0) {
    return null;
  }

  return (
    <section className="py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-primary fill-primary" />
          <h2 className="text-2xl font-bold">Featured Collections</h2>
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" />
            Curated
          </Badge>
        </div>
        <Link to="/marketplace">
          <Button variant="ghost" size="sm" className="gap-1">
            View All
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <Carousel
        opts={{
          align: "start",
          loop: collections.length > 3,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-2 md:-ml-4">
          {collections.map((featured) => (
            <CarouselItem
              key={featured.id}
              className="pl-2 md:pl-4 basis-full sm:basis-1/2 md:basis-1/3 lg:basis-1/4 xl:basis-1/5"
            >
              <Link to={`/collection/${featured.collection.id}`}>
                <Card className="group cursor-pointer overflow-hidden border-2 border-primary/20 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10">
                  <div className="relative aspect-square overflow-hidden">
                    <SmartImage
                      src={ipfsToHttp(featured.collection.image_url) || "/placeholder.svg"}
                      alt={featured.collection.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      displayWidth={480}
                      sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute top-2 left-2">
                      <Badge className="bg-primary/90 text-primary-foreground gap-1">
                        <Star className="h-3 w-3 fill-current" />
                        Featured
                      </Badge>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="font-bold text-white truncate text-lg">
                        {featured.collection.name}
                      </h3>
                      <p className="text-white/70 text-sm truncate">
                        {formatAddress(featured.collection.creator_address)}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {featured.collection.minted}/{featured.collection.total_supply} minted
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            </CarouselItem>
          ))}
        </CarouselContent>
        {collections.length > 3 && (
          <>
            <CarouselPrevious className="hidden md:flex -left-4" />
            <CarouselNext className="hidden md:flex -right-4" />
          </>
        )}
      </Carousel>
    </section>
  );
};

export default HomepageFeaturedCollections;
