import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getFeeBreakdown, getSecondarySaleBreakdown } from '@/lib/fees';
import { PLATFORM_WALLETS, TREASURY_CONFIG } from '@/config/treasury';

type Surface = 'launchpad' | 'marketplace' | 'secondary';

interface FeeBreakdownCardProps {
    amount: number;
    surface: Surface;
    /** Required for `secondary` to compute royalty payout. */
    royaltyBps?: number;
    /** Currency symbol shown next to amounts. Default: SOL */
    symbol?: string;
    /** Label shown in card header. */
    title?: string;
    className?: string;
}

const fmt = (n: number) => {
    if (!isFinite(n)) return '0';
    if (n === 0) return '0';
    if (n < 0.0001) return '<0.0001';
    return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
};

export const FeeBreakdownCard: React.FC<FeeBreakdownCardProps> = ({
    amount,
    surface,
    royaltyBps = 0,
    symbol = 'SOL',
    title,
    className = '',
}) => {
    const isSecondary = surface === 'secondary';
    const fb = isSecondary
        ? getSecondarySaleBreakdown(amount || 0, royaltyBps)
        : getFeeBreakdown(amount || 0, surface);

    const treasury = PLATFORM_WALLETS.solana.treasury;
    const team = PLATFORM_WALLETS.solana.team;
    const buyback = PLATFORM_WALLETS.solana.buybackPool;
    const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

    const headerLabel =
        title ??
        (surface === 'launchpad'
            ? 'Fees & Payout (per mint)'
            : isSecondary
                ? 'Sale Breakdown'
                : 'Fees & Payout');

    return (
        <div className={`rounded-2xl border border-border/60 bg-card/60 p-4 space-y-2 text-sm ${className}`}>
            <div className="flex items-center justify-between">
                <span className="font-semibold">{headerLabel}</span>
                <Badge variant="outline" className="text-[10px]">
                    {(fb.bps / 100).toFixed(2)}% platform fee
                </Badge>
            </div>

            <div className="flex items-center justify-between text-muted-foreground">
                <span>{isSecondary ? 'Sale price' : 'Mint price'}</span>
                <span className="font-mono">
                    {amount > 0 ? `${amount} ${symbol}` : isSecondary ? '—' : 'Free'}
                </span>
            </div>

            {isSecondary && royaltyBps > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                    <span>Creator royalty ({(royaltyBps / 100).toFixed(2)}%)</span>
                    <span className="font-mono">
                        {amount > 0 ? `${fmt((fb as any).royalty)} ${symbol}` : '—'}
                    </span>
                </div>
            )}

            {/* Platform 3-way split */}
            <div className="rounded-lg bg-muted/40 p-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Treasury (operations)</span>
                    <span className="font-mono">
                        {amount > 0 ? `${fmt(fb.treasuryFee)} ${symbol}` : '—'}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Team</span>
                    <span className="font-mono">
                        {amount > 0 ? `${fmt(fb.teamFee)} ${symbol}` : '—'}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Buyback pool</span>
                    <span className="font-mono">
                        {amount > 0 ? `${fmt(fb.buybackFee)} ${symbol}` : '—'}
                    </span>
                </div>
                <Separator className="my-1" />
                <div className="flex items-center justify-between font-medium">
                    <span>Platform fee total</span>
                    <span className="font-mono">
                        {amount > 0 ? `${fmt(fb.fee)} ${symbol}` : '—'}
                    </span>
                </div>
            </div>

            <div className="flex items-center justify-between pt-1">
                <span className="font-medium">
                    {isSecondary ? 'Seller receives' : 'Creator receives'}
                </span>
                <span className="font-mono font-semibold text-primary">
                    {amount > 0
                        ? `${fmt(isSecondary ? (fb as any).sellerNet : (fb as any).net)} ${symbol}`
                        : `0 ${symbol}`}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                <div className="truncate" title={treasury}>
                    <span className="block text-[9px] uppercase tracking-wide">Treasury</span>
                    <span className="font-mono">{shortAddr(treasury)}</span>
                </div>
                <div className="truncate" title={team}>
                    <span className="block text-[9px] uppercase tracking-wide">Team</span>
                    <span className="font-mono">{shortAddr(team)}</span>
                </div>
                <div className="truncate" title={buyback}>
                    <span className="block text-[9px] uppercase tracking-wide">Buyback</span>
                    <span className="font-mono">{shortAddr(buyback)}</span>
                </div>
            </div>
        </div>
    );
};

export default FeeBreakdownCard;
