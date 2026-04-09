import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, PartyPopper, ChevronLeft, ChevronRight, X, Volume2, VolumeX, Flame, Snowflake, Star } from "lucide-react";
import confetti from "canvas-confetti";
import { useRevealSounds } from "@/hooks/useRevealSounds";
import { SAFE_COLORS } from "@/lib/safeStyle";

export type RevealTheme = "magic" | "fire" | "ice" | "galaxy";

interface RevealedNFT {
  id: string;
  token_id: number;
  name: string | null;
  image_url: string | null;
}

interface NFTRevealAnimationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nfts: RevealedNFT[];
  unrevealedImage: string | null;
  collectionName: string;
  theme?: RevealTheme;
}

const THEME_CONFIG = {
  magic: {
    icon: Sparkles,
    colors: {
      border: "border-amber-500/50",
      shadow: "shadow-amber-500/20",
      revealedBorder: "border-primary/50",
      revealedShadow: "shadow-primary/20",
      badgeBg: "bg-amber-500/90",
      badgeText: "text-amber-50",
      iconBg: "from-primary/20 to-accent/20",
      iconColor: "text-primary",
      particleColor: "bg-primary",
      glowColor: "from-primary/40",
    },
    confettiColors: [
      ["#a855f7", "#6366f1", "#14b8a6"],
      ["#f59e0b", "#10b981", "#3b82f6"],
      ["#ec4899", "#8b5cf6", "#06b6d4"],
    ],
    shimmerColor: "via-white/30",
    label: "Revealing...",
  },
  fire: {
    icon: Flame,
    colors: {
      border: "border-orange-500/50",
      shadow: "shadow-orange-500/30",
      revealedBorder: "border-red-500/50",
      revealedShadow: "shadow-red-500/30",
      badgeBg: "bg-orange-600/90",
      badgeText: "text-orange-50",
      iconBg: "from-orange-500/20 to-red-500/20",
      iconColor: "text-orange-500",
      particleColor: "bg-orange-500",
      glowColor: "from-orange-500/40",
    },
    confettiColors: [
      ["#f97316", "#ef4444", "#fbbf24"],
      ["#dc2626", "#f59e0b", "#ea580c"],
      ["#fb923c", "#f43f5e", "#fcd34d"],
    ],
    shimmerColor: "via-orange-300/40",
    label: "Igniting...",
  },
  ice: {
    icon: Snowflake,
    colors: {
      border: "border-cyan-400/50",
      shadow: "shadow-cyan-400/30",
      revealedBorder: "border-blue-400/50",
      revealedShadow: "shadow-blue-400/30",
      badgeBg: "bg-cyan-500/90",
      badgeText: "text-cyan-50",
      iconBg: "from-cyan-400/20 to-blue-500/20",
      iconColor: "text-cyan-400",
      particleColor: "bg-cyan-400",
      glowColor: "from-cyan-400/40",
    },
    confettiColors: [
      ["#22d3ee", "#38bdf8", "#a5f3fc"],
      ["#0ea5e9", "#67e8f9", "#bae6fd"],
      ["#06b6d4", "#7dd3fc", "#e0f2fe"],
    ],
    shimmerColor: "via-cyan-200/50",
    label: "Shattering...",
  },
  galaxy: {
    icon: Star,
    colors: {
      border: "border-violet-500/50",
      shadow: "shadow-violet-500/30",
      revealedBorder: "border-fuchsia-500/50",
      revealedShadow: "shadow-fuchsia-500/30",
      badgeBg: "bg-violet-600/90",
      badgeText: "text-violet-50",
      iconBg: "from-violet-500/20 to-fuchsia-500/20",
      iconColor: "text-violet-400",
      particleColor: "bg-violet-400",
      glowColor: "from-violet-500/40",
    },
    confettiColors: [
      ["#a855f7", "#d946ef", "#8b5cf6"],
      ["#c084fc", "#e879f9", "#a78bfa"],
      ["#7c3aed", "#f0abfc", "#ddd6fe"],
    ],
    shimmerColor: "via-fuchsia-300/40",
    label: "Warping...",
  },
};

export function NFTRevealAnimation({
  open,
  onOpenChange,
  nfts,
  unrevealedImage,
  collectionName,
  theme = "magic",
}: NFTRevealAnimationProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [hasTriggeredConfetti, setHasTriggeredConfetti] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const hasPlayedFlipSound = useRef(false);
  
  const { 
    playFlipStart, 
    playReveal, 
    playCelebration, 
    playNavigate, 
    playSkip,
    setEnabled 
  } = useRevealSounds();

  const themeConfig = THEME_CONFIG[theme];
  const ThemeIcon = themeConfig.icon;
  const currentNft = nfts[currentIndex];

  // Generate random positions for particles on mount
  const particlePositions = useMemo(() => 
    [...Array(12)].map(() => ({
      x: (Math.random() - 0.5) * 150,
      y: (Math.random() - 0.5) * 150,
    })), [currentIndex]
  );

  useEffect(() => {
    setEnabled(soundEnabled);
  }, [soundEnabled, setEnabled]);

  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setIsFlipped(false);
      setHasTriggeredConfetti(false);
      hasPlayedFlipSound.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (open && !isFlipped) {
      const timer = setTimeout(() => {
        if (!hasPlayedFlipSound.current) {
          playFlipStart();
          hasPlayedFlipSound.current = true;
        }
        setIsFlipped(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [open, currentIndex, playFlipStart]);

  useEffect(() => {
    if (isFlipped && !hasTriggeredConfetti) {
      setTimeout(() => {
        playReveal();
      }, 200);
      
      setTimeout(() => {
        triggerConfetti();
        playCelebration();
      }, 400);
      
      setHasTriggeredConfetti(true);
    }
  }, [isFlipped, hasTriggeredConfetti, playReveal, playCelebration]);

  const triggerConfetti = () => {
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999,
    };

    function fire(particleRatio: number, opts: object) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    }

    // Use theme-specific colors
    const colors = themeConfig.confettiColors;

    fire(0.25, {
      spread: 26,
      startVelocity: 55,
      colors: colors[0],
    });
    fire(0.2, {
      spread: 60,
      colors: colors[1],
    });
    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
      colors: colors[2],
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
      colors: colors[0],
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 45,
      colors: colors[1],
    });
  };

  const handleNext = () => {
    if (currentIndex < nfts.length - 1) {
      playNavigate();
      setIsFlipped(false);
      setHasTriggeredConfetti(false);
      hasPlayedFlipSound.current = false;
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
      }, 100);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      playNavigate();
      setIsFlipped(false);
      setHasTriggeredConfetti(false);
      hasPlayedFlipSound.current = false;
      setTimeout(() => {
        setCurrentIndex(currentIndex - 1);
      }, 100);
    }
  };

  const handleSkipAll = () => {
    playSkip();
    setCurrentIndex(nfts.length - 1);
    setIsFlipped(true);
    setHasTriggeredConfetti(true);
  };

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
  };

  if (!currentNft) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-lg p-0 overflow-hidden bg-gradient-to-b from-background to-background/95 border-${theme === "fire" ? "orange" : theme === "ice" ? "cyan" : theme === "galaxy" ? "violet" : "primary"}-500/20`}>
        {/* Header */}
        <div className="relative p-6 pb-0">
          <div className="absolute right-4 top-4 z-10 flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSound}
              title={soundEnabled ? "Mute sounds" : "Enable sounds"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", duration: 0.6 }}
              className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br ${themeConfig.colors.iconBg} mb-4`}
            >
              <ThemeIcon className={`w-8 h-8 ${themeConfig.colors.iconColor}`} />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-bold"
            >
              NFT Revealed!
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-muted-foreground text-sm mt-1"
            >
              {nfts.length > 1 ? `${currentIndex + 1} of ${nfts.length} NFTs` : "Your NFT has been revealed"}
            </motion.p>
          </div>
        </div>

        {/* Card Flip Animation */}
        <div className="px-6 pb-6">
          <div className="relative w-full aspect-square max-w-[300px] mx-auto perspective-1000">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentNft.id}-${isFlipped}`}
                className="relative w-full h-full"
                initial={false}
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* Card Container */}
                <motion.div
                  className="absolute inset-0"
                  animate={{
                    rotateY: isFlipped ? 180 : 0,
                  }}
                  transition={{
                    duration: 0.8,
                    type: "spring",
                    stiffness: 100,
                    damping: 15,
                  }}
                  // SECURITY NOTE: Static CSS property, not user-controllable
                  style={{ transformStyle: "preserve-3d" }}
                >
                  {/* Front (Unrevealed) */}
                  <div
                    className={`absolute inset-0 rounded-2xl overflow-hidden border-4 ${themeConfig.colors.border} shadow-2xl ${themeConfig.colors.shadow}`}
                    style={{ backfaceVisibility: "hidden" }}
                  >
                    {unrevealedImage ? (
                      <img
                        src={unrevealedImage}
                        alt="Unrevealed"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${themeConfig.colors.iconBg} flex items-center justify-center`}>
                        <ThemeIcon className={`w-16 h-16 ${themeConfig.colors.iconColor} animate-pulse`} />
                      </div>
                    )}
                    
                    {/* Theme-specific shimmer/effect */}
                    <motion.div
                      className={`absolute inset-0 bg-gradient-to-r from-transparent ${themeConfig.shimmerColor} to-transparent`}
                      animate={{
                        x: ["-100%", "200%"],
                      }}
                      transition={{
                        duration: theme === "ice" ? 2 : 1.5,
                        repeat: Infinity,
                        repeatDelay: theme === "galaxy" ? 0.5 : 1,
                      }}
                    />
                    
                    {/* Theme-specific overlay effects */}
                    {theme === "fire" && (
                      <motion.div 
                        className="absolute inset-0 bg-gradient-to-t from-orange-600/30 via-transparent to-transparent"
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                      />
                    )}
                    
                    {/* 
                      SECURITY: Using static Tailwind classes instead of inline styles
                      Prevents potential XSS if theme values ever become user-controlled
                    */}
                    {theme === "ice" && (
                      <>
                        <motion.div 
                          className="absolute w-[50%] h-[50%] rounded-full bg-cyan-400/20 blur-2xl pointer-events-none"
                          style={{ left: '5%', top: '5%' }}
                          animate={{ opacity: [0.5, 0.8, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                        <motion.div 
                          className="absolute w-[50%] h-[50%] rounded-full bg-blue-400/20 blur-2xl pointer-events-none"
                          style={{ right: '5%', bottom: '5%' }}
                          animate={{ opacity: [0.5, 0.8, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                        />
                      </>
                    )}
                    
                    {theme === "galaxy" && (
                      <>
                        {[...Array(5)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="absolute w-1 h-1 rounded-full bg-white"
                            style={{
                              left: `${20 + i * 15}%`,
                              top: `${20 + i * 12}%`,
                            }}
                            animate={{
                              opacity: [0, 1, 0],
                              scale: [0.5, 1, 0.5],
                            }}
                            transition={{
                              duration: 1.5,
                              repeat: Infinity,
                              delay: i * 0.3,
                            }}
                          />
                        ))}
                      </>
                    )}
                    
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Badge className={`${themeConfig.colors.badgeBg} ${themeConfig.colors.badgeText} text-lg px-4 py-2`}>
                        <ThemeIcon className="w-4 h-4 mr-2" />
                        {themeConfig.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Back (Revealed) - Static styles prevent CSS injection */}
                  <div
                    className={`absolute inset-0 rounded-2xl overflow-hidden border-4 ${themeConfig.colors.revealedBorder} shadow-2xl ${themeConfig.colors.revealedShadow}`}
                    style={{ 
                      backfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                    }}
                  >
                    {currentNft.image_url ? (
                      <img
                        src={currentNft.image_url}
                        alt={currentNft.name || `#${currentNft.token_id}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${themeConfig.colors.iconBg} flex items-center justify-center`}>
                        <PartyPopper className={`w-16 h-16 ${themeConfig.colors.iconColor}`} />
                      </div>
                    )}
                    {/* Glow Effect */}
                    <motion.div
                      className={`absolute inset-0 bg-gradient-to-t ${themeConfig.colors.glowColor} via-transparent to-transparent`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.5, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>

            {/* Theme-specific Particles */}
            {isFlipped && (
              <>
                {particlePositions.map((pos, i) => (
                  <motion.div
                    key={i}
                    className={`absolute ${themeConfig.colors.particleColor} ${theme === "ice" ? "w-3 h-1" : theme === "galaxy" ? "w-1 h-1" : "w-2 h-2"} ${theme === "ice" ? "rotate-45" : "rounded-full"}`}
                    initial={{
                      left: "50%",
                      top: "50%",
                      scale: 0,
                      opacity: 1,
                    }}
                    animate={{
                      left: `${50 + pos.x}%`,
                      top: `${50 + pos.y}%`,
                      scale: [0, theme === "galaxy" ? 2 : 1.5, 0],
                      opacity: [1, 1, 0],
                      rotate: theme === "fire" ? [0, 180] : theme === "galaxy" ? [0, 360] : 0,
                    }}
                    transition={{
                      duration: theme === "galaxy" ? 1.5 : 1,
                      delay: i * 0.04,
                      ease: "easeOut",
                    }}
                  />
                ))}
              </>
            )}
          </div>

          {/* NFT Info */}
          <motion.div
            className="mt-6 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isFlipped ? 1 : 0, y: isFlipped ? 0 : 20 }}
            transition={{ delay: 0.5 }}
          >
            <h3 className="text-xl font-bold">
              {currentNft.name || `${collectionName} #${currentNft.token_id}`}
            </h3>
            <p className="text-sm text-muted-foreground">
              Token #{currentNft.token_id}
            </p>
          </motion.div>

          {/* Navigation */}
          {nfts.length > 1 && (
            <motion.div
              className="flex items-center justify-between mt-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              
              {currentIndex < nfts.length - 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkipAll}
                  className="text-muted-foreground"
                >
                  Skip All
                </Button>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={currentIndex === nfts.length - 1}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {/* Done Button */}
          {(nfts.length === 1 || currentIndex === nfts.length - 1) && isFlipped && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="mt-4"
            >
              <Button
                className="w-full"
                onClick={() => onOpenChange(false)}
              >
                <PartyPopper className="w-4 h-4 mr-2" />
                Done
              </Button>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
