import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, ShieldCheck, Coins, Image as ImageIcon, Sparkles, Leaf } from "lucide-react";
import { LaunchpadPhase } from "@/hooks/useSolanaLaunch";
import { useChain } from "@/providers/ChainProvider";
import { SupportedChain, CHAINS } from "@/config/chains";

interface LaunchpadPreviewProps {
    name: string;
    description: string;
    coverImage: string | null;
    itemsAvailable: number;
    phases: LaunchpadPhase[];
    activePhaseIndex: number;
    selectedChain?: SupportedChain;
}

export function LaunchpadPreview({
    name,
    description,
    coverImage,
    itemsAvailable,
    phases,
    activePhaseIndex = 0,
    selectedChain
}: LaunchpadPreviewProps) {
    const { chain: globalChain } = useChain();
    const chain = selectedChain ? CHAINS[selectedChain] : globalChain;
    const { theme } = chain;

    const activePhase = phases[activePhaseIndex] || phases[0];
    const isLive = activePhase?.startTime && new Date() >= activePhase.startTime;

    return (
        <div className="h-full flex flex-col items-center justify-center p-4">
            {/* Context Label with subtle pulsing border */}
            <div className="flex items-center gap-2 mb-6 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-[10px] font-mono uppercase tracking-[0.2em] text-primary animate-pulse">
                <Sparkles className="w-3 h-3" />
                <span>Live Marketplace Preview</span>
            </div>

            {/* Premium Preview Card */}
            <div
                className="w-full max-w-[320px] lg:max-w-[360px] rounded-[2rem] overflow-hidden glass-card border-4 shadow-2xl transition-all duration-500 hover:scale-[1.02]"
                style={{
                    borderColor: `${theme.primaryColor}20`,
                    boxShadow: `0 20px 50px -12px ${theme.glowColor}30, 0 0 20px ${theme.glowColor}10`
                }}
            >
                {/* Hero Image Section */}
                <div className="relative aspect-square w-full bg-gradient-to-br from-muted/50 to-card overflow-hidden group">
                    {coverImage ? (
                        <img
                            src={coverImage}
                            alt="Collection Preview"
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/30 gap-3">
                            <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center border border-primary/10">
                                <Leaf className="w-8 h-8 text-primary/40" />
                            </div>
                            <span className="text-[10px] font-medium tracking-widest uppercase">Awaiting Artwork</span>
                        </div>
                    )}

                    {/* Gradient Overlay for labels */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />

                    {/* Floating Badges */}
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                        <Badge className="bg-black/40 backdrop-blur-md border border-white/10 text-white text-[10px] h-6 px-2.5 rounded-lg">
                            {itemsAvailable} Items
                        </Badge>
                        {activePhase?.gatekeeper && (
                            <Badge
                                className="backdrop-blur-md text-[10px] h-6 px-2.5 rounded-lg border"
                                style={{
                                    backgroundColor: `${theme.primaryColor}30`,
                                    color: 'white',
                                    borderColor: `${theme.primaryColor}40`
                                }}
                            >
                                <ShieldCheck className="w-3 h-3 mr-1" /> Gated
                            </Badge>
                        )}
                    </div>

                    {/* Status Indicator */}
                    <div className="absolute top-4 right-4">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-md border ${isLive
                            ? "bg-green-500/20 text-green-400 border-green-500/30"
                            : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                            }`}>
                            <div className={`w-2 h-2 rounded-full ${isLive ? "bg-green-500 animate-live-pulse" : "bg-amber-500"}`} />
                            {isLive ? "MINTING NOW" : "LAUNCHING SOON"}
                        </div>
                    </div>
                    
                    {/* Floating Title on Image (Mobile style) */}
                    <div className="absolute bottom-4 left-4 right-4">
                         <h3 className="text-white text-lg font-bold leading-tight drop-shadow-md line-clamp-1">
                            {name || "Unnamed Collection"}
                         </h3>
                    </div>
                </div>

                {/* Interaction Content */}
                <div className="p-5 space-y-5 bg-card/80 backdrop-blur-sm">
                    {/* Mint Progress Wrapper */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-end">
                            <span className="text-[11px] font-bold text-foreground/70 uppercase tracking-wider">Allocation</span>
                            <span className="text-xs font-mono text-primary">0% Minted</span>
                        </div>
                        <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden border border-border/50">
                             <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: '5%', background: `linear-gradient(90deg, ${theme.primaryColor}, ${theme.secondaryColor})` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>0 NFTs</span>
                            <span>{itemsAvailable} TOTAL</span>
                        </div>
                    </div>

                    {/* Phase & Price Card */}
                    <div className="p-3 rounded-2xl bg-muted/40 border border-border/50 group-hover:border-primary/20 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase">{activePhase?.id || "Genesis"} Phase</span>
                            <div className="flex items-center text-[10px] text-primary font-medium">
                                <Sparkles className="w-3 h-3 mr-1" /> Eligible
                            </div>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-black tracking-tighter text-foreground">
                                {activePhase?.price || 0}
                            </span>
                            <span className="text-sm font-bold text-muted-foreground">{chain.symbol}</span>
                        </div>
                    </div>

                    {/* CTA Button */}
                    <Button
                        size="lg"
                        className="w-full h-12 rounded-xl text-sm font-black uppercase tracking-widest text-white shadow-xl hover:translate-y-[-2px] active:translate-y-[0px] transition-all"
                        style={{
                            background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})`,
                            boxShadow: `0 10px 20px -5px ${theme.glowColor}40`
                        }}
                    >
                        Mint with {chain.symbol}
                    </Button>
                </div>
            </div>

            {/* Tablet/Desktop Perspective Hint */}
            <div className="mt-8 flex flex-col items-center gap-2">
                <p className="text-[11px] text-muted-foreground font-medium text-center max-w-[280px] leading-relaxed">
                    This preview adapts to <span className="text-primary">iOS</span> and <span className="text-primary">Android</span> aspect ratios automatically.
                </p>
                <div className="flex gap-4 opacity-30 grayscale hover:grayscale-0 transition-all cursor-default">
                    <div className="w-6 h-1 bg-foreground rounded-full" />
                    <div className="w-1 h-1 bg-foreground rounded-full" />
                    <div className="w-1 h-1 bg-foreground rounded-full" />
                </div>
            </div>
        </div>
    );
}
