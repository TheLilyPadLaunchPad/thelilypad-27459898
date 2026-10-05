import React from 'react';
import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';

// Official Metaplex brand mark (presskit) — white "M" on the dark brand tile.
import metaplexLogo from '@/assets/metaplex-logo.png';

// ── Variants ──────────────────────────────────────────────────────────────────

interface MetaplexBadgeProps {
    /** 'inline' = small pill for cards/modals, 'footer' = larger footer attribution */
    variant?: 'inline' | 'footer';
    /** Extra classes on the outer wrapper */
    className?: string;
    /** Show the external-link arrow on hover (default: true for footer) */
    showLink?: boolean;
}

/**
 * MetaplexBadge — "Powered by Metaplex" attribution component.
 *
 * Two variants:
 *   - `inline`  — compact pill: ⬡ Powered by Metaplex (for cards, modals, overlays)
 *   - `footer`  — larger block with logo + link to Metaplex docs
 *
 * Clicking always opens the Metaplex developer docs.
 */
export const MetaplexBadge: React.FC<MetaplexBadgeProps> = ({
    variant = 'inline',
    className,
    showLink,
}) => {
    const href = 'https://developers.metaplex.com';
    const shouldShowLink = showLink ?? variant === 'footer';

    if (variant === 'footer') {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                    'group inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors',
                    className,
                )}
            >
                <img
                    src={metaplexLogo}
                    alt="Metaplex"
                    className="w-5 h-5 rounded shrink-0"
                />
                <span className="text-sm">
                    Powered by{' '}
                    <span className="font-semibold text-foreground/80 group-hover:text-foreground transition-colors">
                        Metaplex
                    </span>
                </span>
                {shouldShowLink && (
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                )}
            </a>
        );
    }

    // ── Inline variant (default) ──────────────────────────────────────────────
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                'group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
                'bg-[#f5a623]/10 border border-[#f5a623]/25',
                'text-[11px] font-semibold text-[#f5a623]/90',
                'hover:bg-[#f5a623]/15 hover:border-[#f5a623]/40 hover:text-[#f5a623]',
                'transition-all duration-150',
                className,
            )}
        >
            <img
                src={metaplexLogo}
                alt="Metaplex"
                className="w-3.5 h-3.5 rounded-[4px] shrink-0"
            />
            <span>Powered by Metaplex</span>
            {shouldShowLink && (
                <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-70 transition-opacity" />
            )}
        </a>
    );
};

/**
 * Tiny Metaplex brand icon — for embedding in badge rows (e.g. collection cards).
 * Renders the official mark at 14×14px with a tooltip.
 */
export const MetaplexHexIcon: React.FC<{ className?: string }> = ({ className }) => (
    <span title="Metaplex Core" className={cn('inline-flex', className)}>
        <img
            src={metaplexLogo}
            alt="Metaplex"
            className="w-3.5 h-3.5 rounded-[3px]"
        />
    </span>
);

export default MetaplexBadge;
