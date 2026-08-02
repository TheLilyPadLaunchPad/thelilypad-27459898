import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import presentationCardAsset from "@/assets/lilypad-presentation-card.png.asset.json";
const presentationCard = presentationCardAsset.url;

export const PresentationCard: React.FC = () => {
  const containerRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  // Parallax transforms
  const y = useTransform(scrollYProgress, [0, 1], [100, -100]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.9, 1.05, 0.95]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.5, 1, 1, 0.5]);
  const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], [10, 0, -10]);

  return (
    <section
      ref={containerRef}
      className="relative py-16 sm:py-20 md:py-24 overflow-hidden"
    >
      {/* Background subtle gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />

      {/* Floating background elements with parallax */}
      <motion.div
        className="absolute top-1/4 left-1/6 w-64 h-64 bg-primary/10 rounded-full blur-3xl"
        style={{ y: useTransform(scrollYProgress, [0, 1], [50, -150]) }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/6 w-80 h-80 bg-secondary/10 rounded-full blur-3xl"
        style={{ y: useTransform(scrollYProgress, [0, 1], [-50, 150]) }}
      />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <motion.div
          className="flex justify-center perspective-1000"
          style={{ y, scale, opacity }}
        >
          <motion.div
            className="relative group"
            style={{ rotateX }}
          >
            {/* Glow effect behind card */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-br from-primary/30 via-secondary/20 to-primary/30 blur-3xl rounded-3xl scale-110"
              style={{
                opacity: useTransform(scrollYProgress, [0.2, 0.5, 0.8], [0, 0.8, 0])
              }}
            />

            {/* Card image with 3D effect */}
            <motion.img
              src={presentationCard}
              alt="The Lily Pad - NFT Launchpad on Solana"
              className="relative w-full max-w-4xl rounded-2xl shadow-2xl shadow-primary/20 border border-border/50"
              whileHover={{
                scale: 1.02,
                rotateY: 5,
                transition: { duration: 0.3 }
              }}
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default PresentationCard;
