import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Layers,
  Radio,
  Trophy,
  Gavel,
  Gift,
  Music,
  ArrowRight,
  Zap,
  Star,
  Shield,
  Rocket
} from "lucide-react";

interface Feature {
  id: string;
  icon: string | any;
  title: string;
  description: string;
  bullets: string[];
  cta: string;
  href: string;
  imagePosition: "left" | "right" | string;
  accent: "primary" | "secondary" | "accent" | string;
  image_url?: string | null;
}

const ICON_MAP: Record<string, any> = {
  Layers,
  Radio,
  Trophy,
  Gavel,
  Gift,
  Music,
  Zap,
  Star,
  Shield,
  Rocket
};

const defaultFeatures: Feature[] = [
  {
    id: "generator",
    icon: "Layers",
    title: "NFT Generator Studio",
    description: "Create stunning generative art collections with our powerful no-code generator. Powered by Metaplex Core for maximum performance.",
    bullets: ["Layer uploads", "Rarity tools", "Metadata builder", "Preview engine", "One-click Solana deployment", "Powered by Metaplex Core"],
    cta: "Try Generator",
    href: "/launchpad",
    imagePosition: "left",
    accent: "primary",
  },
  {
    id: "streams",
    icon: "Radio",
    title: "Creator Livestreams",
    description: "Go live and connect with your community. Host reveals, auctions, Q&As, and accept tips.",
    bullets: ["Live streaming", "Real-time chat", "Tip system", "Auction integration", "Community building"],
    cta: "Go Live",
    href: "/go-live",
    imagePosition: "right",
    accent: "secondary",
  },
  {
    id: "rewards",
    icon: "Trophy",
    title: "Creator Rewards System",
    description: "Earn from your activity, engagement, and volume on the platform.",
    bullets: ["Activity rewards", "Volume bonuses", "Tier progression", "Exclusive perks", "Leaderboard rankings"],
    cta: "View Rewards",
    href: "/dashboard",
    imagePosition: "left",
    accent: "accent",
  },
  {
    id: "auctions",
    icon: "Gavel",
    title: "Auctions Hub",
    description: "Multiple auction formats to maximize your sales potential.",
    bullets: ["Timed auctions", "Dutch auctions", "English auctions", "Livestream-linked", "Reserve prices"],
    cta: "Run an Auction",
    href: "/marketplace",
    imagePosition: "right",
    accent: "primary",
  },
  {
    id: "raffles",
    icon: "Gift",
    title: "Raffles & Blind Boxes",
    description: "Create excitement with mystery mechanics and fair raffles.",
    bullets: ["Customizable raffles", "Blind box reveals", "Multiple winners", "Entry limits", "Fair randomization"],
    cta: "Start a Raffle",
    href: "/launchpad",
    imagePosition: "left",
    accent: "secondary",
  },
  {
    id: "media",
    icon: "Music",
    title: "Audio/Music/Video NFTs",
    description: "Mint and sell multimedia NFTs with full playback support.",
    bullets: ["Audio NFTs", "Music collections", "Video content", "Cover art required", "Streaming preview"],
    cta: "Mint Audio/Video",
    href: "/launchpad",
    imagePosition: "left",
    accent: "primary",
  },
];

const getAccentColors = (accent: string) => {
  switch (accent) {
    case "primary":
      return "from-primary/30 to-primary/5 border-primary/30";
    case "secondary":
      return "from-secondary/30 to-secondary/5 border-secondary/30";
    case "accent":
      return "from-accent/30 to-accent/5 border-accent/30";
    default:
      return "from-primary/30 to-primary/5 border-primary/30";
  }
};

export const FeaturesSection: React.FC = () => {
  const [features, setFeatures] = useState<Feature[]>(defaultFeatures);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // NOTE: The landing_page_features table doesn't exist yet
    // Using default features for now. This can be enabled when the table is created.
    setLoading(false);
  }, []);

  return (
    <section className="py-16 relative">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Powerful <span className="gradient-text">Features</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Everything you need to launch, grow, and monetize your NFT collections.
          </p>
        </div>

        {/* Feature blocks */}
        <div className="space-y-24">
          {features.map((feature, index) => {
            const IconComponent = ICON_MAP[feature.icon] || Layers;

            return (
              <div
                key={feature.id}
                className={`flex flex-col ${feature.imagePosition === "right" ? "lg:flex-row" : "lg:flex-row-reverse"
                  } gap-8 items-center`}
              >
                {/* Content side */}
                <div className="flex-1 space-y-6">
                  <div className={`inline-flex items-center gap-3 px-4 py-2 rounded-full bg-gradient-to-r ${getAccentColors(feature.accent)} border`}>
                    <IconComponent className="w-5 h-5" />
                    <span className="font-semibold text-sm">{feature.title}</span>
                  </div>

                  <h3 className="text-3xl md:text-4xl font-bold">{feature.title}</h3>

                  <p className="text-muted-foreground text-lg">{feature.description}</p>

                  <ul className="space-y-3">
                    {feature.bullets.map((bullet, i) => (
                      <li key={i} className="flex items-center gap-3 text-foreground/80">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {bullet}
                      </li>
                    ))}
                  </ul>

                  <Button variant="default" className="group mt-4" asChild>
                    <Link to={feature.href}>
                      {feature.cta}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                </div>

                {/* Visual side */}
                <div className="flex-1 w-full">
                  {feature.image_url ? (
                    <div className="glass-card p-4 aspect-video flex items-center justify-center overflow-hidden">
                      <img
                        src={feature.image_url}
                        alt={feature.title}
                        className="w-full h-full object-cover rounded-xl hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  ) : (
                    <div className="glass-card p-8 aspect-video flex items-center justify-center">
                      <div className={`w-32 h-32 rounded-2xl bg-gradient-to-br ${getAccentColors(feature.accent)} flex items-center justify-center`}>
                        <IconComponent className="w-16 h-16 text-foreground/50" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
