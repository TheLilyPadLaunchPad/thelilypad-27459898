import { useState } from 'react';
import { Download, Share2, Users, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { downloadBlob } from '@/lib/downloadBlob';
import { WLCardArtwork, whitelistArtworkUrl } from './WLCardArtwork';

interface WLCardProps {
  displayName: string;
  avatarUrl?: string;
  affiliateLink: string;
  referralCount: number;
  walletAddress: string;
  eligible: boolean;
}

export function WLCard({ displayName, avatarUrl, affiliateLink, referralCount, walletAddress, eligible }: WLCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (isDownloading || !eligible || !walletAddress) return;
    setIsDownloading(true);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = whitelistArtworkUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 1010;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      // Keep the supplied illustration intact; member information belongs below it.
      ctx.drawImage(img, 0, 0, 1280, 720);
      const tokens = getComputedStyle(document.documentElement);
      ctx.fillStyle = `hsl(${tokens.getPropertyValue('--wl-paper').trim()})`;
      ctx.fillRect(0, 720, 1280, 290);
      ctx.fillStyle = `hsl(${tokens.getPropertyValue('--wl-ink').trim()})`;
      ctx.font = 'bold 28px system-ui';
      ctx.fillText('THE LILY PAD · WHITELISTED', 40, 772, 1200);
      ctx.font = 'bold 46px system-ui';
      ctx.fillText(displayName, 40, 837, 1200);
      ctx.fillStyle = `hsl(${tokens.getPropertyValue('--wl-muted').trim()})`;
      ctx.font = '24px system-ui';
      ctx.fillText(`${referralCount} Pond Referrals`, 40, 879);
      ctx.font = '22px monospace';
      ctx.fillText(walletAddress, 40, 929, 1200);
      ctx.font = '20px system-ui';
      ctx.fillText(affiliateLink, 40, 975, 1200);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Export failed')), 'image/png');
      });
      downloadBlob(blob, `lilypad-wl-${displayName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'member'}.png`);
      toast.success('Your whitelist pass is ready!');
    } catch {
      toast.error('Unable to download your pass. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!eligible || !walletAddress || !affiliateLink) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "I'm Whitelisted on The Lily Pad! 🐸", text: 'Join the pond! Whitelist is open:', url: affiliateLink });
      } else {
        await navigator.clipboard.writeText(affiliateLink);
        toast.success('Affiliate link copied!');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('Unable to share. Please try again.');
    }
  };

  if (!eligible || !walletAddress) return null;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border" aria-label="Your whitelist pass">
        <WLCardArtwork />
        <div className="wl-pass-details space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
            <span>THE LILY PAD</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" />WHITELISTED</span>
          </div>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 shrink-0 border border-current/20">
              <AvatarImage src={avatarUrl} alt="" />
              <AvatarFallback className="bg-secondary text-secondary-foreground">{displayName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="break-words text-lg font-bold leading-tight">{displayName}</h2>
              <p className="wl-pass-muted mt-1 flex items-center gap-1.5 text-xs"><Users className="h-3.5 w-3.5 shrink-0" />{referralCount} Pond Referrals</p>
            </div>
          </div>
          <p className="wl-pass-muted break-all font-mono text-[10px]" aria-label="Registered wallet">{walletAddress}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 gap-2 bg-card" onClick={handleDownload} disabled={isDownloading}>
          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Download className="h-4 w-4" />}
          {isDownloading ? 'Preparing pass…' : 'Download Pass'}
        </Button>
        <Button variant="outline" size="icon" className="shrink-0 bg-card" onClick={handleShare} disabled={!affiliateLink} aria-label="Share whitelist referral link" title="Share whitelist referral link"><Share2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
