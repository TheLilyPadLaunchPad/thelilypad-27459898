import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
    Sparkles,
    Layers,
    Download,
    RefreshCw,
    ArrowLeft,
    CheckCircle2,
    Palette,
    DownloadCloud,
    Rocket,
    ImageIcon,
    Wand2,
    Settings,
    ChevronRight,
    Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { LayerManager, Layer } from "@/components/launchpad/LayerManager";
import { TraitRarityEditor } from "@/components/launchpad/TraitRarityEditor";
import { TraitRulesManager, TraitRule } from "@/components/launchpad/TraitRulesManager";
import { CollectionPreviewEditor } from "@/components/launchpad/CollectionPreviewEditor";
import { generateAssets, GeneratedAsset } from "@/lib/assetGenerator";
import { bundleAssetsAsZip } from "@/lib/assetBundler";
import { cn } from "@/lib/utils";
import { useSEO } from "@/hooks/useSEO";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Step = "setup" | "layers" | "rarity" | "generate" | "ready";

const ASPECT_RATIOS = [
    { label: "1:1 (Square)", value: "1:1", w: 1, h: 1 },
    { label: "4:5 (Portrait)", value: "4:5", w: 4, h: 5 },
    { label: "3:4 (Portrait)", value: "3:4", w: 3, h: 4 },
    { label: "2:3 (Portrait)", value: "2:3", w: 2, h: 3 },
    { label: "9:16 (Vertical)", value: "9:16", w: 9, h: 16 },
    { label: "5:4 (Landscape)", value: "5:4", w: 5, h: 4 },
    { label: "4:3 (Landscape)", value: "4:3", w: 4, h: 3 },
    { label: "3:2 (Landscape)", value: "3:2", w: 3, h: 2 },
    { label: "16:9 (Widescreen)", value: "16:9", w: 16, h: 9 },
    { label: "Custom", value: "custom", w: 0, h: 0 },
] as const;

export default function ArtGenerator() {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState<Step>("setup");

    // Collection Metadata
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [targetSupply, setTargetSupply] = useState(100);
    const [resolution, setResolution] = useState(2000);
    const [resolutionHeight, setResolutionHeight] = useState(2000);
    const [aspectRatio, setAspectRatio] = useState("1:1");

    // Generation State
    const [layers, setLayers] = useState<Layer[]>([]);
    const [rules, setRules] = useState<TraitRule[]>([]);
    const [generatedAssets, setGeneratedAssets] = useState<GeneratedAsset[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadStatus, setDownloadStatus] = useState("");

    useSEO({
        title: "No-Code Art Generator | The Lily Pad",
        description: "Generate professional generative NFT collections with layers and rarity. Download as ZIP for Solana & Monad."
    });

    const handleGenerate = async () => {
        if (!name) return toast.error("Please enter a collection name first");
        if (layers.length === 0) return toast.error("Please add at least one layer");

        setIsGenerating(true);
        try {
            const assets = await generateAssets(
                layers,
                {
                    collectionName: name,
                    collectionSymbol: "", // Not needed for pure art gen 
                    description,
                    totalSupply: targetSupply,
                    allowDuplicates: false,
                    rules
                },
                (current, total) => setGenerationProgress({ current, total })
            );
            setGeneratedAssets(assets);
            setCurrentStep("ready");
            toast.success(`Generated ${assets.length} unique combinations!`);
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownload = async (format: "Solana" | "Standard" = "Solana") => {
        if (generatedAssets.length === 0) return;

        setIsDownloading(true);
        try {
            // Map GeneratedAsset to GeneratedNFT for the bundler
            const nfts = generatedAssets.map((asset, idx) => ({
                id: idx + 1,
                name: asset.name,
                isOneOfOne: asset.isOneOfOne,
                customFile: asset.customFile,
                metadataOverride: asset.isOneOfOne ? asset.metadata : undefined,
                traits: asset.traits.map(t => ({
                    layerId: t.layer,
                    layerName: t.layer,
                    traitId: t.trait,
                    traitName: t.trait,
                    imageUrl: t.file ? URL.createObjectURL(t.file) : undefined
                }))
            }));

            // Note: assetGenerator's assets already have 'preview' as the composited dataURL.
            // We use JSZip directly or the bundleAssetsAsZip helper.
            // Since bundleAssetsAsZip expects the generator-style NFTS, we'll use it since it handles metadata.

            const zipBlob = await bundleAssetsAsZip(
                nfts as any,
                name,
                description,
                format,
                resolution,
                (status, progress) => {
                    setDownloadStatus(status);
                    setDownloadProgress(progress);
                },
                "YOUR_IMAGE_CID",
                "export.zip",
                resolutionHeight
            );

            if (zipBlob) {
                const url = URL.createObjectURL(zipBlob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${name.replace(/ /g, "_")}_${format}_collection.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }

            toast.success("Collection downloaded successfully!");
        } catch (err: any) {
            toast.error("Download failed: " + err.message);
        } finally {
            setIsDownloading(false);
            setDownloadProgress(0);
        }
    };

    const variants = {
        enter: { x: 20, opacity: 0 },
        center: { x: 0, opacity: 1 },
        exit: { x: -20, opacity: 0 }
    };

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            <Navbar />

            {currentStep === "ready" && generatedAssets.length > 0 ? (
                /* ── Full-Page Collection Preview Editor ─────────────────── */
                <div className="flex-1 flex flex-col min-h-0" style={{ height: "calc(100vh - 64px)" }}>
                    <CollectionPreviewEditor
                        assets={generatedAssets}
                        layers={layers}
                        collectionName={name}
                        onAssetsChange={setGeneratedAssets}
                        onDownload={handleDownload}
                        onMint={() => navigate("/launchpad/create/solana/generative")}
                        onRegenerate={() => setCurrentStep("generate")}
                        isDownloading={isDownloading}
                        downloadProgress={downloadProgress}
                        downloadStatus={downloadStatus}
                    />
                </div>
            ) : (
                /* ── Standard Wizard Layout ──────────────────────────────── */
                <main className="flex-1 pt-24 pb-12 px-4 container max-w-5xl mx-auto flex flex-col items-center">
                    {/* Header */}
                    <div className="text-center space-y-3 mb-12">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary mb-2">
                            <Palette className="w-3 h-3" />
                            <span>No-Code Generative Art Tool</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black tracking-tight gradient-text">
                            Art Generator
                        </h1>
                        <p className="text-muted-foreground max-w-xl mx-auto">
                            Turn your creative layers into a complete generative collection.
                            No coding, just art. Optimized for Solana & Monad.
                        </p>
                    </div>

                    {/* Progress Tracker */}
                    <div className="w-full max-w-3xl mb-12 flex justify-between relative px-2">
                        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-muted -translate-y-1/2 z-0" />
                        {[
                            { id: "setup", label: "Identity", icon: Settings },
                            { id: "layers", label: "Layers", icon: Layers },
                            { id: "rarity", label: "Rarity", icon: Sparkles },
                            { id: "generate", label: "Bake", icon: Wand2 },
                        ].map((s, i) => (
                            <div key={s.id} className="relative z-10 flex flex-col items-center gap-2">
                                <div
                                    className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all duration-300",
                                        currentStep === s.id || (currentStep === "ready" && s.id === "generate")
                                            ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110"
                                            : "bg-card border-border text-muted-foreground"
                                    )}
                                >
                                    <s.icon className="w-5 h-5" />
                                </div>
                                <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-wider",
                                    (currentStep === s.id || (currentStep === "ready" && s.id === "generate")) ? "text-primary" : "text-muted-foreground"
                                )}>
                                    {s.label}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="w-full flex flex-col md:flex-row gap-8 items-start">
                        {/* Workspace Area */}
                        <div className="flex-1 w-full min-h-[500px]">
                            <AnimatePresence mode="wait">
                                {currentStep === "setup" && (
                                    <motion.div key="setup" initial="enter" animate="center" exit="exit" variants={variants} className="space-y-6">
                                        <Card className="glass-card p-8 border-primary/10">
                                            <CardHeader className="px-0 pt-0">
                                                <CardTitle className="text-xl">Collection Basics</CardTitle>
                                                <CardDescription>Tell us about your masterpiece</CardDescription>
                                            </CardHeader>
                                            <CardContent className="px-0 space-y-6">
                                                <div className="space-y-2">
                                                    <Label>Collection Name</Label>
                                                    <Input
                                                        placeholder="Digital Dreams"
                                                        value={name}
                                                        onChange={e => setName(e.target.value)}
                                                        className="h-12 text-lg font-bold"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Description</Label>
                                                    <Input
                                                        placeholder="A series of unique digital landscapes..."
                                                        value={description}
                                                        onChange={e => setDescription(e.target.value)}
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label>Target Supply</Label>
                                                        <Input
                                                            type="number"
                                                            value={targetSupply}
                                                            onChange={e => setTargetSupply(Number(e.target.value))}
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Aspect Ratio</Label>
                                                        <Select value={aspectRatio} onValueChange={(val) => {
                                                            setAspectRatio(val);
                                                            const preset = ASPECT_RATIOS.find(r => r.value === val);
                                                            if (preset && preset.value !== "custom") {
                                                                const base = resolution;
                                                                setResolutionHeight(Math.round(base * preset.h / preset.w));
                                                            }
                                                        }}>
                                                            <SelectTrigger>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {ASPECT_RATIOS.map(r => (
                                                                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Width (px)</Label>
                                                        <Input
                                                            type="number"
                                                            value={resolution}
                                                            onChange={e => {
                                                                const w = Number(e.target.value);
                                                                setResolution(w);
                                                                const preset = ASPECT_RATIOS.find(r => r.value === aspectRatio);
                                                                if (preset && preset.value !== "custom") {
                                                                    setResolutionHeight(Math.round(w * preset.h / preset.w));
                                                                }
                                                            }}
                                                        />
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            <Badge variant="outline" className="text-[9px] cursor-pointer hover:bg-muted" onClick={() => {
                                                                setResolution(500);
                                                                const preset = ASPECT_RATIOS.find(r => r.value === aspectRatio);
                                                                if (preset && preset.value !== "custom") setResolutionHeight(Math.round(500 * preset.h / preset.w));
                                                                else setResolutionHeight(500);
                                                            }}>500 Low</Badge>
                                                            <Badge variant="outline" className="text-[9px] cursor-pointer bg-primary/10 border-primary/20" onClick={() => {
                                                                setResolution(2000);
                                                                const preset = ASPECT_RATIOS.find(r => r.value === aspectRatio);
                                                                if (preset && preset.value !== "custom") setResolutionHeight(Math.round(2000 * preset.h / preset.w));
                                                                else setResolutionHeight(2000);
                                                            }}>2000 High</Badge>
                                                            <Badge variant="outline" className="text-[9px] cursor-pointer bg-primary/20 border-primary/30" onClick={() => {
                                                                setResolution(4000);
                                                                const preset = ASPECT_RATIOS.find(r => r.value === aspectRatio);
                                                                if (preset && preset.value !== "custom") setResolutionHeight(Math.round(4000 * preset.h / preset.w));
                                                                else setResolutionHeight(4000);
                                                            }}>4000+ Pro</Badge>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Height (px)</Label>
                                                        <Input
                                                            type="number"
                                                            value={resolutionHeight}
                                                            onChange={e => {
                                                                setResolutionHeight(Number(e.target.value));
                                                                setAspectRatio("custom");
                                                            }}
                                                            disabled={aspectRatio !== "custom"}
                                                        />
                                                        <p className="text-[9px] text-muted-foreground">Output: {resolution} × {resolutionHeight}px</p>
                                                    </div>
                                                </div>
                                                <Button
                                                    className="w-full h-12 text-lg gap-2 mt-4"
                                                    onClick={() => setCurrentStep("layers")}
                                                    disabled={!name}
                                                >
                                                    Next: Setup Layers <ChevronRight className="w-5 h-5" />
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                )}

                                {currentStep === "layers" && (
                                    <motion.div key="layers" initial="enter" animate="center" exit="exit" variants={variants} className="space-y-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <Button variant="ghost" onClick={() => setCurrentStep("setup")} className="gap-2">
                                                <ArrowLeft className="w-4 h-4" /> Back
                                            </Button>
                                            <Button onClick={() => setCurrentStep("rarity")} disabled={layers.length === 0} className="gap-2">
                                                Next: Set Rarity <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        <LayerManager layers={layers} onLayersChange={setLayers} />
                                    </motion.div>
                                )}

                                {currentStep === "rarity" && (
                                    <motion.div key="rarity" initial="enter" animate="center" exit="exit" variants={variants} className="space-y-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <Button variant="ghost" onClick={() => setCurrentStep("layers")} className="gap-2">
                                                <ArrowLeft className="w-4 h-4" /> Back
                                            </Button>
                                            <Button onClick={() => setCurrentStep("generate")} className="gap-2 bg-gradient-to-r from-primary to-accent">
                                                Proceed to Generate <Sparkles className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        <div className="space-y-8">
                                            <TraitRarityEditor layers={layers} onLayersChange={setLayers} />

                                            <div className="border-t border-border/50 pt-8 mt-8">
                                                <TraitRulesManager layers={layers} rules={rules} onRulesChange={setRules} />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {currentStep === "generate" && (
                                    <motion.div key="generate" initial="enter" animate="center" exit="exit" variants={variants} className="space-y-8 flex flex-col items-center justify-center text-center py-12">
                                        <div className="w-24 h-24 rounded-3xl bg-primary/20 flex items-center justify-center mb-4 animate-pulse">
                                            <Wand2 className="w-12 h-12 text-primary" />
                                        </div>
                                        <div className="space-y-2">
                                            <h2 className="text-3xl font-bold">Ready to bake?</h2>
                                            <p className="text-muted-foreground max-w-sm">
                                                We'll generate {targetSupply} unique combinations from your {layers.length} layers.
                                            </p>
                                        </div>

                                        {isGenerating ? (
                                            <div className="w-full max-w-sm space-y-4">
                                                <div className="flex justify-between text-sm font-medium">
                                                    <span>Generating masterpiece...</span>
                                                    <span>{Math.round((generationProgress.current / generationProgress.total) * 100)}%</span>
                                                </div>
                                                <Progress value={(generationProgress.current / generationProgress.total) * 100} className="h-3" />
                                                <p className="text-xs text-muted-foreground">Combining layers and calculating traits...</p>
                                            </div>
                                        ) : (
                                            <Button size="lg" className="h-16 px-12 text-xl font-bold gap-3 shadow-xl shadow-primary/20" onClick={handleGenerate}>
                                                <RefreshCw className="w-6 h-6" /> Generate Collection
                                            </Button>
                                        )}

                                        <Button variant="ghost" onClick={() => setCurrentStep("rarity")} disabled={isGenerating}>
                                            Back to Rarity
                                        </Button>
                                    </motion.div>
                                )}

                                {/* Ready step is now full-page — rendered outside this panel */}
                            </AnimatePresence>
                        </div>

                        {/* Sidebar / Preview info */}
                        <div className="w-full md:w-[320px] shrink-0 space-y-4">
                            <Card className="glass-card p-6 border-white/5 bg-white/5">
                                <h3 className="font-bold flex items-center gap-2 mb-4">
                                    <ImageIcon className="w-4 h-4 text-primary" /> Preview Collection
                                </h3>
                                <div className="aspect-square rounded-2xl bg-muted/20 border border-white/10 flex items-center justify-center relative overflow-hidden group">
                                    {layers.length > 0 ? (
                                        <div className="w-full h-full relative">
                                            {layers.filter(l => l.visible).map((l, i) => (
                                                l.traits.length > 0 && (
                                                    <img
                                                        key={l.id}
                                                        src={l.traits[0].preview}
                                                        className="absolute inset-0 w-full h-full object-contain"
                                                        style={{ zIndex: i }}
                                                    />
                                                )
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center p-6 space-y-2">
                                            <Layers className="w-8 h-8 mx-auto text-muted-foreground opacity-30" />
                                            <p className="text-[10px] text-muted-foreground font-medium">Upload traits to see preview</p>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4 space-y-2">
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-muted-foreground font-medium">Estimated Combinations</span>
                                        <span className="text-foreground font-bold">
                                            {layers.length > 0 ? layers.filter(l => l.visible).reduce((acc, l) => acc * (l.traits.length || 1), 1) : 0}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-muted-foreground font-medium">Format</span>
                                        <span className="text-primary font-bold">Metaplex Core + Arweave ready</span>
                                    </div>
                                </div>
                            </Card>

                        </div>
                    </div>
                </main>
            )}
        </div>
    );
}
