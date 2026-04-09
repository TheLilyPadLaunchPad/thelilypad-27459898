import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Lock, ShieldAlert, Rocket, Flame, TrendingUp, Cpu } from "lucide-react";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface TokenLaunchMechanicsProps {
    chain?: 'solana' | 'monad';
}

export const TokenLaunchMechanics = ({ chain = 'solana' }: TokenLaunchMechanicsProps) => {
    const [isAnimating, setIsAnimating] = useState(false);

    // Fetch real-time pool data
    const { data: poolData } = useQuery({
        queryKey: ['buyback-pool-launch', chain],
        queryFn: async () => {
            const { data } = await (supabase.from('buyback_pool') as any)
                .select('*')
                .eq('chain', chain)
                .maybeSingle();
            return data as { pool_balance: number; accumulated_volume: number; buyback_threshold: number } | null;
        },
        refetchInterval: 30000,
    });

    const poolBalance = poolData?.pool_balance || 0;
    const accumulatedVolume = poolData?.accumulated_volume || 0;

    // Target liquidity for token launch
    const TARGET_LIQUIDITY = 50000;
    const progress = Math.min((poolBalance / TARGET_LIQUIDITY) * 100, 100);

    useEffect(() => {
        const interval = setInterval(() => setIsAnimating(prev => !prev), 2000);
        return () => clearInterval(interval);
    }, []);

    const getCurrencyName = () => {
        switch (chain) {
            case 'monad': return 'MON';
            default: return 'SOL';
        }
    };

    return (
        <Card className="border-primary/50 bg-gradient-to-br from-background via-primary/5 to-background overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <Cpu className="w-32 h-32" />
            </div>

            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/20">
                            <Rocket className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <CardTitle>$LILY Token Launch</CardTitle>
                            <CardDescription>Initial Liquidity Generation Event</CardDescription>
                        </div>
                    </div>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                        Phase 1: Accumulation
                    </Badge>
                </div>
            </CardHeader>

            <CardContent className="space-y-6">
                <div>
                    <div className="flex items-end justify-between mb-2">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Target Liquidity Pool</p>
                            <div className="text-3xl font-bold flex items-center gap-2">
                                $<AnimatedCounter value={poolBalance} decimals={2} />
                                <span className="text-xl text-muted-foreground font-normal">/ ${TARGET_LIQUIDITY.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-xl font-bold text-primary">{Math.max(0, progress).toFixed(1)}%</span>
                        </div>
                    </div>
                    <div className="relative">
                        <Progress
                            value={progress}
                            className="h-4 bg-muted/50 [&>div]:bg-gradient-to-r [&>div]:from-primary [&>div]:to-purple-500"
                        />
                        {progress > 0 && progress < 100 && (
                            <div
                                className="absolute top-0 bottom-0 w-1 bg-white/50 blur-[2px] animate-pulse"
                                style={{ left: `${progress}%`, transition: 'left 0.5s ease-out' }}
                            />
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 text-right">
                        100% of marketplace fees are routed to the initial LP
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-background border border-border/50">
                        <Lock className="w-5 h-5 text-amber-500 mb-2" />
                        <h4 className="font-semibold text-sm mb-1">Liquidity Lock</h4>
                        <p className="text-xs text-muted-foreground">
                            Initial LP tokens will be automatically burned upon launch, ensuring a rug-proof foundation.
                        </p>
                    </div>
                    <div className="p-4 rounded-xl bg-background border border-border/50">
                        <Flame className="w-5 h-5 text-red-500 mb-2" />
                        <h4 className="font-semibold text-sm mb-1">Deflationary Buybacks</h4>
                        <p className="text-xs text-muted-foreground">
                            Post-launch, trading volume automatically triggers buy-and-burn events for $LILY.
                        </p>
                    </div>
                    <div className="p-4 rounded-xl bg-background border border-border/50">
                        <ShieldAlert className="w-5 h-5 text-green-500 mb-2" />
                        <h4 className="font-semibold text-sm mb-1">Anti-MEV Protection</h4>
                        <p className="text-xs text-muted-foreground">
                            Launch sequence uses Jito bundles to prevent sniper bots from extracting value.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
