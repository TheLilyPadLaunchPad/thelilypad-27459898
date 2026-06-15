import React from "react";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/sections/HeroSection";
import { FeaturedCollectionsSection } from "@/components/sections/FeaturedCollectionsSection";
import { TopCollectionsHighlights } from "@/components/sections/TopCollectionsHighlights";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { MarketplacePreview } from "@/components/sections/MarketplacePreview";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { FeaturedCardStack } from "@/components/sections/FeaturedCardStack";
import { TestimonialsSection } from "@/components/sections/TestimonialsSection";
import { Footer } from "@/components/sections/Footer";
import { useSEO } from "@/hooks/useSEO";


const Index: React.FC = () => {
  useSEO({
    title: "The Lily Pad | NFT Launchpad & Live Streaming Platform on Solana",
    description: "Launch NFT collections and stream live on Solana blockchain. Create, mint, and trade digital collectibles with built-in creator tools and community features.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "The Lily Pad",
      "url": "https://thelilypad.app",
      "description": "NFT Launchpad & Live Streaming Platform on Solana blockchain",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://thelilypad.app/streamers?q={search_term_string}",
        "query-input": "required name=search_term_string"
      },
      "publisher": {
        "@type": "Organization",
        "name": "The Lily Pad",
        "url": "https://thelilypad.app",
        "logo": "https://thelilypad.app/favicon.ico"
      }
    }
  });
  return (
    <main className="min-h-screen bg-background overflow-x-hidden pb-24 md:pb-0">
      <Navbar />
      <HeroSection />
      <FeaturedCardStack />
      <FeaturedCollectionsSection />
      <TopCollectionsHighlights />
      <FeaturesSection />
      <MarketplacePreview />
      <HowItWorks />
      <TestimonialsSection />
      <Footer />
    </main>
  );
};

export default Index;
