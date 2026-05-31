import React from 'react';
import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';

/**
 * Metaplex hex logo rendered as inline SVG — no external image dependency.
 * Based on the official Metaplex brand mark (simplified hexagon + M).
 */
const MetaplexLogo: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="Metaplex"
    >
        {/* Hexagon outline */}
        <path
            d="M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z"
            fill="currentColor"
            fillOpacity="0.15"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
        />
        {/* M glyph */}
        <path
            d="M7.5 16V8L12 13L16.5 8V16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

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
                <MetaplexLogo className="w-5 h-5 text-[#f5a623] shrink-0" />
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
            <MetaplexLogo className="w-3.5 h-3.5 shrink-0" />
            <span>Powered by Metaplex</span>
            {shouldShowLink && (
                <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-70 transition-opacity" />
            )}
        </a>
    );
};

/**
 * Tiny Metaplex hex icon — for embedding in badge rows (e.g. collection cards).
 * Renders just the ⬡ logo at 14×14px with a tooltip.
 */
export const MetaplexHexIcon: React.FC<{ className?: string }> = ({ className }) => (
    <span title="Metaplex Core" className={cn('inline-flex', className)}>
        <MetaplexLogo className="w-3.5 h-3.5 text-[#f5a623]" />
    </span>
);

export default MetaplexBadge;
