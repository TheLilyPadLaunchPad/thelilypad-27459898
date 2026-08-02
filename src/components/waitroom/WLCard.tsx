import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Share2, Users, CheckCircle2, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { LilyPadLogo } from '@/components/LilyPadLogo';
import wlCardBgAsset from '@/assets/wl-card-bg.png.asset.json';
import wlFrogAsset from '@/assets/wl-frog.png.asset.json';
const wlCardBg = wlCardBgAsset.url;
const wlFrog = wlFrogAsset.url;

interface WLCardProps {
  displayName: string;
  avatarUrl?: string;
  affiliateLink: string;
  referralCount: number;
}

export function WLCard({ displayName, avatarUrl, affiliateLink, referralCount }: WLCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = 1200; // High res
      canvas.height = 630; // OG image size ratio

      // Load assets
      const [bgImg, frogImg] = await Promise.all([
        loadImage(wlCardBg),
        loadImage(wlFrog)
      ]);

      // Draw background
      ctx.drawImage(bgImg, 0, 0, 1200, 630);

      // Add overlay gradient for depth
      const overlay = ctx.createLinearGradient(0, 0, 0, 630);
      overlay.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
      overlay.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, 1200, 630);

      // Draw Frog (User's hand-drawn style)
      ctx.drawImage(frogImg, 750, 100, 400, 480);

      // Card Content
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 15;
      
      // Logo and Brand
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 42px system-ui';
      ctx.fillText('THE LILY PAD', 80, 100);

      // Whitelist Status
      ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.beginPath();
      ctx.roundRect(80, 130, 280, 60, 30);
      ctx.fill();
      
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 24px system-ui';
      ctx.fillText('✅ WHITELISTED', 115, 168);

      // User Information
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px system-ui';
      ctx.fillText(displayName, 80, 320);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '32px system-ui';
      ctx.fillText(`Pond Member · ${referralCount} Referrals`, 80, 380);

      // Affiliate Link at bottom
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 20px system-ui';
      ctx.fillText(affiliateLink.replace('https://', ''), 80, 560);

      // Download
      const link = document.createElement('a');
      link.download = `lilypad-wl-${displayName.toLowerCase().replace(/\s/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      toast.success('Your premium Whitelist Card is ready!');
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate high-res card');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'I\'m Whitelisted on The Lily Pad! 🐸',
          text: `Join the pond! Whitelist is open:`,
          url: affiliateLink,
        });
      } catch {
        // User cancelled
      }
    } else {
      navigator.clipboard.writeText(affiliateLink);
      toast.success('Affiliate link copied to clipboard!');
    }
  };

  return (
    <div className="space-y-4">
      {/* Premium Visual Card */}
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative aspect-[1200/630] w-full overflow-hidden rounded-2xl border border-primary/20 bg-muted shadow-2xl group"
      >
        {/* Artistic Background Layer */}
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
          style={{ backgroundImage: `url(${wlCardBg})` }}
        />
        
        {/* Glass Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40 backdrop-blur-[1px]" />

        {/* Content Layer */}
        <div className="absolute inset-0 p-8 flex flex-col justify-between text-white z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 backdrop-blur-md p-2 rounded-xl border border-primary/30">
                <LilyPadLogo size={32} />
              </div>
              <span className="font-black text-lg tracking-tighter text-primary">THE LILY PAD</span>
            </div>
            <motion.div 
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="px-4 py-2 bg-primary/15 backdrop-blur-md rounded-full border border-primary/30 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-primary tracking-wide">WHITELISTED</span>
            </motion.div>
          </div>

          <div className="flex items-end justify-between gap-6">
            <div className="flex-1 min-w-0">
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <div className="flex items-center gap-4 mb-2">
                  <Avatar className="w-16 h-16 border-2 border-primary/50 shadow-xl">
                    <AvatarImage src={avatarUrl} />
                    <AvatarFallback className="bg-primary/20 text-primary font-bold text-xl">
                      {displayName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h2 className="text-3xl font-black truncate drop-shadow-lg">{displayName}</h2>
                    <p className="text-primary/70 font-medium flex items-center gap-1.5 text-sm uppercase tracking-widest">
                      <Users className="w-4 h-4" /> {referralCount} Pond Referrals
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-white/40 font-mono truncate max-w-[200px]">
                  {affiliateLink}
                </p>
              </motion.div>
            </div>

            {/* Frog Asset (Decor) */}
            <motion.div 
              initial={{ scale: 0.8, opacity: 0, rotate: 10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", delay: 0.5 }}
              className="w-40 h-40 relative drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]"
            >
              <img src={wlFrog} alt="Lily Pad Frog" className="w-full h-full object-contain" />
            </motion.div>
          </div>
        </div>

        {/* Shine Effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />
      </motion.div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button 
          variant="outline" 
          className="flex-1 bg-primary/5 border-primary/20 hover:bg-primary/10 transition-all gap-2 py-6 rounded-xl group"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity }} >
              <Users className="w-4 h-4" />
            </motion.div>
          ) : (
            <Download className="w-4 h-4 group-hover:bounce" /> 
          )}
          Download Pass
        </Button>
        <Button 
          variant="outline" 
          className="bg-accent/5 border-accent/20 hover:bg-accent/10 transition-all p-6 rounded-xl group"
          onClick={handleShare}
        >
          <Share2 className="w-4 h-4 group-hover:scale-110" />
        </Button>
      </div>
    </div>
  );
}
