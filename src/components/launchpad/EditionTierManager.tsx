import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Crown, Gem, Shield, Star, Trash2, Plus, Clock, ChevronDown, ChevronUp,
    Layers, DollarSign, Calendar, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtworkItem } from "./ArtworkUploader";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EditionTier {
    id: string;
    name: string;
    editionCount: number;
    price: string;
    /** If set, minting opens at this ISO datetime */
    opensAt?: string;
    /** If set, minting closes at this ISO datetime */
    closesAt?: string;
    /** UI color for the tier */
    color: TierColor;
}

export type TierColor = "bronze" | "silver" | "gold" | "legendary" | "custom";

export interface ArtworkEditionConfig {
    artworkId: string;
    /** True = use custom tiers for this artwork. False = single flat edition count */
    useTiers: boolean;
    /** Flat edition count (used when useTiers = false) */
    flatCount: number;
    /** Flat price */
    flatPrice: string;
    tiers: EditionTier[];
}

interface EditionTierManagerProps {
    artworks: ArtworkItem[];
    configs: ArtworkEditionConfig[];
    onConfigsChange: (configs: ArtworkEditionConfig[]) => void;
    chainSymbol?: string;
}

// ── Preset tier templates ─────────────────────────────────────────────────────

const TIER_PRESETS: Omit<EditionTier, "id">[] = [
    { name: "Bronze", editionCount: 100, price: "0", color: "bronze" },
    { name: "Silver", editionCount: 50, price: "0", color: "silver" },
    { name: "Gold", editionCount: 20, price: "0", color: "gold" },
    { name: "Legendary", editionCount: 5, price: "0", color: "legendary" },
];

const COLOR_MAP: Record<TierColor, { bg: string; border: string; text: string; icon: React.FC<any> }> = {
    bronze: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-500", icon: Shield },
    silver: { bg: "bg-slate-400/10", border: "border-slate-400/30", text: "text-slate-400", icon: Star },
    gold: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-500", icon: Crown },
    legendary: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", icon: Gem },
    custom: { bg: "bg-primary/10", border: "border-primary/30", text: "text-primary", icon: Layers },
};

function makeTierId() {
    return `tier_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeDefaultConfig(artworkId: string): ArtworkEditionConfig {
    return {
        artworkId,
        useTiers: false,
        flatCount: 1,
        flatPrice: "0",
        tiers: [],
    };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EditionTierManager({
    artworks,
    configs,
    onConfigsChange,
    chainSymbol = "SOL",
}: EditionTierManagerProps) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(
        new Set(artworks.slice(0, 1).map((a) => a.id))
    );

    // Always ensure every artwork has a config
    const getConfig = (artworkId: string): ArtworkEditionConfig =>
        configs.find((c) => c.artworkId === artworkId) ?? makeDefaultConfig(artworkId);

    const updateConfig = (artworkId: string, patch: Partial<ArtworkEditionConfig>) => {
        const existing = getConfig(artworkId);
        const updated = { ...existing, ...patch };
        const rest = configs.filter((c) => c.artworkId !== artworkId);
        onConfigsChange([...rest, updated]);
    };

    const toggleExpanded = (id: string) =>
        setExpandedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    // Tier helpers
    const addTier = (artworkId: string, preset?: Omit<EditionTier, "id">) => {
        const cfg = getConfig(artworkId);
        const newTier: EditionTier = {
            id: makeTierId(),
            name: preset?.name ?? "New Tier",
            editionCount: preset?.editionCount ?? 10,
            price: preset?.price ?? "0",
            color: preset?.color ?? "custom",
        };
        updateConfig(artworkId, { tiers: [...cfg.tiers, newTier] });
    };

    const updateTier = (artworkId: string, tierId: string, patch: Partial<EditionTier>) => {
        const cfg = getConfig(artworkId);
        updateConfig(artworkId, {
            tiers: cfg.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)),
        });
    };

    const removeTier = (artworkId: string, tierId: string) => {
        const cfg = getConfig(artworkId);
        updateConfig(artworkId, { tiers: cfg.tiers.filter((t) => t.id !== tierId) });
    };

    const applyPresetTiers = (artworkId: string) => {
        const tiers: EditionTier[] = TIER_PRESETS.map((p) => ({ ...p, id: makeTierId() }));
        updateConfig(artworkId, { tiers, useTiers: true });
    };

    const totalEditions = (cfg: ArtworkEditionConfig) =>
        cfg.useTiers
            ? cfg.tiers.reduce((s, t) => s + t.editionCount, 0)
            : cfg.flatCount;

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold">Edition Configuration</h3>
                <Badge variant="secondary" className="text-[10px]">
                    {artworks.length} NFT{artworks.length !== 1 ? "s" : ""}
                </Badge>
            </div>

            <div className="space-y-2">
                {artworks.map((artwork) => {
                    const cfg = getConfig(artwork.id);
                    const isExpanded = expandedIds.has(artwork.id);
                    const total = totalEditions(cfg);

                    return (
                        <motion.div
                            key={artwork.id}
                            layout
                            className="rounded-xl border border-border/70 bg-card/50 overflow-hidden"
                        >
                            {/* ── Artwork Row Header ─────────────────────── */}
                            <button
                                className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
                                onClick={() => toggleExpanded(artwork.id)}
                            >
                                {/* Thumbnail */}
                                <div className="w-12 h-12 rounded-lg overflow-hidden border border-border shrink-0 bg-muted/30">
                                    {artwork.imageUrl ? (
                                        <img
                                            src={artwork.imageUrl}
                                            alt={artwork.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Layers className="w-5 h-5 text-muted-foreground/40" />
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold truncate">{artwork.name}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "text-[9px] h-4 px-1",
                                                cfg.useTiers
                                                    ? "border-primary/40 text-primary"
                                                    : "border-border text-muted-foreground"
                                            )}
                                        >
                                            {cfg.useTiers ? `${cfg.tiers.length} Tiers` : "Flat"}
                                        </Badge>
                                        <Badge variant="secondary" className="text-[9px] h-4 px-1 font-mono">
                                            {total.toLocaleString()} editions
                                        </Badge>
                                        {cfg.useTiers && cfg.tiers.some((t) => t.opensAt || t.closesAt) && (
                                            <Badge className="text-[9px] h-4 px-1 bg-blue-500/15 text-blue-400 border-blue-500/30">
                                                <Clock className="w-2.5 h-2.5 mr-0.5" />
                                                Time-gated
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                                ) : (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                                )}
                            </button>

                            {/* ── Expanded Content ───────────────────────── */}
                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="px-3 pb-4 pt-1 space-y-4 border-t border-border/50">

                                            {/* Use Tiers toggle */}
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                                                <div className="flex items-center gap-2">
                                                    <Gem className="w-4 h-4 text-primary" />
                                                    <div>
                                                        <p className="text-xs font-bold">Edition Tiers</p>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            Create multiple rarity tiers with different supplies &amp; prices
                                                        </p>
                                                    </div>
                                                </div>
                                                <Switch
                                                    checked={cfg.useTiers}
                                                    onCheckedChange={(v) => updateConfig(artwork.id, { useTiers: v })}
                                                />
                                            </div>

                                            {/* ── FLAT MODE ───────────────────────────── */}
                                            {!cfg.useTiers && (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs flex items-center gap-1">
                                                            <Layers className="w-3 h-3" />
                                                            Edition Count
                                                        </Label>
                                                        <Input
                                                            type="number"
                                                            min={1}
                                                            value={cfg.flatCount}
                                                            onChange={(e) =>
                                                                updateConfig(artwork.id, {
                                                                    flatCount: Math.max(1, Number(e.target.value)),
                                                                })
                                                            }
                                                            className="h-8 text-sm"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs flex items-center gap-1">
                                                            <DollarSign className="w-3 h-3" />
                                                            Price ({chainSymbol})
                                                        </Label>
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            step="0.01"
                                                            value={cfg.flatPrice}
                                                            onChange={(e) =>
                                                                updateConfig(artwork.id, { flatPrice: e.target.value })
                                                            }
                                                            className="h-8 text-sm"
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* ── TIER MODE ───────────────────────────── */}
                                            {cfg.useTiers && (
                                                <div className="space-y-3">
                                                    {/* Preset quick-apply */}
                                                    {cfg.tiers.length === 0 && (
                                                        <button
                                                            onClick={() => applyPresetTiers(artwork.id)}
                                                            className="w-full p-3 rounded-lg border-2 border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-all text-center group"
                                                        >
                                                            <Crown className="w-5 h-5 text-primary/60 group-hover:text-primary mx-auto mb-1 transition-colors" />
                                                            <p className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                                                                Apply Bronze / Silver / Gold / Legendary preset
                                                            </p>
                                                        </button>
                                                    )}

                                                    {/* Tier list */}
                                                    <div className="space-y-2">
                                                        <AnimatePresence>
                                                            {cfg.tiers.map((tier) => {
                                                                const colors = COLOR_MAP[tier.color];
                                                                const TierIcon = colors.icon;

                                                                return (
                                                                    <motion.div
                                                                        key={tier.id}
                                                                        initial={{ opacity: 0, y: -6 }}
                                                                        animate={{ opacity: 1, y: 0 }}
                                                                        exit={{ opacity: 0, height: 0 }}
                                                                        className={cn(
                                                                            "rounded-xl border p-3 space-y-3",
                                                                            colors.bg,
                                                                            colors.border
                                                                        )}
                                                                    >
                                                                        {/* Tier top row */}
                                                                        <div className="flex items-center gap-2">
                                                                            <TierIcon className={cn("w-4 h-4 shrink-0", colors.text)} />
                                                                            <Input
                                                                                value={tier.name}
                                                                                onChange={(e) => updateTier(artwork.id, tier.id, { name: e.target.value })}
                                                                                className="h-7 text-xs font-bold flex-1"
                                                                                placeholder="Tier name"
                                                                            />
                                                                            {/* Color picker */}
                                                                            <div className="flex gap-1">
                                                                                {(Object.keys(COLOR_MAP) as TierColor[]).map((c) => (
                                                                                    <button
                                                                                        key={c}
                                                                                        title={c}
                                                                                        onClick={() => updateTier(artwork.id, tier.id, { color: c })}
                                                                                        className={cn(
                                                                                            "w-4 h-4 rounded-full border-2 transition-all",
                                                                                            COLOR_MAP[c].text.replace("text-", "bg-").replace("/", "/50"),
                                                                                            tier.color === c
                                                                                                ? "scale-125 border-foreground/60"
                                                                                                : "border-transparent opacity-60 hover:opacity-100"
                                                                                        )}
                                                                                    />
                                                                                ))}
                                                                            </div>
                                                                            <button
                                                                                onClick={() => removeTier(artwork.id, tier.id)}
                                                                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                                                            >
                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </div>

                                                                        {/* Editions + Price */}
                                                                        <div className="grid grid-cols-2 gap-2">
                                                                            <div className="space-y-1">
                                                                                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                                    <Layers className="w-2.5 h-2.5" />
                                                                                    Editions
                                                                                </Label>
                                                                                <Input
                                                                                    type="number"
                                                                                    min={1}
                                                                                    value={tier.editionCount}
                                                                                    onChange={(e) =>
                                                                                        updateTier(artwork.id, tier.id, {
                                                                                            editionCount: Math.max(1, Number(e.target.value)),
                                                                                        })
                                                                                    }
                                                                                    className="h-7 text-xs"
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-1">
                                                                                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                                    <DollarSign className="w-2.5 h-2.5" />
                                                                                    Price ({chainSymbol})
                                                                                </Label>
                                                                                <Input
                                                                                    type="number"
                                                                                    min={0}
                                                                                    step="0.01"
                                                                                    value={tier.price}
                                                                                    onChange={(e) =>
                                                                                        updateTier(artwork.id, tier.id, { price: e.target.value })
                                                                                    }
                                                                                    className="h-7 text-xs"
                                                                                    placeholder="0.00"
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        {/* Time-based mint window */}
                                                                        <TimeMintWindow
                                                                            opensAt={tier.opensAt}
                                                                            closesAt={tier.closesAt}
                                                                            onChange={(patch) => updateTier(artwork.id, tier.id, patch)}
                                                                        />
                                                                    </motion.div>
                                                                );
                                                            })}
                                                        </AnimatePresence>
                                                    </div>

                                                    {/* Add tier */}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="w-full h-8 text-xs gap-1.5 border-dashed"
                                                        onClick={() => addTier(artwork.id)}
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                        Add Tier
                                                    </Button>

                                                    {/* Total summary */}
                                                    {cfg.tiers.length > 0 && (
                                                        <div className="flex justify-between items-center px-2 py-1.5 rounded-lg bg-muted/40 text-xs">
                                                            <span className="text-muted-foreground">Total editions for this NFT</span>
                                                            <span className="font-bold font-mono">
                                                                {cfg.tiers.reduce((s, t) => s + t.editionCount, 0).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>

            {/* Grand total */}
            {artworks.length > 1 && (
                <div className="flex justify-between items-center px-3 py-2 rounded-xl border border-primary/20 bg-primary/5 text-sm">
                    <span className="text-muted-foreground font-medium">Grand Total Editions</span>
                    <span className="font-black font-mono text-primary">
                        {artworks
                            .map((a) => totalEditions(getConfig(a.id)))
                            .reduce((s, n) => s + n, 0)
                            .toLocaleString()}
                    </span>
                </div>
            )}
        </div>
    );
}

// ── Sub-component: Time-based Mint Window ─────────────────────────────────────

interface TimeMintWindowProps {
    opensAt?: string;
    closesAt?: string;
    onChange: (patch: Partial<Pick<EditionTier, "opensAt" | "closesAt">>) => void;
}

function TimeMintWindow({ opensAt, closesAt, onChange }: TimeMintWindowProps) {
    const [enabled, setEnabled] = useState(!!(opensAt || closesAt));

    const toggle = (v: boolean) => {
        setEnabled(v);
        if (!v) onChange({ opensAt: undefined, closesAt: undefined });
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
                                <Clock className="w-3 h-3" />
                                Time-based mint window
                                <Info className="w-2.5 h-2.5 opacity-60" />
                            </label>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-xs">
                            Restrict this tier's mint to a specific time window. Collectors can only mint when the window is open.
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <Switch
                    checked={enabled}
                    onCheckedChange={toggle}
                />
            </div>

            <AnimatePresence>
                {enabled && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                    >
                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Calendar className="w-2.5 h-2.5" />
                                    Opens At
                                </Label>
                                <Input
                                    type="datetime-local"
                                    value={opensAt ?? ""}
                                    onChange={(e) => onChange({ opensAt: e.target.value || undefined })}
                                    className="h-7 text-[10px]"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Calendar className="w-2.5 h-2.5" />
                                    Closes At
                                </Label>
                                <Input
                                    type="datetime-local"
                                    value={closesAt ?? ""}
                                    onChange={(e) => onChange({ closesAt: e.target.value || undefined })}
                                    className="h-7 text-[10px]"
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
