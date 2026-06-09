import React from "react";
import {
    Zap, Info, Fuel, AlertTriangle, Shield, Wallet,
    ChevronRight, Sparkles, Minus, Plus, Loader2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from "@/components/ui/tooltip";
import { Phase } from "./types";
import { PhaseCountdown } from "@/components/launchpad/PhaseCountdown";
import { useCryptoPrice } from "@/hooks/useCryptoPrice";
import { useWallet } from "@/providers/WalletProvider";
import { toast } from "sonner";

interface CollectionMintCardProps {
    activePhase: Phase | null;
    phases: Phase[];
    setActivePhase: (phase: Phase) => void;
    mintQuantity: number;
    setMintQuantity: (val: number) => void;
    handleMint: (amount?: number) => void;
    isMinting: boolean;
    isWalletConnected: boolean;
    handleConnectWallet: () => void;
    userBalance: number;
    currency: string;
    isLive: boolean;
    isWhitelisted: boolean;
    totalWithGas?: string;
    estimatedFee?: string;
    handleSwitchNetwork?: () => void;
    isWrongNetwork?: boolean;
    isTestnet?: boolean;
    walletAddress?: string | null;
}

export const CollectionMintCard: React.FC<CollectionMintCardProps> = ({
    activePhase,
    phases,
    setActivePhase,
    mintQuantity,
    setMintQuantity,
    handleMint,
    isMinting,
    isWalletConnected,
    handleConnectWallet,
    userBalance,
    currency,
    isLive,
    isWhitelisted,
    totalWithGas,
    estimatedFee,
    handleSwitchNetwork,
    isWrongNetwork,
    isTestnet,
    walletAddress,
}) => {
    const { toUSD } = useCryptoPrice(currency as any);
    const [isFunding, setIsFunding] = React.useState(false);
    const totalPrice = activePhase ? parseFloat(activePhase.price) * mintQuantity : 0;
    const isBalanceLow = userBalance < totalPrice;

    // Determine button text and state
    const getMintButtonContent = () => {
        if (!isWalletConnected) return "Connect Wallet to Mint";
        if (isMinting) return (
            <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing Mint...
            </span>
        );
        if (!activePhase) return "No Active Phase";
        if (!isLive) return "Mint Not Yet Live";
        if (activePhase.requiresAllowlist && !isWhitelisted) return "Not Whitelisted";
        if (isBalanceLow) return `Insufficient ${currency}`;

        return `Mint ${mintQuantity} NFT${mintQuantity > 1 ? 's' : ''}`;
    };

    const isButtonDisabled = isMinting || (isWalletConnected && (!isLive || (activePhase?.requiresAllowlist && !isWhitelisted) || isBalanceLow));

    return (
        <Card className="glass-card shadow-2xl border-primary/30 relative overflow-hidden">
            {/* Decorative background glow */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 rounded-full blur-3xl opacity-50" />
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-primary/10 rounded-full blur-3xl opacity-30" />

            <CardHeader className="pb-4 relative z-10">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-2xl font-bold flex items-center gap-2">
                            Mint NFT
                            <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                        </CardTitle>
                        <CardDescription className="font-medium mt-1">
                            Phase: <span className="text-foreground italic">{activePhase?.name || "Loading..."}</span>
                        </CardDescription>
                    </div>
                    {isLive && (
                        <Badge className="bg-green-500 hover:bg-green-600 text-white border-none animate-pulse">
                            Live Now
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-6 relative z-10">
                {/* Phase Quick Selector (if multiple) */}
                {phases.length > 1 && (
                    <Tabs
                        value={activePhase?.id || ""}
                        onValueChange={(v) => {
                            const phase = phases.find(p => p.id === v);
                            if (phase) setActivePhase(phase);
                        }}
                        className="w-full"
                    >
                        <TabsList className="grid grid-cols-2 bg-muted/50 p-1">
                            {phases.slice(0, 2).map(phase => (
                                <TabsTrigger
                                    key={phase.id}
                                    value={phase.id}
                                    className="rounded-md data-[state=active]:bg-background data-[state=active]:text-primary"
                                >
                                    {phase.name}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                )}

                {/* Status Alerts */}
                {isWalletConnected && !isWhitelisted && activePhase?.requiresAllowlist && (
                    <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
                        <Shield className="h-4 w-4" />
                        <AlertTitle>Allowlist Required</AlertTitle>
                        <AlertDescription className="text-xs">
                            This phase is only for whitelisted wallets. Switch to a public phase or contact the creator.
                        </AlertDescription>
                    </Alert>
                )}

                {isWrongNetwork && (
                    <Alert variant="destructive" className="bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Wrong Network</AlertTitle>
                        <AlertDescription className="text-xs flex flex-col gap-2">
                            Please switch your wallet to the correct network.
                            {handleSwitchNetwork && (
                                <Button size="sm" variant="outline" className="w-fit h-7 text-[10px]" onClick={handleSwitchNetwork}>
                                    Switch Network
                                </Button>
                            )}
                        </AlertDescription>
                    </Alert>
                )}

                {/* Mint Information */}
                <div className="bg-muted/30 rounded-xl p-5 border border-border/50">
                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Unit Price</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black">{activePhase?.price || "0"}</span>
                                <span className="text-sm font-bold text-muted-foreground">{currency}</span>
                                {activePhase && parseFloat(activePhase.price) > 0 && (
                                    <span className="text-xs font-medium text-muted-foreground ml-1">
                                        (≈ {toUSD(parseFloat(activePhase.price))})
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Your Balance</p>
                            <div className="flex flex-col items-end">
                                <p className="font-bold flex items-center gap-1.5">
                                    <Wallet className="w-3.5 h-3.5 text-primary" />
                                    {userBalance?.toFixed(4) || "0.0000"} {currency}
                                </p>
                                {userBalance > 0 && (
                                    <p className="text-[10px] text-muted-foreground">
                                        ≈ {toUSD(userBalance)}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Quantity Selector */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between font-bold text-sm px-1">
                            <span>Quantity</span>
                            <span className="text-primary">{mintQuantity} NFT{mintQuantity > 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-12 w-12 rounded-xl bg-background border-border hover:border-primary transition-all"
                                onClick={() => setMintQuantity(Math.max(1, mintQuantity - 1))}
                                disabled={isMinting || mintQuantity <= 1}
                            >
                                <Minus className="w-5 h-5" />
                            </Button>
                            <div className="flex-1 h-12 rounded-xl bg-background border border-border flex items-center justify-center font-black text-xl shadow-inner">
                                {mintQuantity}
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-12 w-12 rounded-xl bg-background border-border hover:border-primary transition-all"
                                onClick={() => setMintQuantity(Math.min(activePhase?.maxPerWallet || 10, mintQuantity + 1))}
                                disabled={isMinting || mintQuantity >= (activePhase?.maxPerWallet || 10)}
                            >
                                <Plus className="w-5 h-5" />
                            </Button>
                        </div>
                        <p className="text-[10px] text-center text-muted-foreground pt-1">
                            Max {activePhase?.maxPerWallet || 1} per transaction in this phase
                        </p>
                    </div>
                </div>

                {/* Pricing Summary */}
                <div className="space-y-3 px-1">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground font-medium">Subtotal</span>
                        <span className="font-bold">{totalPrice.toFixed(4)} {currency}</span>
                    </div>

                    {estimatedFee && (
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
                                <span>Network Fee</span>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="h-3 w-3 cursor-help text-muted-foreground/50 hover:text-primary transition-colors" />
                                        </TooltipTrigger>
                                        <TooltipContent className="bg-background border-border text-xs p-3 max-w-[200px]">
                                            Estimate of the required network transaction fees to process this mint.
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <span className="font-medium flex items-center gap-1 text-muted-foreground">
                                <Fuel className="h-3 h-3" />
                                {estimatedFee}
                            </span>
                        </div>
                    )}

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between pt-1">
                        <span className="text-lg font-bold">Total</span>
                        <div className="text-right">
                            <div className="text-xl font-black text-primary">
                                {totalWithGas || `${totalPrice.toFixed(4)} ${currency}`}
                            </div>
                            {totalPrice > 0 && (
                                <div className="text-[11px] font-bold text-muted-foreground flex items-center justify-end gap-1">
                                    ≈ {toUSD(totalPrice)}
                                    <div className="h-1 w-1 bg-muted-foreground/30 rounded-full" />
                                    <span className="font-medium text-[9px] uppercase tracking-tighter">Live Price</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Mint Button */}
                {!isWalletConnected ? (
                    <Button
                        className="w-full h-14 rounded-xl text-lg font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-0.5"
                        onClick={handleConnectWallet}
                    >
                        <Wallet className="w-5 h-5 mr-3" />
                        Connect Wallet to Mint
                    </Button>
                ) : (
                    <Button
                        className={`w-full h-14 rounded-xl text-lg font-black shadow-lg transition-all relative group overflow-hidden ${isButtonDisabled
                            ? 'bg-muted text-muted-foreground cursor-not-allowed hover:translate-y-0'
                            : 'shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5'
                            }`}
                        onClick={() => handleMint(mintQuantity)}
                        disabled={isButtonDisabled}
                    >
                        {/* Glossy overlay animation */}
                        {!isButtonDisabled && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shine" />
                        )}

                        {getMintButtonContent()}
                        {!isButtonDisabled && !isMinting && (
                            <Zap className="w-5 h-5 ml-3 text-primary-foreground animate-pulse" />
                        )}
                    </Button>
                )}

                {isBalanceLow && isWalletConnected && (
                    <div className="space-y-3">
                        <p className="text-[11px] text-center text-destructive font-bold flex items-center justify-center gap-1.5 animate-bounce">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Top up your wallet to continue
                        </p>

                    </div>
                )}
            </CardContent>
        </Card>
    );
};
