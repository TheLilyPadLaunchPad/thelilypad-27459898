/**
 * RobinhoodTraitGenerator — Layered generative-art wizard for Robinhood Chain.
 *
 * Robinhood Chain is not connectable yet, so this stops before deployment:
 *   1. Setup (name/symbol/description/supply/royalty/external link)
 *   2. Layers (LayerManager → upload trait images)
 *   3. Rarity & Rules (TraitRarityEditor + TraitRulesManager)
 *   4. Generate (assetGenerator → composited previews)
 *   5. Review & Export — save a local draft or download a ZIP containing
 *      images/, metadata/ (ERC-721 shaped JSON) and collection.json.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    Sparkles,
    Layers,
    ArrowLeft,
    Palette,
    Rocket,
    Wand2,
    Settings,
    ChevronRight,
    Loader2,
    Download,
    Save,
    Lock,
    Crown,
    Plus,
    Pencil,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { LayerManager, Layer } from "@/components/launchpad/LayerManager";
import { TraitRarityEditor } from "@/components/launchpad/TraitRarityEditor";
import { TraitRulesManager, TraitRule } from "@/components/launchpad/TraitRulesManager";
import { generateAssets, GeneratedAsset } from "@/lib/assetGenerator";
import { AssetMetadataEditor } from "@/components/launchpad/AssetMetadataEditor";
import { useSEO } from "@/hooks/useSEO";
import { cn } from "@/lib/utils";

type Step = "setup" | "layers" | "rarity" | "generate" | "review";

const MAX_SUPPLY = 10000;
const DRAFT_KEY = "lilypad_draft_robinhood_trait";

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const res = await fetch(dataUrl);
    return await res.blob();
}

export default function RobinhoodTraitGenerator() {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState<Step>("setup");

    // Collection metadata
    const [name, setName] = useState("");
    const [symbol, setSymbol] = useState("");
    const [description, setDescription] = useState("");
    const [externalUrl, setExternalUrl] = useState("");
    const [royalty, setRoyalty] = useState(5);
    const [targetSupply, setTargetSupply] = useState(50);

    // Generation state
    const [layers, setLayers] = useState<Layer[]>([]);
    const [rules, setRules] = useState<TraitRule[]>([]);
    const [generatedAssets, setGeneratedAssets] = useState<GeneratedAsset[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });

    // Editing / 1-of-1 pieces
    const [editingAsset, setEditingAsset] = useState<GeneratedAsset | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);

    const openEditor = (asset: GeneratedAsset) => {
        setEditingAsset(asset);
        setEditorOpen(true);
    };

    const addOneOfOne = () => {
        const piece: GeneratedAsset = {
            id: `one-of-one-${Date.now()}`,
            name: `${name || "Collection"} #${generatedAssets.length + 1}`,
            traits: [],
            isOneOfOne: true,
            metadata: {
                name: `${name || "Collection"} #${generatedAssets.length + 1}`,
                description,
                attributes: [{ trait_type: "Type", value: "1 of 1" }],
            },
        };
        setGeneratedAssets((prev) => [...prev, piece]);
        openEditor(piece);
    };

    const saveAsset = (updated: GeneratedAsset) => {
        setGeneratedAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setEditingAsset(updated);
    };

    const deleteAsset = (assetId: string) => {
        setGeneratedAssets((prev) => prev.filter((a) => a.id !== assetId));
        setEditingAsset(null);
    };

    useSEO({
        title: "Robinhood Chain NFT Generator | The Lily Pad",
        description:
            "Build generative NFT collections for Robinhood Chain. Upload trait layers, set rarity and rules, then export artwork and ERC-721 metadata.",
    });

    const handleGenerate = async () => {
        if (!name) return toast.error("Add a collection name first");
        if (layers.length === 0 || !layers.some((l) => l.visible && l.traits.length > 0)) {
            return toast.error("Add at least one visible layer with traits");
        }

        setIsGenerating(true);
        try {
            const assets = await generateAssets(
                layers,
                {
                    collectionName: name,
                    collectionSymbol: symbol,
                    description,
                    totalSupply: Math.min(MAX_SUPPLY, targetSupply),
                    allowDuplicates: false,
                    rules,
                },
                (current, total) => setGenerationProgress({ current, total })
            );
            if (assets.length === 0) {
                throw new Error("No unique combinations generated. Add more traits or layers.");
            }
            setGeneratedAssets(assets);
            setCurrentStep("review");
            toast.success(`Generated ${assets.length} unique NFTs`);
        } catch (err: any) {
            toast.error(err?.message || "Generation failed");
        } finally {
            setIsGenerating(false);
        }
    };

    const saveDraft = () => {
        try {
            localStorage.setItem(
                DRAFT_KEY,
                JSON.stringify({
                    type: "trait",
                    chain: "robinhood",
                    savedAt: new Date().toISOString(),
                    data: {
                        name,
                        symbol,
                        description,
                        externalUrl,
                        royalty,
                        targetSupply,
                        layerCount: layers.length,
                        traitCount: layers.reduce((sum, l) => sum + l.traits.length, 0),
                        ruleCount: rules.length,
                        generatedCount: generatedAssets.length,
                    },
                })
            );
            toast.success("Draft saved. You can pick this collection up later.");
        } catch {
            toast.error("Could not save the draft in this browser.");
        }
    };

    const handleExport = async () => {
        if (generatedAssets.length === 0) return toast.error("Generate assets first");

        setIsExporting(true);
        const total = generatedAssets.length;
        setExportProgress({ current: 0, total });

        try {
            const zip = new JSZip();
            const images = zip.folder("images")!;
            const metadata = zip.folder("metadata")!;

            for (let i = 0; i < generatedAssets.length; i++) {
                const asset = generatedAssets[i];
                setExportProgress({ current: i + 1, total });

                if (!asset.preview)
                    throw new Error(
                        `"${asset.name}" has no artwork yet. Open it and upload an image, or remove it.`
                    );
                const blob = await dataUrlToBlob(asset.preview);
                images.file(`${i}.webp`, blob);

                metadata.file(
                    `${i}.json`,
                    JSON.stringify(
                        {
                            name: asset.metadata.name,
                            description: asset.metadata.description || description,
                            image: `images/${i}.webp`,
                            external_url: externalUrl || undefined,
                            attributes: asset.metadata.attributes,
                        },
                        null,
                        2
                    )
                );
            }

            zip.file(
                "collection.json",
                JSON.stringify(
                    {
                        name,
                        symbol,
                        description,
                        external_url: externalUrl || undefined,
                        seller_fee_basis_points: Math.round(royalty * 100),
                        chain: "robinhood",
                        standard: "ERC-721",
                        total_supply: generatedAssets.length,
                        generated_at: new Date().toISOString(),
                    },
                    null,
                    2
                )
            );

            const out = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(out);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(name || "collection").replace(/\s+/g, "-").toLowerCase()}-robinhood.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            toast.success("Collection downloaded");
        } catch (err: any) {
            toast.error(err?.message || "Export failed");
        } finally {
            setIsExporting(false);
        }
    };

    const stepDefs: { id: Step; label: string; icon: any }[] = [
        { id: "setup", label: "Setup", icon: Settings },
        { id: "layers", label: "Layers", icon: Layers },
        { id: "rarity", label: "Rarity", icon: Wand2 },
        { id: "generate", label: "Generate", icon: Sparkles },
        { id: "review", label: "Export", icon: Rocket },
    ];

    const variants = {
        enter: { x: 20, opacity: 0 },
        center: { x: 0, opacity: 1 },
        exit: { x: -20, opacity: 0 },
    };

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            <Navbar />

            <main className="flex-1 pt-24 pb-12 px-4 container max-w-5xl mx-auto flex flex-col items-center">
                <div className="text-center space-y-3 mb-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
                        <Palette className="w-3 h-3" />
                        <span>Robinhood Chain Generator</span>
                        <Badge variant="outline" className="ml-2 text-[10px]">
                            Deploy coming soon
                        </Badge>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight gradient-text">
                        Generative Collections for Robinhood Chain
                    </h1>
                    <p className="text-muted-foreground max-w-xl mx-auto">
                        Upload trait layers, set rarity weights and rules, then generate your full
                        collection. Save it as a draft or download the artwork and metadata — minting
                        opens as soon as Robinhood Chain goes live here.
                    </p>
                </div>

                <div className="w-full max-w-3xl mb-10 flex justify-between relative px-2">
                    <div className="absolute top-5 left-0 w-full h-0.5 bg-muted z-0" />
                    {stepDefs.map((s) => {
                        const active = currentStep === s.id;
                        return (
                            <div key={s.id} className="relative z-10 flex flex-col items-center gap-2">
                                <div
                                    className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all duration-300",
                                        active
                                            ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110"
                                            : "bg-card border-border text-muted-foreground"
                                    )}
                                >
                                    <s.icon className="w-5 h-5" />
                                </div>
                                <span
                                    className={cn(
                                        "text-xs font-medium",
                                        active ? "text-foreground" : "text-muted-foreground"
                                    )}
                                >
                                    {s.label}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="w-full">
                    <AnimatePresence mode="wait">
                        {currentStep === "setup" && (
                            <motion.div
                                key="setup"
                                initial="enter"
                                animate="center"
                                exit="exit"
                                variants={variants}
                            >
                                <Card className="glass-card p-6 border-primary/10">
                                    <CardHeader className="px-0 pt-0">
                                        <CardTitle className="text-xl">Collection Details</CardTitle>
                                        <CardDescription>
                                            Robinhood Chain is EVM-based, so metadata follows the ERC-721 standard.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="px-0 space-y-5">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="rh-name">Collection Name</Label>
                                                <Input
                                                    id="rh-name"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    placeholder="Lily Frogs"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="rh-symbol">Symbol</Label>
                                                <Input
                                                    id="rh-symbol"
                                                    value={symbol}
                                                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                                    placeholder="LILY"
                                                    maxLength={10}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="rh-desc">Description</Label>
                                            <Textarea
                                                id="rh-desc"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder="What is this collection about?"
                                                rows={3}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="rh-supply">Supply (max {MAX_SUPPLY.toLocaleString()})</Label>
                                                <Input
                                                    id="rh-supply"
                                                    type="number"
                                                    value={targetSupply}
                                                    onChange={(e) =>
                                                        setTargetSupply(
                                                            Math.min(MAX_SUPPLY, Math.max(1, Number(e.target.value) | 0))
                                                        )
                                                    }
                                                    min={1}
                                                    max={MAX_SUPPLY}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="rh-royalty">Royalty (%)</Label>
                                                <Input
                                                    id="rh-royalty"
                                                    type="number"
                                                    value={royalty}
                                                    onChange={(e) =>
                                                        setRoyalty(Math.min(20, Math.max(0, Number(e.target.value))))
                                                    }
                                                    min={0}
                                                    max={20}
                                                    step={0.5}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="rh-url">External Link (optional)</Label>
                                            <Input
                                                id="rh-url"
                                                value={externalUrl}
                                                onChange={(e) => setExternalUrl(e.target.value)}
                                                placeholder="https://your-site.xyz"
                                            />
                                        </div>

                                        <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
                                            <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                                            <span>
                                                Deploying to Robinhood Chain is coming soon. For now you can generate,
                                                save a draft and download your collection.
                                            </span>
                                        </div>

                                        <Button
                                            className="w-full h-12 text-lg gap-2 mt-2"
                                            onClick={() => setCurrentStep("layers")}
                                            disabled={!name}
                                        >
                                            Next: Add Layers <ChevronRight className="w-5 h-5" />
                                        </Button>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}

                        {currentStep === "layers" && (
                            <motion.div
                                key="layers"
                                initial="enter"
                                animate="center"
                                exit="exit"
                                variants={variants}
                                className="space-y-6"
                            >
                                <div className="flex items-center justify-between">
                                    <Button variant="ghost" onClick={() => setCurrentStep("setup")} className="gap-2">
                                        <ArrowLeft className="w-4 h-4" /> Back
                                    </Button>
                                    <Button
                                        onClick={() => setCurrentStep("rarity")}
                                        disabled={layers.length === 0 || !layers.some((l) => l.traits.length > 0)}
                                        className="gap-2"
                                    >
                                        Next: Rarity & Rules <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                                <LayerManager layers={layers} onLayersChange={setLayers} />
                            </motion.div>
                        )}

                        {currentStep === "rarity" && (
                            <motion.div
                                key="rarity"
                                initial="enter"
                                animate="center"
                                exit="exit"
                                variants={variants}
                                className="space-y-6"
                            >
                                <div className="flex items-center justify-between">
                                    <Button variant="ghost" onClick={() => setCurrentStep("layers")} className="gap-2">
                                        <ArrowLeft className="w-4 h-4" /> Back
                                    </Button>
                                    <Button onClick={() => setCurrentStep("generate")} className="gap-2">
                                        Next: Generate <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                                <TraitRarityEditor layers={layers} onLayersChange={setLayers} />
                                <TraitRulesManager layers={layers} rules={rules} onRulesChange={setRules} />
                            </motion.div>
                        )}

                        {currentStep === "generate" && (
                            <motion.div
                                key="generate"
                                initial="enter"
                                animate="center"
                                exit="exit"
                                variants={variants}
                                className="space-y-6"
                            >
                                <div className="flex items-center justify-between">
                                    <Button
                                        variant="ghost"
                                        onClick={() => setCurrentStep("rarity")}
                                        className="gap-2"
                                        disabled={isGenerating}
                                    >
                                        <ArrowLeft className="w-4 h-4" /> Back
                                    </Button>
                                </div>
                                <Card className="glass-card p-8 border-primary/10">
                                    <CardHeader className="px-0 pt-0">
                                        <CardTitle className="text-xl">
                                            Generate {targetSupply} Unique NFTs
                                        </CardTitle>
                                        <CardDescription>
                                            Composites trait layers in your browser. Nothing is uploaded.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="px-0 space-y-6">
                                        {isGenerating ? (
                                            <div className="space-y-4 py-8 text-center">
                                                <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
                                                <p className="text-sm text-muted-foreground">
                                                    Generating {generationProgress.current} / {generationProgress.total}…
                                                </p>
                                                <Progress
                                                    value={
                                                        (generationProgress.current /
                                                            Math.max(1, generationProgress.total)) *
                                                        100
                                                    }
                                                />
                                            </div>
                                        ) : (
                                            <Button className="w-full h-12 text-lg gap-2" onClick={handleGenerate}>
                                                <Sparkles className="w-5 h-5" /> Generate {targetSupply} NFTs
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}

                        {currentStep === "review" && (
                            <motion.div
                                key="review"
                                initial="enter"
                                animate="center"
                                exit="exit"
                                variants={variants}
                                className="space-y-6"
                            >
                                <div className="flex items-center justify-between">
                                    <Button variant="ghost" onClick={() => setCurrentStep("generate")} className="gap-2">
                                        <ArrowLeft className="w-4 h-4" /> Back
                                    </Button>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" onClick={saveDraft} className="gap-2">
                                            <Save className="w-4 h-4" /> Save draft
                                        </Button>
                                        <Button
                                            onClick={handleExport}
                                            disabled={isExporting}
                                            className="gap-2 bg-gradient-to-r from-primary to-accent"
                                        >
                                            {isExporting ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Download className="w-4 h-4" />
                                            )}
                                            Download collection
                                        </Button>
                                    </div>
                                </div>

                                <Card className="glass-card p-6 border-primary/10">
                                    <CardHeader className="px-0 pt-0">
                                        <CardTitle className="text-lg">
                                            {generatedAssets.length} NFTs ready
                                        </CardTitle>
                                        <CardDescription>
                                            The download contains <strong>images/</strong>,{" "}
                                            <strong>metadata/</strong> (ERC-721 JSON) and{" "}
                                            <strong>collection.json</strong>.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="px-0 space-y-4">
                                        {isExporting && (
                                            <div className="space-y-2">
                                                <p className="text-sm text-muted-foreground">
                                                    Packaging {exportProgress.current} / {exportProgress.total}…
                                                </p>
                                                <Progress
                                                    value={
                                                        (exportProgress.current /
                                                            Math.max(1, exportProgress.total)) *
                                                        100
                                                    }
                                                />
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-muted-foreground">
                                                Click any piece to edit its name, description and traits —
                                                or swap in your own artwork to make it a 1-of-1.
                                            </p>
                                            <Button size="sm" variant="outline" className="gap-2" onClick={addOneOfOne}>
                                                <Plus className="w-4 h-4" /> Add 1-of-1
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3 max-h-[480px] overflow-y-auto pr-1">
                                            {generatedAssets.map((asset) => (
                                                <button
                                                    type="button"
                                                    key={asset.id}
                                                    onClick={() => openEditor(asset)}
                                                    title={`Edit ${asset.metadata.name}`}
                                                    className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/30 hover:border-primary transition-colors"
                                                >
                                                    {asset.preview ? (
                                                        <img
                                                            src={asset.preview}
                                                            alt={asset.metadata.name}
                                                            loading="lazy"
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground px-1 text-center">
                                                            Add artwork
                                                        </span>
                                                    )}
                                                    {asset.isOneOfOne && (
                                                        <Badge className="absolute top-1 left-1 gap-1 text-[9px] px-1.5 py-0">
                                                            <Crown className="w-2.5 h-2.5" /> 1/1
                                                        </Badge>
                                                    )}
                                                    <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-background/60">
                                                        <Pencil className="w-4 h-4 text-foreground" />
                                                    </span>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
                                            <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                                            <span>
                                                Deploying to Robinhood Chain is coming soon. Your saved draft and
                                                download will work with it when minting opens.
                                            </span>
                                        </div>

                                        <Button
                                            variant="ghost"
                                            className="w-full"
                                            onClick={() => navigate("/launchpad")}
                                        >
                                            Back to Launchpad
                                        </Button>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
