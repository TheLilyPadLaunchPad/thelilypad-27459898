import React from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Check, Sparkles, Zap, Hexagon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    SupportedChain,
    CHAINS,
    getActiveChains,
    setStoredChain
} from '@/config/chains';

interface ChainSelectorProps {
    selectedChain: SupportedChain;
    onChainChange: (chain: SupportedChain) => void;
    className?: string;
    compact?: boolean;
    variant?: 'dropdown' | 'pills'; // New: toggle between dropdown and pill switcher
}

// Chain icons mapping
const ChainIcon: React.FC<{ chain: SupportedChain; className?: string }> = ({ chain, className }) => {
    switch (chain) {
        case 'solana':
            return (
                <svg className={cn("w-4 h-4", className)} viewBox="0 0 128 128" fill="none">
                    <path d="M26.5 96.5L42.8 80.2C44.1 78.9 45.8 78.2 47.6 78.2H121C123.8 78.2 125.2 81.6 123.2 83.6L106.9 99.9C105.6 101.2 103.9 101.9 102.1 101.9H28.5C25.7 101.9 24.3 98.5 26.3 96.5H26.5Z" fill="url(#solana-gradient-1)" />
                    <path d="M26.5 28.1L42.8 44.4C44.1 45.7 45.8 46.4 47.6 46.4H121C123.8 46.4 125.2 43 123.2 41L106.9 24.7C105.6 23.4 103.9 22.7 102.1 22.7H28.5C25.7 22.7 24.3 26.1 26.3 28.1H26.5Z" fill="url(#solana-gradient-2)" />
                    <path d="M123.2 55.2L106.9 71.5C105.6 72.8 103.9 73.5 102.1 73.5H28.5C25.7 73.5 24.3 70.1 26.3 68.1L42.6 51.8C43.9 50.5 45.6 49.8 47.4 49.8H121C123.8 49.8 125.2 53.2 123.2 55.2Z" fill="url(#solana-gradient-3)" />
                    <defs>
                        <linearGradient id="solana-gradient-1" x1="24.3" y1="102.2" x2="123.6" y2="78" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#00FFA3" />
                            <stop offset="1" stopColor="#DC1FFF" />
                        </linearGradient>
                        <linearGradient id="solana-gradient-2" x1="24.3" y1="46.7" x2="123.6" y2="22.5" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#00FFA3" />
                            <stop offset="1" stopColor="#DC1FFF" />
                        </linearGradient>
                        <linearGradient id="solana-gradient-3" x1="24.3" y1="73.8" x2="123.6" y2="49.6" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#00FFA3" />
                            <stop offset="1" stopColor="#DC1FFF" />
                        </linearGradient>
                    </defs>
                </svg>
            );
        case 'monad':
            return (
                <Hexagon className={cn("w-4 h-4", className)} style={{ color: '#836EF9' }} />
            );
        default:
            return <Sparkles className={cn("w-4 h-4", className)} />;
    }
};

export function ChainSelector({
    selectedChain,
    onChainChange,
    className,
    compact = false,
    variant = 'dropdown',
}: ChainSelectorProps) {
    const activeChains = getActiveChains();
    const currentChain = CHAINS[selectedChain];

    const handleChainChange = (chain: SupportedChain) => {
        setStoredChain(chain);
        onChainChange(chain);
    };

    // Pills variant - horizontal button group
    if (variant === 'pills') {
        return (
            <div className={cn("flex gap-2 p-2 rounded-xl bg-black/40 backdrop-blur", className)}>
                {activeChains.map((chain) => {
                    const isSelected = selectedChain === chain.id;
                    return (
                        <Button
                            key={chain.id}
                            onClick={() => handleChainChange(chain.id)}
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "gap-2 px-4 transition-all duration-200",
                                isSelected
                                    ? "bg-white text-black hover:bg-white/90"
                                    : "text-white/70 hover:text-white hover:bg-white/10"
                            )}
                            style={isSelected ? {
                                borderColor: chain.theme.primaryColor,
                            } : undefined}
                        >
                            <ChainIcon chain={chain.id} />
                            <span className="font-medium">{chain.symbol}</span>
                            {chain.isTestnetOnly && isSelected && (
                                <Badge variant="outline" className="h-4 text-[9px] px-1 bg-amber-500/20 text-amber-300 border-amber-500/40">
                                    Test
                                </Badge>
                            )}
                        </Button>
                    );
                })}
            </div>
        );
    }

    // Default dropdown variant (original implementation)
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "gap-2 h-10 px-3 border-2",
                        "hover:border-primary/50 transition-colors",
                        className
                    )}
                    style={{ borderColor: `${currentChain.color}40` }}
                >
                    <ChainIcon chain={selectedChain} />
                    {!compact && (
                        <>
                            <span className="font-medium">{currentChain.name}</span>
                            {currentChain.isTestnetOnly && (
                                <Badge variant="outline" className="h-5 text-[10px] px-1.5 bg-amber-500/10 text-amber-500 border-amber-500/30">
                                    Testnet
                                </Badge>
                            )}
                        </>
                    )}
                    <ChevronDown className="w-4 h-4 opacity-50" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-[280px] bg-popover">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Select Blockchain
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {activeChains.map((chain) => {
                    const isSelected = selectedChain === chain.id;

                    return (
                        <DropdownMenuItem
                            key={chain.id}
                            onClick={() => handleChainChange(chain.id)}
                            className={cn(
                                "flex items-start gap-3 p-3 cursor-pointer",
                                isSelected && "bg-accent"
                            )}
                        >
                            <div
                                className="p-2 rounded-lg shrink-0"
                                style={{ backgroundColor: `${chain.color}20` }}
                            >
                                <ChainIcon chain={chain.id} className="w-5 h-5" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{chain.name}</span>
                                    <Badge variant="outline" className="h-5 text-[10px] px-1.5">
                                        {chain.symbol}
                                    </Badge>
                                    {chain.isTestnetOnly && (
                                        <Badge
                                            variant="outline"
                                            className="h-5 text-[10px] px-1.5 bg-amber-500/10 text-amber-500 border-amber-500/30"
                                        >
                                            Testnet
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                    {chain.description}
                                </p>
                                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                    {chain.nftStandard}
                                </p>
                            </div>

                            {isSelected && (
                                <Check className="w-4 h-4 text-primary shrink-0" />
                            )}
                        </DropdownMenuItem>
                    );
                })}

                <DropdownMenuSeparator />
                <div className="px-3 py-2 text-[10px] text-muted-foreground">
                    <Zap className="w-3 h-3 inline mr-1" />
                    Each chain has its own wallet and NFT standards
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// Export the ChainIcon for use elsewhere
export { ChainIcon };

export default ChainSelector;
