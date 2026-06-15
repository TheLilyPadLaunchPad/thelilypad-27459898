import React from "react";
import { motion } from "framer-motion";
import { Crown, Calendar, Home } from "lucide-react";
import { FeaturedCollectionsSlideshow } from "./FeaturedCollectionsSlideshow";
import { HomepageFeaturedCollections } from "./HomepageFeaturedCollections";

export const FeaturedCollectionsSection: React.FC = () => {
  return (
    <section className="relative py-10 sm:py-16 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/10 to-background" />

      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <motion.div
          className="text-center mb-8 md:mb-12"
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground mb-2 md:mb-4">
            Featured Collections
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
            Hand-picked NFT collections chosen by The Lily Pad team
          </p>
        </motion.div>

        {/* Homepage Featured Carousel - Admin curated (up to 5) */}
        <div className="mb-8">
          <HomepageFeaturedCollections />
        </div>

        {/* Slideshows Container */}
        <div className="space-y-8">
          {/* Monthly Featured */}
          <FeaturedCollectionsSlideshow
            featureType="monthly"
            title="Collection of the Month"
            subtitle="Our top pick for this month"
            icon={<Crown className="w-5 h-5" />}
            gradientFrom="from-amber-500/20"
            gradientTo="to-orange-500/20"
            autoPlayInterval={6000}
          />

          {/* Weekly Featured */}
          <FeaturedCollectionsSlideshow
            featureType="weekly"
            title="Weekly Spotlight"
            subtitle="This week's highlighted collections"
            icon={<Calendar className="w-5 h-5" />}
            gradientFrom="from-violet-500/20"
            gradientTo="to-purple-500/20"
            autoPlayInterval={4000}
          />
        </div>
      </div>
    </section>
  );
};
