import React from "react";
import { Link } from "react-router-dom";
import { LilyPadLogo } from "@/components/LilyPadLogo";
import { MetaplexBadge } from "@/components/MetaplexBadge";
import { Twitter, MessageCircle, Github } from "lucide-react";

const footerLinks = {
  platform: [
    { label: "Marketplace", href: "/marketplace" },
    { label: "Launchpad", href: "/launchpad" },
    { label: "Streams", href: "/streams" },
    { label: "Streamers", href: "/streamers" },
    { label: "Go Live", href: "/go-live" },
    { label: "Buyback Program", href: "/buyback-program" },
  ],
  legal: [
    { label: "Terms of Service", href: "/terms" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Fees & Pricing", href: "/fees" },
  ],
  resources: [
    { label: "Metaplex Docs", href: "https://developers.metaplex.com" },
    { label: "Metaplex Core", href: "https://developers.metaplex.com/core" },
    { label: "Solana AI Tools", href: "https://github.com/solana-foundation/awesome-solana-ai" },
  ],
};

const socialLinks = [
  { icon: Twitter, label: "Twitter/X", href: "https://x.com/TheLilyPadNFT" },
  { icon: MessageCircle, label: "Discord", href: "https://discord.gg/thelilypad", comingSoon: true },
  { icon: Github, label: "GitHub", href: "https://github.com/thelilypad" },
];

export const Footer: React.FC = () => {
  return (
    <footer className="py-16 border-t border-border/50">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <LilyPadLogo size={40} />
              <span className="font-bold text-xl">The Lily Pad</span>
            </div>
            <p className="text-muted-foreground text-sm">
              The Pinnacle of Creation on Solana
            </p>
          </div>

          {/* Platform links */}
          <div>
            <h4 className="font-semibold mb-4 text-foreground">Platform</h4>
            <ul className="space-y-2">
              {footerLinks.platform.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.href}
                    className="text-muted-foreground hover:text-primary transition-colors text-sm"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold mb-4 text-foreground">Legal</h4>
            <ul className="space-y-2">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  {link.href.startsWith('/') ? (
                    <Link
                      to={link.href}
                      className="text-muted-foreground hover:text-primary transition-colors text-sm"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors text-sm"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold mb-4 text-foreground">Resources</h4>
            <ul className="space-y-2">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Social */}
          <div>
            <h4 className="font-semibold mb-4 text-foreground">Community</h4>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  className="relative group w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center hover:bg-primary/20 transition-colors"
                  title={social.comingSoon ? `${social.label} (Coming Soon)` : social.label}
                >
                  <social.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  {social.comingSoon && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full" />
                  )}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-border/30 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            © 2024 The Lily Pad. All rights reserved.
          </p>
          <MetaplexBadge variant="footer" />
        </div>
      </div>
    </footer>
  );
};
