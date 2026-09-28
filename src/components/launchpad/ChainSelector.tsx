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
import { ChevronDown, Check, Sparkles, Zap } from 'lucide-react';
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

// Official chain logos (from each chain's brand/press kit)
import solanaLogo from '@/assets/chains/solana.svg';
import monadLogo from '@/assets/chains/monad.png';
import xrpLogo from '@/assets/chains/xrp.svg';
import robinhoodLogo from '@/assets/chains/robinhood.svg';

const CHAIN_LOGOS: Partial<Record<SupportedChain, string>> = {
    solana: solanaLogo,
    monad: monadLogo,
    xrpl: xrpLogo,
    robinhood: robinhoodLogo,
};

// Chain icons mapping
const ChainIcon: React.FC<{ chain: SupportedChain; className?: string }> = ({ chain, className }) => {
    const logo = CHAIN_LOGOS[chain];
    if (logo) {
        return (
            <img
                src={logo}
                alt={`${chain} logo`}
                className={cn("w-4 h-4 object-contain", className)}
                loading="lazy"
            />
        );
    }
    return <Sparkles className={cn("w-4 h-4", className)} />;
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
