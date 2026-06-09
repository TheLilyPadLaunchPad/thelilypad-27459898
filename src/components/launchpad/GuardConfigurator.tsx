import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
    CalendarIcon,
    Coins,
    Clock,
    ShieldCheck,
    Users,
    Lock,
    MinusCircle,
    PlusCircle,
    Bot
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { LaunchpadPhase } from "@/hooks/useSolanaLaunch";

// Re-export for consumers
export type { LaunchpadPhase } from '@/chains';

interface GuardConfiguratorProps {
    phase: LaunchpadPhase;
    onChange: (updates: Partial<LaunchpadPhase>) => void;
    chainSymbol?: string;
}

export function GuardConfigurator({ phase, onChange, chainSymbol = 'SOL' }: GuardConfiguratorProps) {
    const [dateType, setDateType] = useState<'start' | 'end'>('start');
    const isSolana = chainSymbol === 'SOL';

    // Helpers to toggle sections
    const toggleGatekeeper = (enabled: boolean) => {
        onChange({ gatekeeper: enabled ? { network: "ignREusXmGrscGNUesoU9mxfds9AiYTezUKex2PsZV6", expireOnUse: true } : undefined });
    };

    const toggleNftGate = (enabled: boolean) => {
        onChange({ nftGate: enabled ? { collection: "" } : undefined });
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Payment & Limits Config */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 p-4 rounded-xl bg-secondary/20 border border-white/5 backdrop-blur-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0">
                        <Badge variant="outline" className="text-[9px] py-0.5 px-2 bg-green-500/10 text-green-400 border-green-500/20 rounded-bl-lg border-t-0 border-r-0">
                            {phase.price >= 0.3 ? "1.25% FEE (PREMIUM)" : "2.0% FEE"}
                        </Badge>
                    </div>
                    <Label className="flex items-center gap-2 text-primary font-semibold"><Coins className="w-4 h-4" /> Mint Price</Label>
                    <div className="flex gap-2">
                        <Input
                            type="number"
                            value={phase.payment?.amount ?? phase.price}
                            onChange={(e) => {
                                const val = Number(e.target.value);
                                onChange({ 
                                    price: phase.payment?.type === 'token' ? 0 : val,
                                    payment: {
                                        type: phase.payment?.type || 'sol',
                                        amount: val,
                                        mint: phase.payment?.mint,
                                    }
                                });
                            }}
                            className="bg-background/50 border-white/10 flex-1"
                            placeholder="0.00"
                        />
                        <select 
                            className="bg-background/50 border-white/10 rounded-md px-3 text-sm"
                            value={phase.payment?.type === 'token' ? phase.payment.mint : 'sol'}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'sol') {
                                    onChange({
                                        price: phase.payment?.amount || phase.price,
                                        payment: { type: 'sol', amount: phase.payment?.amount || phase.price }
                                    });
                                } else {
                                    onChange({
                                        price: 0, // Not using sol payment
                                        payment: { type: 'token', amount: phase.payment?.amount || phase.price, mint: val }
                                    });
                                }
                            }}
                        >
                            <option value="sol">SOL</option>
                            <option value="L3APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">L3AP</option>
                            <option value="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">USDC</option>
                            <option value="MONxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">MON</option>
                            <option value="wXRPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">wXRP</option>
                        </select>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                        {phase.price >= 0.3 
                            ? "✨ Premium Rate: 1.25% (Saves 50% vs competition)" 
                            : "Lower than competition (2.0% vs 2.5%)"}
                    </p>

                    {/* Destination Wallet (Sol Payment guard destination) */}
                    <div className="pt-3 mt-3 border-t border-white/5 space-y-1">
                        <Label className="text-xs flex items-center gap-1 text-muted-foreground">
                            Destination Wallet <span className="text-[10px] opacity-60">(optional)</span>
                        </Label>
                        <Input
                            value={phase.payment?.destination ?? ''}
                            onChange={(e) => {
                                const dest = e.target.value.trim();
                                onChange({
                                    payment: {
                                        type: phase.payment?.type || 'sol',
                                        amount: phase.payment?.amount ?? phase.price,
                                        mint: phase.payment?.mint,
                                        destination: dest || undefined,
                                    },
                                });
                            }}
                            placeholder="Defaults to your creator wallet"
                            className="bg-background/50 border-white/10 font-mono text-xs"
                            spellCheck={false}
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Where mint payments are sent. Leave blank to receive in your connected wallet.
                        </p>
                    </div>
                </div>
                <div className="space-y-2 p-4 rounded-xl bg-secondary/20 border border-white/5 backdrop-blur-sm">
                    <Label className="flex items-center gap-2 text-primary font-semibold"><Users className="w-4 h-4" /> Max Per Wallet</Label>
                    <Input
                        type="number"
                        value={phase.maxPerWallet || 0}
                        onChange={(e) => onChange({ maxPerWallet: Number(e.target.value) })}
                        className="bg-background/50 border-white/10"
                        placeholder="Unlimited"
                    />
                    <p className="text-xs text-muted-foreground">Set 0 for unlimited</p>
                </div>
            </div>

            {/* Schedule Config */}
            <div className="space-y-2 p-4 rounded-xl bg-secondary/20 border border-white/5 backdrop-blur-sm">
                <Label className="flex items-center gap-2 text-primary mb-2 font-semibold"><Clock className="w-4 h-4" /> Schedule</Label>
                <div className="flex flex-col md:flex-row gap-4">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal bg-background/50 border-white/10", !phase.startTime && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {phase.startTime ? format(phase.startTime, "PPP") : <span>Pick Start Date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={phase.startTime || undefined} onSelect={(d) => onChange({ startTime: d })} initialFocus />
                        </PopoverContent>
                    </Popover>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal bg-background/50 border-white/10", !phase.endTime && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {phase.endTime ? format(phase.endTime, "PPP") : <span>Pick End Date (Optional)</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={phase.endTime || undefined} onSelect={(d) => onChange({ endTime: d })} initialFocus />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {/* Advanced Guards Accordion-style - Only for Solana */}
            {isSolana && (
                <div className="space-y-4">
                    <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Advanced Protection</Label>

                    {/* Gatekeeper (Captcha) */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/20 border border-white/5 hover:border-primary/20 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-blue-500/10 text-blue-400">
                                <Bot className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="font-medium">Bot Protection (Captcha)</p>
                                <p className="text-xs text-muted-foreground">Require user to solve puzzle via Civic/Gateway</p>
                            </div>
                        </div>
                        <Switch checked={!!phase.gatekeeper} onCheckedChange={toggleGatekeeper} />
                    </div>

                    {/* NFT Gate */}
                    <div className="space-y-3 p-4 rounded-xl bg-secondary/20 border border-white/5 hover:border-primary/20 transition-all">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-purple-500/10 text-purple-400">
                                    <Lock className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-medium">NFT Holder Gate</p>
                                    <p className="text-xs text-muted-foreground">Only owners of a specific collection can mint</p>
                                </div>
                            </div>
                            <Switch checked={!!phase.nftGate} onCheckedChange={toggleNftGate} />
                        </div>

                        {phase.nftGate && (
                            <div className="pt-2 animate-in slide-in-from-top-2">
                                <Label className="text-xs">Required Collection Address (Mint)</Label>
                                <Input
                                    value={phase.nftGate.collection}
                                    onChange={(e) => onChange({ nftGate: { ...phase.nftGate!, collection: e.target.value } })}
                                    placeholder="Address of the collection NFT..."
                                    className="mt-1 bg-background/50 border-white/10 font-mono text-xs"
                                />
                            </div>
                        )}
                    </div>

                    {/* Allowlist (Merkle) is usually handled by uploading a CSV in the modal, 
                        but we can show status here */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/20 border border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-green-500/10 text-green-400">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="font-medium">Allowlist</p>
                                <p className="text-xs text-muted-foreground">
                                    {phase.merkleRoot ? "Active (Merkle Root Set)" : "Upload wallet list in phase settings"}
                                </p>
                            </div>
                        </div>
                        {phase.merkleRoot && <Badge variant="secondary" className="bg-green-500/20 text-green-400 hover:bg-green-500/30">Active</Badge>}
                    </div>

                </div>
            )}
        </div>
    );
}
