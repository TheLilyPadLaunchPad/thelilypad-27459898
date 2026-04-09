import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Filter,
    Search,
    Grid3X3,
    Pencil,
    ChevronRight,
    CheckCircle2,
    Download,
    Rocket,
    RotateCcw,
    Layers,
    Eye,
    X,
    Shuffle,
    Sparkles,
    Image as ImageIcon,
    Upload,
    Trash2,
    Plus,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { GeneratedAsset } from "@/lib/assetGenerator";
import type { Layer, LayerTrait } from "@/components/launchpad/LayerManager";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface CollectionPreviewEditorProps {
    assets: GeneratedAsset[];
    layers: Layer[];
    collectionName: string;
    onAssetsChange: (assets: GeneratedAsset[]) => void;
    onDownload: (format: "Solana" | "Standard") => void;
    onMint?: () => void;
    onRegenerate?: () => void;
    isDownloading?: boolean;
    downloadProgress?: number;
    downloadStatus?: string;
}

interface TraitFilter {
    layerName: string;
    traitName: string;
    checked: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Count how many assets use a specific trait value */
function countTraitUsage(
    assets: GeneratedAsset[],
    layerName: string,
    traitName: string
): number {
    return assets.filter((a) =>
        a.traits.some((t) => t.layer === layerName && t.trait === traitName)
    ).length;
}

/** Recomposite a single asset after a trait swap (canvas-based) */
async function recompositeAsset(
    asset: GeneratedAsset,
    layers: Layer[]
): Promise<string> {
    const canvas = document.createElement("canvas");
    // Use the first trait's file dimensions or default to 1024
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const trait of asset.traits) {
        // Find the matching LayerTrait from layers to get its preview
        const layer = layers.find((l) => l.name === trait.layer);
        const layerTrait = layer?.traits.find((t) => t.name === trait.trait);
        const src = layerTrait?.preview || "";
        if (!src) continue;

        try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = src;
            });
            // Set canvas size from actual first image
            if (canvas.width === 1024 && img.width > 0) {
                canvas.width = img.width;
                canvas.height = img.height;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        } catch {
            /* skip missing */
        }
    }
    return canvas.toDataURL("image/png");
}

// ── Component ────────────────────────────────────────────────────────────────

export function CollectionPreviewEditor({
    assets,
    layers,
    collectionName,
    onAssetsChange,
    onDownload,
    onMint,
    onRegenerate,
    isDownloading,
    downloadProgress,
    downloadStatus,
}: CollectionPreviewEditorProps) {
    const [selectedId, setSelectedId] = useState<string | null>(
        assets[0]?.id ?? null
    );
    const [searchQuery, setSearchQuery] = useState("");
    const [exportFormat, setExportFormat] = useState<"Solana" | "Standard">("Solana");
    const [editingTraitLayer, setEditingTraitLayer] = useState<string | null>(null);
    const [filterCollapsed, setFilterCollapsed] = useState<Record<string, boolean>>({});

    // ── Trait Filters ────────────────────────────────────────────────────────
    const [filters, setFilters] = useState<TraitFilter[]>(() => {
        const f: TraitFilter[] = [];
        layers.forEach((layer) => {
            layer.traits.forEach((trait) => {
                f.push({
                    layerName: layer.name,
                    traitName: trait.name,
                    checked: true,
                });
            });
        });
        return f;
    });

    const toggleFilter = (layerName: string, traitName: string) => {
        setFilters((prev) =>
            prev.map((f) =>
                f.layerName === layerName && f.traitName === traitName
                    ? { ...f, checked: !f.checked }
                    : f
            )
        );
    };

    const selectAllInLayer = (layerName: string) => {
        setFilters((prev) =>
            prev.map((f) =>
                f.layerName === layerName ? { ...f, checked: true } : f
            )
        );
    };

    const deselectAllInLayer = (layerName: string) => {
        setFilters((prev) =>
            prev.map((f) =>
                f.layerName === layerName ? { ...f, checked: false } : f
            )
        );
    };

    // ── Filtered & Searched Assets ───────────────────────────────────────────
    const filteredAssets = useMemo(() => {
        let result = assets;

        // Apply trait filters — an asset matches if, for every layer that has
        // at least one unchecked trait, the asset's trait for that layer is checked
        const layerNames = [...new Set(filters.map((f) => f.layerName))];
        for (const layerName of layerNames) {
            const layerFilters = filters.filter((f) => f.layerName === layerName);
            const allChecked = layerFilters.every((f) => f.checked);
            if (allChecked) continue; // no filtering needed for this layer

            const checkedTraits = new Set(
                layerFilters.filter((f) => f.checked).map((f) => f.traitName)
            );
            result = result.filter((asset) => {
                const assetTrait = asset.traits.find((t) => t.layer === layerName);
                return assetTrait ? checkedTraits.has(assetTrait.trait) : true;
            });
        }

        // Apply search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(
                (a) =>
                    a.name.toLowerCase().includes(q) ||
                    a.traits.some((t) => t.trait.toLowerCase().includes(q))
            );
        }

        return result;
    }, [assets, filters, searchQuery]);

    // ── Selected Asset ───────────────────────────────────────────────────────
    const selectedAsset = useMemo(
        () => assets.find((a) => a.id === selectedId) ?? null,
        [assets, selectedId]
    );

    // ── Trait Swap ───────────────────────────────────────────────────────────
    const handleTraitSwap = useCallback(
        async (layerName: string, newTrait: LayerTrait) => {
            if (!selectedAsset) return;

            const updatedAssets = assets.map((asset) => {
                if (asset.id !== selectedAsset.id) return asset;
                return {
                    ...asset,
                    traits: asset.traits.map((t) =>
                        t.layer === layerName
                            ? { ...t, trait: newTrait.name, file: newTrait.file! }
                            : t
                    ),
                    metadata: {
                        ...asset.metadata,
                        attributes: asset.metadata.attributes.map((a) =>
                            a.trait_type === layerName
                                ? { ...a, value: newTrait.name }
                                : a
                        ),
                    },
                };
            });

            // Recomposite the preview
            const updatedAsset = updatedAssets.find(
                (a) => a.id === selectedAsset.id
            );
            if (updatedAsset) {
                try {
                    const newPreview = await recompositeAsset(updatedAsset, layers);
                    const finalAssets = updatedAssets.map((a) =>
                        a.id === updatedAsset.id ? { ...a, preview: newPreview } : a
                    );
                    onAssetsChange(finalAssets);
                    toast.success(`Swapped ${layerName} → ${newTrait.name}`);
                } catch {
                    onAssetsChange(updatedAssets);
                    toast.success(`Swapped ${layerName} → ${newTrait.name} (preview may need refresh)`);
                }
            }

            setEditingTraitLayer(null);
        },
        [selectedAsset, assets, layers, onAssetsChange]
    );

    // ── Custom 1/1 Handlers ──────────────────────────────────────────────────
    const handleToggleOneOfOne = useCallback(async () => {
        if (!selectedAsset) return;
        const isTurningInto1of1 = !selectedAsset.isOneOfOne;

        let newPreview = selectedAsset.preview;
        let finalAssets = assets.map(asset => {
            if (asset.id !== selectedAsset.id) return asset;
            return {
                ...asset,
                isOneOfOne: isTurningInto1of1,
                // If reverting, we clear custom files to start fresh next time
                customFile: isTurningInto1of1 ? asset.customFile : undefined
            };
        });

        // If reverting to generated, recalculate the preview to remove any custom image
        if (!isTurningInto1of1 && selectedAsset.customFile) {
            try {
                const targetAsset = finalAssets.find(a => a.id === selectedAsset.id)!;
                newPreview = await recompositeAsset(targetAsset, layers);
                finalAssets = finalAssets.map(a => a.id === selectedAsset.id ? { ...a, preview: newPreview } : a);
            } catch (err) {
                console.error("Failed to restore preview", err);
            }
        }

        onAssetsChange(finalAssets);
        toast.success(isTurningInto1of1 ? "Turned into Custom 1/1 NFT" : "Reverted to Generated NFT");
    }, [selectedAsset, assets, layers, onAssetsChange]);

    const handleUpdateOneOfOneImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!selectedAsset || !e.target.files?.[0]) return;
        const file = e.target.files[0];
        const previewUrl = URL.createObjectURL(file);

        const updatedAssets = assets.map(asset => {
            if (asset.id !== selectedAsset.id) return asset;
            return {
                ...asset,
                customFile: file,
                preview: previewUrl,
            };
        });
        onAssetsChange(updatedAssets);
        toast.success("1/1 Image Updated");
    }, [selectedAsset, assets, onAssetsChange]);

    const handleUpdateOneOfOneAttribute = useCallback((index: number, key: string, value: string) => {
        if (!selectedAsset) return;
        const updatedAssets = assets.map(asset => {
            if (asset.id !== selectedAsset.id) return asset;
            const newAttributes = [...asset.metadata.attributes];
            const newTraits = [...asset.traits];

            if (newAttributes[index]) {
                newAttributes[index] = { trait_type: key, value: value };
            }
            if (newTraits[index]) {
                newTraits[index] = { ...newTraits[index], layer: key, trait: value };
            }

            return {
                ...asset,
                traits: newTraits,
                metadata: { ...asset.metadata, attributes: newAttributes }
            };
        });
        onAssetsChange(updatedAssets);
    }, [selectedAsset, assets, onAssetsChange]);

    const handleUpdateOneOfOneMetadataFields = useCallback((field: "name" | "description", value: string) => {
        if (!selectedAsset) return;
        const updatedAssets = assets.map(asset => {
            if (asset.id !== selectedAsset.id) return asset;
            return {
                ...asset,
                name: field === "name" ? value : asset.name,
                metadata: {
                    ...asset.metadata,
                    [field]: value
                }
            };
        });
        onAssetsChange(updatedAssets);
    }, [selectedAsset, assets, onAssetsChange]);

    // ── Grouped layers for filter sidebar ────────────────────────────────────
    const filterGroups = useMemo(() => {
        return layers
            .filter((l) => l.visible && l.traits.length > 0)
            .map((layer) => ({
                name: layer.name,
                traitCount: layer.traits.length,
                traits: layer.traits.map((t) => ({
                    ...t,
                    usage: countTraitUsage(assets, layer.name, t.name),
                    percentage: ((countTraitUsage(assets, layer.name, t.name) / assets.length) * 100).toFixed(1),
                    checked: filters.find(
                        (f) => f.layerName === layer.name && f.traitName === t.name
                    )?.checked ?? true,
                })),
            }));
    }, [layers, assets, filters]);

    return (
        <div className="flex flex-col h-full w-full">
            {/* ── Top Bar ─────────────────────────────────────────────────── */}
            <div className="px-4 py-2 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
                {/* Row 1: Title + count */}
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                            <Grid3X3 className="w-4 h-4 text-primary" />
                        </div>
                        <h2 className="text-sm font-bold tracking-tight truncate">
                            {collectionName || "Collection"} Preview
                        </h2>
                        <Badge variant="outline" className="text-[10px] h-5 font-mono shrink-0">
                            {filteredAssets.length} / {assets.length}
                        </Badge>
                    </div>
                </div>


            </div>

            {/* ── Main Panels ─────────────────────────────────────────────── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* ─── PANEL 1: Filter Sidebar ────────────────────────────── */}
                <div className="w-[200px] border-r border-border bg-card/30 flex flex-col shrink-0">
                    <div className="px-3 py-2.5 border-b border-border/50 flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                            Filter by property
                        </span>
                    </div>
                    <div className="px-3 py-1.5 text-[10px] text-muted-foreground">
                        Selected: {filteredAssets.length === assets.length ? "All" : `${filteredAssets.length} items`}
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="px-2 pb-4 space-y-1">
                            {filterGroups.map((group) => (
                                <div key={group.name} className="rounded-lg overflow-hidden">
                                    {/* Layer Header */}
                                    <button
                                        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-muted/50 rounded-md transition-colors"
                                        onClick={() =>
                                            setFilterCollapsed((prev) => ({
                                                ...prev,
                                                [group.name]: !prev[group.name],
                                            }))
                                        }
                                    >
                                        <span className="text-xs font-bold">
                                            {group.name}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <Badge
                                                variant="secondary"
                                                className="text-[9px] h-4 px-1 font-mono"
                                            >
                                                {group.traitCount}
                                            </Badge>
                                            <ChevronRight
                                                className={cn(
                                                    "w-3 h-3 text-muted-foreground transition-transform",
                                                    !filterCollapsed[group.name] &&
                                                    "rotate-90"
                                                )}
                                            />
                                        </div>
                                    </button>

                                    {/* Trait Checkboxes */}
                                    <AnimatePresence>
                                        {!filterCollapsed[group.name] && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.15 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="pl-1 space-y-0.5 pb-2">
                                                    {group.traits.map((trait) => (
                                                        <label
                                                            key={trait.id}
                                                            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/40 cursor-pointer group/trait"
                                                        >
                                                            <Checkbox
                                                                checked={trait.checked}
                                                                onCheckedChange={() =>
                                                                    toggleFilter(
                                                                        group.name,
                                                                        trait.name
                                                                    )
                                                                }
                                                                className="h-3.5 w-3.5"
                                                            />
                                                            <span className="flex-1 text-[11px] truncate">
                                                                {trait.name}
                                                            </span>
                                                            <span className="text-[9px] text-muted-foreground font-mono tabular-nums whitespace-nowrap">
                                                                {trait.usage}{" "}
                                                                <span className="opacity-60">
                                                                    ({trait.percentage}%)
                                                                </span>
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                {/* ─── PANEL 2: Collection Grid ───────────────────────────── */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Search bar & Action Buttons */}
                    <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground hidden sm:flex">
                            <ImageIcon className="w-3.5 h-3.5 text-primary" />
                            <span className="font-bold">Collection preview</span>
                        </div>

                        <div className="flex-1 min-w-0" />

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                            {onRegenerate && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onRegenerate}
                                    className="h-8 text-xs gap-1.5"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span className="hidden md:inline">Regenerate</span>
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onDownload(exportFormat)}
                                disabled={isDownloading}
                                className="h-8 text-xs gap-1.5"
                            >
                                <Download className="w-3.5 h-3.5" />
                                {isDownloading
                                    ? <span className="hidden md:inline">{`${downloadStatus || "Exporting"}… ${downloadProgress || 0}%`}</span>
                                    : <span className="hidden md:inline">Download ZIP</span>}
                            </Button>

                            <Select
                                value={exportFormat}
                                onValueChange={(val: any) => setExportFormat(val)}
                                disabled={isDownloading}
                            >
                                <SelectTrigger className="h-8 text-xs w-[120px]">
                                    <SelectValue placeholder="Format" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Solana">Solana</SelectItem>
                                    <SelectItem value="Standard">Standard</SelectItem>
                                </SelectContent>
                            </Select>

                            {onMint && (
                                <Button
                                    size="sm"
                                    onClick={onMint}
                                    className="h-8 text-xs gap-1.5 bg-gradient-to-r from-primary to-accent"
                                >
                                    <Rocket className="w-3.5 h-3.5" />
                                    <span className="hidden md:inline">Mint Collection</span>
                                </Button>
                            )}
                        </div>

                        {/* Search Box */}
                        <div className="relative w-full sm:w-48 shrink-0">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                            <Input
                                placeholder="Search by name or trait…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-8 text-[11px] pl-7 bg-muted/30 border-border/50 transition-colors focus-visible:bg-background"
                            />
                        </div>
                    </div>

                    {/* Grid */}
                    <ScrollArea className="flex-1">
                        <div className="p-3 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-5 lg:grid-cols-6 gap-2">
                            {filteredAssets.map((asset, idx) => (
                                <button
                                    key={asset.id}
                                    onClick={() => {
                                        setSelectedId(asset.id);
                                        setEditingTraitLayer(null);
                                    }}
                                    className={cn(
                                        "group relative rounded-lg overflow-hidden border-2 transition-all duration-150 aspect-square",
                                        selectedId === asset.id
                                            ? "border-primary ring-2 ring-primary/30 scale-[1.02]"
                                            : "border-transparent hover:border-primary/40"
                                    )}
                                >
                                    {asset.preview ? (
                                        <img
                                            src={asset.preview}
                                            alt={asset.name}
                                            className="w-full h-full object-contain"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-muted flex items-center justify-center">
                                            <ImageIcon className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                    )}
                                    {/* Label */}
                                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4">
                                        <p className="text-[9px] font-bold text-white truncate">
                                            {asset.name.replace(collectionName, "").trim() || `#${idx + 1}`}
                                        </p>
                                    </div>
                                    {/* Selected indicator */}
                                    {selectedId === asset.id && (
                                        <div className="absolute top-1 right-1">
                                            <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                                <CheckCircle2 className="w-3 h-3 text-primary-foreground" />
                                            </div>
                                        </div>
                                    )}
                                    {/* 1/1 indicator */}
                                    {asset.isOneOfOne && (
                                        <div className="absolute top-1 left-1">
                                            <Badge className="text-[7px] h-4 px-1 bg-amber-500/90 text-white border-0">
                                                <Sparkles className="w-2.5 h-2.5 mr-0.5" /> 1/1
                                            </Badge>
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>

                        {filteredAssets.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
                                <Filter className="w-8 h-8 mb-2 opacity-30" />
                                <p>No items match current filters</p>
                                <Button
                                    variant="link"
                                    size="sm"
                                    onClick={() =>
                                        setFilters((prev) =>
                                            prev.map((f) => ({ ...f, checked: true }))
                                        )
                                    }
                                    className="text-xs"
                                >
                                    Reset all filters
                                </Button>
                            </div>
                        )}
                    </ScrollArea>
                </div>

                {/* ─── PANEL 3: Selected NFT Detail ───────────────────────── */}
                <div className="w-[260px] border-l border-border bg-card/30 flex flex-col shrink-0">
                    {selectedAsset ? (
                        <>
                            {/* Preview Image */}
                            <div className="p-3">
                                <div className="aspect-square rounded-xl overflow-hidden border border-border bg-muted/20">
                                    {selectedAsset.preview ? (
                                        <img
                                            src={selectedAsset.preview}
                                            alt={selectedAsset.name}
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <ImageIcon className="w-10 h-10 text-muted-foreground opacity-30" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Name */}
                            <div className="px-3 pb-2 flex items-center gap-2">
                                <Pencil className="w-3 h-3 text-muted-foreground" />
                                <span className="text-sm font-bold truncate">
                                    {selectedAsset.name}
                                </span>
                            </div>

                            <Separator />

                            {selectedAsset.isOneOfOne ? (
                                <ScrollArea className="flex-1 px-3">
                                    <div className="space-y-4 pb-4">
                                        <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                                            <p className="text-xs font-bold text-primary flex items-center gap-1.5 mb-2">
                                                <Sparkles className="w-3.5 h-3.5" />
                                                Custom 1/1 Editor
                                            </p>
                                            <Label className="text-[10px] text-muted-foreground mb-1 block">Image Upload</Label>
                                            <label className="flex items-center justify-center w-full h-10 px-4 transition bg-background border border-dashed rounded-md appearance-none cursor-pointer hover:border-primary focus:outline-none">
                                                <span className="flex items-center space-x-2">
                                                    <Upload className="w-4 h-4 text-muted-foreground" />
                                                    <span className="text-xs font-medium text-muted-foreground">
                                                        Select new image
                                                    </span>
                                                </span>
                                                <input type="file" name="file_upload" className="hidden" accept="image/*" onChange={handleUpdateOneOfOneImage} />
                                            </label>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] text-muted-foreground">Name</Label>
                                            <Input
                                                value={selectedAsset.name}
                                                onChange={(e) => handleUpdateOneOfOneMetadataFields("name", e.target.value)}
                                                className="h-8 text-xs"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] text-muted-foreground">Description</Label>
                                            <Textarea
                                                value={selectedAsset.metadata.description}
                                                onChange={(e) => handleUpdateOneOfOneMetadataFields("description", e.target.value)}
                                                className="text-xs min-h-[60px] resize-none"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] text-muted-foreground">Attributes</Label>
                                            <div className="space-y-2">
                                                {selectedAsset.metadata.attributes.map((attr, idx) => (
                                                    <div key={idx} className="flex gap-2">
                                                        <Input
                                                            value={attr.trait_type}
                                                            onChange={(e) => handleUpdateOneOfOneAttribute(idx, e.target.value, attr.value)}
                                                            className="h-7 text-[10px] bg-muted/30"
                                                            placeholder="Type"
                                                        />
                                                        <Input
                                                            value={attr.value}
                                                            onChange={(e) => handleUpdateOneOfOneAttribute(idx, attr.trait_type, e.target.value)}
                                                            className="h-7 text-[10px]"
                                                            placeholder="Value"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="px-3 pb-4">
                                        <Button variant="outline" size="sm" onClick={handleToggleOneOfOne} className="w-full text-xs">
                                            Revert to Generated
                                        </Button>
                                    </div>
                                </ScrollArea>
                            ) : (
                                <>
                                    {/* Trait Properties */}
                                    <div className="px-3 py-2 flex items-center justify-between">
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                                            Select property to edit
                                        </p>
                                        <Badge variant="outline" className="text-[8px]">
                                            Generated
                                        </Badge>
                                    </div>

                                    <ScrollArea className="flex-1 px-3">
                                        <div className="grid grid-cols-2 gap-1.5 pb-4">
                                            {selectedAsset.traits.map((trait) => {
                                                const usage = countTraitUsage(
                                                    assets,
                                                    trait.layer,
                                                    trait.trait
                                                );
                                                const pct = (
                                                    (usage / assets.length) *
                                                    100
                                                ).toFixed(1);
                                                const isEditing =
                                                    editingTraitLayer === trait.layer;

                                                return (
                                                    <button
                                                        key={trait.layer}
                                                        onClick={() =>
                                                            setEditingTraitLayer(
                                                                isEditing
                                                                    ? null
                                                                    : trait.layer
                                                            )
                                                        }
                                                        className={cn(
                                                            "rounded-lg border p-2 text-left transition-all hover:border-primary/50",
                                                            isEditing
                                                                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                                                                : "border-border bg-card/50"
                                                        )}
                                                    >
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                "text-[8px] h-4 px-1.5 uppercase tracking-wider mb-1",
                                                                isEditing
                                                                    ? "border-primary text-primary"
                                                                    : "border-muted-foreground/30"
                                                            )}
                                                        >
                                                            {trait.layer}
                                                        </Badge>
                                                        <p className="text-[11px] font-bold truncate">
                                                            {trait.trait}
                                                        </p>
                                                        <p className="text-[9px] text-muted-foreground mt-0.5">
                                                            Used in {usage} items ({pct}%)
                                                        </p>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="py-2 border-t border-border mt-2 space-y-2">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                                                Advanced Customization
                                            </p>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleToggleOneOfOne}
                                                className="w-full text-xs gap-1.5 h-8 bg-card"
                                            >
                                                <Sparkles className="w-3 h-3 text-primary" />
                                                Make Custom 1/1
                                            </Button>
                                        </div>
                                    </ScrollArea>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                            <Eye className="w-8 h-8 mb-3 opacity-20" />
                            <p className="text-sm font-medium">Select an NFT</p>
                            <p className="text-xs mt-1 opacity-60">
                                Click any item in the grid to inspect and edit
                            </p>
                        </div>
                    )}
                </div>

                {/* ─── PANEL 4: Trait Selector (shown when editing) ────────── */}
                <AnimatePresence>
                    {editingTraitLayer && selectedAsset && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 200, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="border-l border-border bg-card/40 flex flex-col shrink-0 overflow-hidden"
                        >
                            <div className="px-3 py-2.5 border-b border-border/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Shuffle className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-xs font-bold uppercase tracking-wider">
                                        Select trait
                                    </span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={() => setEditingTraitLayer(null)}
                                >
                                    <X className="w-3 h-3" />
                                </Button>
                            </div>

                            <p className="px-3 pt-2 pb-1 text-[10px] text-muted-foreground">
                                <span className="font-bold text-primary">{editingTraitLayer}</span>{" "}
                                — pick a new trait
                            </p>

                            <ScrollArea className="flex-1">
                                <div className="px-2 pb-4 grid grid-cols-2 gap-1.5 pt-1">
                                    {layers
                                        .find((l) => l.name === editingTraitLayer)
                                        ?.traits.map((trait) => {
                                            const isActive =
                                                selectedAsset.traits.find(
                                                    (t) =>
                                                        t.layer ===
                                                        editingTraitLayer
                                                )?.trait === trait.name;

                                            return (
                                                <button
                                                    key={trait.id}
                                                    onClick={() =>
                                                        !isActive &&
                                                        handleTraitSwap(
                                                            editingTraitLayer,
                                                            trait
                                                        )
                                                    }
                                                    className={cn(
                                                        "rounded-lg overflow-hidden border transition-all",
                                                        isActive
                                                            ? "border-primary ring-1 ring-primary/30"
                                                            : "border-border hover:border-primary/50"
                                                    )}
                                                >
                                                    <div className="aspect-square bg-muted/20">
                                                        <img
                                                            src={trait.preview}
                                                            alt={trait.name}
                                                            className="w-full h-full object-contain"
                                                        />
                                                    </div>
                                                    <div className="p-1 bg-card/60 border-t border-border/30">
                                                        <p
                                                            className={cn(
                                                                "text-[9px] font-medium truncate text-center",
                                                                isActive &&
                                                                "text-primary font-bold"
                                                            )}
                                                        >
                                                            {trait.name}
                                                        </p>
                                                    </div>
                                                    {isActive && (
                                                        <div className="absolute top-0.5 right-0.5">
                                                            <div className="w-3 h-3 rounded-full bg-primary flex items-center justify-center">
                                                                <CheckCircle2 className="w-2 h-2 text-primary-foreground" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                </div>
                            </ScrollArea>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
