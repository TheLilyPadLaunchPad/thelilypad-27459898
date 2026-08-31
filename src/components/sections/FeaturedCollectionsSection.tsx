import React from "react";
import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { FeaturedCollectionsSlideshow } from "./FeaturedCollectionsSlideshow";
import { CuratedCategoryRail } from "./CuratedCategoryRail";
import { CURATION_CATEGORIES } from "@/config/curation";

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
            Hand-Picked Launches
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
            Every project below is selected by The Lily Pad team — featured art drops,
            utility projects, and memecoin collections across Solana, XRPL and Monad.
          </p>
        </motion.div>

        {/* Collection of the Month (kept) */}
        <FeaturedCollectionsSlideshow
          featureType="monthly"
          title="Collection of the Month"
          subtitle="Our top pick for this month"
          icon={<Crown className="w-5 h-5" />}
          gradientFrom="from-amber-500/20"
          gradientTo="to-orange-500/20"
          autoPlayInterval={6000}
        />

        {/* Curated category rails */}
        <div className="mt-6 divide-y divide-border/60">
          {CURATION_CATEGORIES.map((meta) => (
            <CuratedCategoryRail
              key={meta.id}
              meta={meta}
              viewAllHref={`/marketplace?category=${meta.id}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
