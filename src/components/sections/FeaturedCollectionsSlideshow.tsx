import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Crown, Calendar, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ipfsToHttp } from "@/lib/ipfs";
import { SmartImage } from "@/components/ui/smart-image";

interface FeaturedCollection {
  id: string;
  collection_id: string;
  display_order: number;
  collection: {
    id: string;
    name: string;
    image_url: string | null;
    description: string | null;
    symbol: string;
    total_supply: number;
    minted: number;
    creator_address: string;
  };
}

interface FeaturedCollectionsSlideshowProps {
  featureType: "monthly" | "weekly" | "homepage";
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  gradientFrom: string;
  gradientTo: string;
  autoPlayInterval?: number;
}

export const FeaturedCollectionsSlideshow: React.FC<FeaturedCollectionsSlideshowProps> = ({
  featureType,
  title,
  subtitle,
  icon,
  gradientFrom,
  gradientTo,
  autoPlayInterval = 5000,
}) => {
  const [collections, setCollections] = useState<FeaturedCollection[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    fetchFeaturedCollections();
  }, [featureType]);

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
            description,
            symbol,
            total_supply,
            minted,
            creator_address
          )
        `)
        .eq("feature_type", featureType)
        .eq("is_active", true)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("display_order", { ascending: true });

      if (error) throw error;

      // Filter out any entries where collection is null (deleted collections)
      const validCollections = (data || []).filter(
        (item): item is FeaturedCollection => item.collection !== null
      );

      setCollections(validCollections);
    } catch (error) {
      console.error("Error fetching featured collections:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const nextSlide = useCallback(() => {
    if (collections.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % collections.length);
  }, [collections.length]);

  const prevSlide = useCallback(() => {
    if (collections.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + collections.length) % collections.length);
  }, [collections.length]);

  // Auto-play functionality
  useEffect(() => {
    if (collections.length <= 1 || isPaused) return;

    const interval = setInterval(nextSlide, autoPlayInterval);
    return () => clearInterval(interval);
  }, [collections.length, isPaused, nextSlide, autoPlayInterval]);

  if (isLoading) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm">
        <div className={`absolute inset-0 bg-gradient-to-br ${gradientFrom} ${gradientTo} opacity-30`} />
        <div className="relative p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <div>
              <Skeleton className="h-6 w-40 mb-2" />
              <Skeleton className="h-4 w-60" />
            </div>
          </div>
          <Skeleton className="w-full h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (collections.length === 0) {
    return null; // Don't render if no featured collections
  }

  const currentCollection = collections[currentIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Gradient Background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradientFrom} ${gradientTo} opacity-30`} />

      <div className="relative p-6 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-background/80 text-primary">
              {icon}
            </div>
            <div>
              <h3 className="font-bold text-xl text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>

          {/* Navigation Controls */}
          {collections.length > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-background/50 hover:bg-background/80"
                onClick={prevSlide}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[3rem] text-center">
                {currentIndex + 1} / {collections.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-background/50 hover:bg-background/80"
                onClick={nextSlide}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Slideshow Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentCollection.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
          >
            <Link to={`/collection/${currentCollection.collection.id}`}>
              <Card className="overflow-hidden border-border/30 bg-background/50 hover:bg-background/80 transition-all duration-300 group cursor-pointer">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row">
                    {/* Collection Image */}
                    <div className="relative w-full md:w-80 h-48 md:h-64 overflow-hidden">
                      {currentCollection.collection.image_url ? (
                        <SmartImage
                          src={ipfsToHttp(currentCollection.collection.image_url)}
                          alt={currentCollection.collection.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          displayWidth={640}
                          sizes="(max-width: 768px) 100vw, 320px"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <span className="text-4xl font-bold text-muted-foreground">
                            {currentCollection.collection.symbol?.slice(0, 2) || "?"}
                          </span>
                        </div>
                      )}
                      {/* Featured Badge */}
                      <Badge className="absolute top-3 left-3 bg-primary/90 text-primary-foreground">
                        <Sparkles className="w-3 h-3 mr-1" />
                        Featured
                      </Badge>
                    </div>

                    {/* Collection Info */}
                    <div className="flex-1 p-6 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-2xl text-foreground mb-2 group-hover:text-primary transition-colors">
                          {currentCollection.collection.name}
                        </h4>
                        <p className="text-muted-foreground line-clamp-3 mb-4">
                          {currentCollection.collection.description || "A unique NFT collection on The Lily Pad."}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-4">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Supply: </span>
                          <span className="font-semibold text-foreground">
                            {currentCollection.collection.total_supply.toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Minted: </span>
                          <span className="font-semibold text-primary">
                            {currentCollection.collection.minted.toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Progress: </span>
                          <span className="font-semibold text-foreground">
                            {currentCollection.collection.total_supply > 0
                              ? Math.round((currentCollection.collection.minted / currentCollection.collection.total_supply) * 100)
                              : 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        </AnimatePresence>

        {/* Dot Indicators */}
        {collections.length > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            {collections.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${index === currentIndex
                    ? "bg-primary w-6"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
