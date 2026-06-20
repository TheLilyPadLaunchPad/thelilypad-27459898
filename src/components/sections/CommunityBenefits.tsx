import React from "react";
import { Gift, Coins, Ticket, Award, Star } from "lucide-react";

const benefits = [
  {
    icon: Coins,
    title: "Platform Rewards",
    description: "Earn from platform activity and engagement.",
  },
  {
    icon: Ticket,
    title: "Early Raffle Access",
    description: "Get priority entry to exclusive raffles.",
  },
  {
    icon: Award,
    title: "VIP Livestream Badges",
    description: "Stand out in creator streams.",
  },
  {
    icon: Star,
    title: "Exclusive Perks",
    description: "Member-only benefits and features.",
  },
];

export const CommunityBenefits: React.FC = () => {
  return (
    <section className="py-16 relative">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Lily Pad NFT</span> Benefits
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Hold a Lily Pad NFT and unlock exclusive community perks.
          </p>
        </div>

        {/* Benefits grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="glass-card p-5 text-center group hover:border-primary/50 transition-all duration-300 hover:scale-105"
            >
              <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <benefit.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-sm mb-1">{benefit.title}</h3>
              <p className="text-xs text-muted-foreground">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
