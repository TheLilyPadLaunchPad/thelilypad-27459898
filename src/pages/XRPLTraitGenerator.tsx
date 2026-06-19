/**
 * XRPLTraitGenerator — Layered generative-art wizard that mints XLS-20
 * NFTs straight to XRP Ledger.
 *
 * Pipeline:
 *   1. Setup (name/symbol/desc/network/taxon/transfer fee/XLS-20 flags)
 *   2. Layers (LayerManager → upload trait images)
 *   3. Rarity & Rules (TraitRarityEditor + TraitRulesManager)
 *   4. Generate (assetGenerator → N composited WebP previews)
 *   5. Review & Mint:
 *        - Pin each composited image to IPFS via Pinata
 *        - Pin per-NFT JSON to IPFS via Pinata
 *        - Pin collection-level JSON for AccountSet Domain
 *        - useXRPLConnectedLaunch().launch() signs through Joey Wallet
 *
 * Pinata is used for testnet AND mainnet — the `pinata-upload` edge
 * function holds the JWT, so no client-side network config is needed.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    CheckCircle2,
    ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { LayerManager, Layer } from "@/components/launchpad/LayerManager";
import { TraitRarityEditor } from "@/components/launchpad/TraitRarityEditor";
import { TraitRulesManager, TraitRule } from "@/components/launchpad/TraitRulesManager";
import { generateAssets, GeneratedAsset } from "@/lib/assetGenerator";
import { useXRPLConnectedLaunch } from "@/hooks/useXRPLConnectedLaunch";
import { useWallet } from "@/providers/WalletProvider";
import { pinFile, pinJson, ipfsUri, ipfsUrl } from "@/integrations/pinata/client";
import { useSEO } from "@/hooks/useSEO";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

type Step = "setup" | "layers" | "rarity" | "generate" | "review" | "minting" | "complete";

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const res = await fetch(dataUrl);
    return await res.blob();
}

export default function XRPLTraitGenerator() {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState<Step>("setup");

    // Collection metadata
    const [name, setName] = useState("");
    const [symbol, setSymbol] = useState("");
    const [description, setDescription] = useState("");
    const [network, setNetwork] = useState<"mainnet" | "testnet">("testnet");
    const [transferFee, setTransferFee] = useState(0);
    const [taxon, setTaxon] = useState(Math.floor(Date.now() / 1000));
    const [targetSupply, setTargetSupply] = useState(50);

    // XLS-20 mint flags
    const [flagTransferable, setFlagTransferable] = useState(true);
    const [flagBurnable, setFlagBurnable] = useState(false);
    const [flagOnlyXRP, setFlagOnlyXRP] = useState(false);
    const [flagTrustLine, setFlagTrustLine] = useState(false);

    // Generation state
    const [layers, setLayers] = useState<Layer[]>([]);
    const [rules, setRules] = useState<TraitRule[]>([]);
    const [generatedAssets, setGeneratedAssets] = useState<GeneratedAsset[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });

    // Minting
    const { address, isConnected, chainType, connectXRPL } = useWallet();
    const { launch, isLaunching, progress } = useXRPLConnectedLaunch();
    const [pinProgress, setPinProgress] = useState({ current: 0, total: 0, label: "" });
    const [mintResult, setMintResult] = useState<any>(null);

    useSEO({
        title: "XRPL Trait Generator | The Lily Pad",
        description:
            "Generative XLS-20 collections on XRP Ledger. Upload layers, set rarity, mint to mainnet or testnet via Pinata IPFS.",
    });

    const computedFlags =
        (flagBurnable ? 1 : 0) |
        (flagOnlyXRP ? 2 : 0) |
        (flagTrustLine ? 4 : 0) |
        (flagTransferable ? 8 : 0);

    const explorerBase =
        network === "mainnet"
            ? "https://livenet.xrpl.org/transactions/"
            : "https://testnet.xrpl.org/transactions/";

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
                    totalSupply: targetSupply,
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

    const handleMint = async () => {
        if (!isConnected || chainType !== "xrpl" || !address) {
            toast.error("Connect your XRPL wallet first");
            try { await connectXRPL(); } catch { /* noop */ }
            return;
        }
        if (transferFee > 0 && !flagTransferable) {
            return toast.error("Transfer Fee requires the Transferable flag");
        }
        if (generatedAssets.length === 0) return toast.error("Generate assets first");

        try {
            setCurrentStep("minting");
            const total = generatedAssets.length;
            setPinProgress({ current: 0, total, label: "Pinning to IPFS…" });

            const pinnedItems: { name: string; uri: string }[] = [];
            let firstImageCid: string | null = null;

            for (let i = 0; i < generatedAssets.length; i++) {
                const asset = generatedAssets[i];
                setPinProgress({
                    current: i,
                    total,
                    label: `Pinning image ${i + 1}/${total} to Pinata IPFS…`,
                });

                if (!asset.preview) throw new Error(`Asset ${asset.name} has no preview`);
                const imgBlob = await dataUrlToBlob(asset.preview);
                const img = await pinFile(imgBlob, `${i}.webp`);
                if (!firstImageCid) firstImageCid = img.cid;

                setPinProgress({
                    current: i,
                    total,
                    label: `Pinning metadata ${i + 1}/${total} to Pinata IPFS…`,
                });
                const meta = await pinJson(
                    {
                        name: asset.metadata.name,
                        description: asset.metadata.description,
                        image: ipfsUri(img.cid),
                        attributes: asset.metadata.attributes,
                        collection: { name, family: symbol || name },
                    },
                    `${i}.json`
                );

                pinnedItems.push({ name: asset.metadata.name, uri: ipfsUri(meta.cid) });
            }

            setPinProgress({ current: total, total, label: "Pinning collection metadata…" });
            const collectionMeta = await pinJson(
                {
                    name,
                    description,
                    symbol: symbol || undefined,
                    image: firstImageCid ? ipfsUri(firstImageCid) : undefined,
                },
                `${name || "collection"}.json`
            );

            const result = await launch({
                network,
                collection: {
                    name,
                    description,
                    uri: ipfsUri(collectionMeta.cid),
                    taxon,
                    transferFeePct: transferFee,
                    flags: computedFlags,
                },
                items: pinnedItems,
            });

            setMintResult(result);
            setCurrentStep("complete");
        } catch (err: any) {
            console.error("XRPL trait mint failed:", err);
            toast.error(err?.message || "Mint failed");
            setCurrentStep("review");
        }
    };

    const stepDefs: { id: Step; label: string; icon: any }[] = [
        { id: "setup", label: "Setup", icon: Settings },
        { id: "layers", label: "Layers", icon: Layers },
        { id: "rarity", label: "Rarity", icon: Wand2 },
        { id: "generate", label: "Generate", icon: Sparkles },
        { id: "review", label: "Review", icon: Rocket },
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
                        <span>XRPL Trait Generator</span>
                        <Badge variant="outline" className="ml-2 text-[10px]">
                            Pinata IPFS · {network}
                        </Badge>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight gradient-text">
                        Generative XLS-20 Collections
                    </h1>
                    <p className="text-muted-foreground max-w-xl mx-auto">
                        Upload trait layers, set rarity weights, and mint a full generative
                        collection straight to XRP Ledger. All assets and metadata are pinned
                        to IPFS via Pinata on both mainnet and testnet.
                    </p>
                </div>

                {currentStep !== "complete" && currentStep !== "minting" && (
                    <div className="w-full max-w-3xl mb-10 flex justify-between relative px-2">
                        <div className="absolute top-5 left-0 w-full h-0.5 bg-muted z-0" />
                        {stepDefs.map((s) => {
                            const active =
                                currentStep === s.id ||
                                (currentStep === "minting" && s.id === "review");
                            return (
                                <div
                                    key={s.id}
                                    className="relative z-10 flex flex-col items-center gap-2"
                                >
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
                                            "text-[10px] font-bold uppercase tracking-wider",
                                            active ? "text-primary" : "text-muted-foreground"
                                        )}
                                    >
                                        {s.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

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
                                <Card className="glass-card p-8 border-primary/10">
                                    <CardHeader className="px-0 pt-0">
                                        <CardTitle className="text-xl">Collection Details</CardTitle>
                                        <CardDescription>
                                            XLS-20 collection grouped by taxon. Pinned via Pinata IPFS.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="px-0 space-y-6">
                                        <div className="space-y-2">
                                            <Label>Collection Name</Label>
                                            <Input
                                                placeholder="My XRPL Collection"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="h-12 text-lg font-bold"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Symbol</Label>
                                                <Input
                                                    placeholder="XRPL"
                                                    value={symbol}
                                                    onChange={(e) =>
                                                        setSymbol(e.target.value.toUpperCase())
                                                    }
                                                    maxLength={10}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Target Supply</Label>
                                                <Input
                                                    type="number"
                                                    value={targetSupply}
                                                    onChange={(e) =>
                                                        setTargetSupply(
                                                            Math.max(1, Math.min(500, Number(e.target.value) | 0))
                                                        )
                                                    }
                                                    min={1}
                                                    max={500}
                                                />
                                                <p className="text-[10px] text-muted-foreground">
                                                    Capped at 500 per mint session.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Description</Label>
                                            <Input
                                                placeholder="A generative XRPL collection…"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Network</Label>
                                                <Select
                                                    value={network}
                                                    onValueChange={(v: any) => setNetwork(v)}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="testnet">Testnet</SelectItem>
                                                        <SelectItem value="mainnet">Mainnet</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Transfer Fee (%)</Label>
                                                <Input
                                                    type="number"
                                                    value={transferFee}
                                                    onChange={(e) =>
                                                        setTransferFee(
                                                            Math.min(50, Math.max(0, Number(e.target.value)))
                                                        )
                                                    }
                                                    min={0}
                                                    max={50}
                                                    step={0.1}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Token Flags (XLS-20)</Label>
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                <label className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={flagTransferable}
                                                        onChange={(e) =>
                                                            setFlagTransferable(e.target.checked)
                                                        }
                                                    />
                                                    <span>Transferable</span>
                                                </label>
                                                <label className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={flagBurnable}
                                                        onChange={(e) => setFlagBurnable(e.target.checked)}
                                                    />
                                                    <span>Burnable</span>
                                                </label>
                                                <label className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={flagOnlyXRP}
                                                        onChange={(e) => setFlagOnlyXRP(e.target.checked)}
                                                    />
                                                    <span>OnlyXRP</span>
                                                </label>
                                                <label className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={flagTrustLine}
                                                        onChange={(e) => setFlagTrustLine(e.target.checked)}
                                                    />
                                                    <span>TrustLine</span>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>NFTokenTaxon</Label>
                                                <Input
                                                    type="number"
                                                    value={taxon}
                                                    onChange={(e) =>
                                                        setTaxon(Math.max(0, Number(e.target.value) | 0))
                                                    }
                                                    min={0}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Issuer Address</Label>
                                                <Input
                                                    value={address || ""}
                                                    readOnly
                                                    placeholder={isConnected ? "" : "Connect XRPL wallet"}
                                                    className="font-mono text-xs"
                                                />
                                            </div>
                                        </div>

                                        <Button
                                            className="w-full h-12 text-lg gap-2 mt-4"
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
                                    <Button
                                        variant="ghost"
                                        onClick={() => setCurrentStep("setup")}
                                        className="gap-2"
                                    >
                                        <ArrowLeft className="w-4 h-4" /> Back
                                    </Button>
                                    <Button
                                        onClick={() => setCurrentStep("rarity")}
                                        disabled={
                                            layers.length === 0 ||
                                            !layers.some((l) => l.traits.length > 0)
                                        }
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
                                    <Button
                                        variant="ghost"
                                        onClick={() => setCurrentStep("layers")}
                                        className="gap-2"
                                    >
                                        <ArrowLeft className="w-4 h-4" /> Back
                                    </Button>
                                    <Button
                                        onClick={() => setCurrentStep("generate")}
                                        className="gap-2"
                                    >
                                        Next: Generate <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                                <TraitRarityEditor layers={layers} onLayersChange={setLayers} />
                                <TraitRulesManager
                                    layers={layers}
                                    rules={rules}
                                    onRulesChange={setRules}
                                />
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
                                            Composites trait layers in browser. Nothing is uploaded yet.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="px-0 space-y-6">
                                        {isGenerating ? (
                                            <div className="space-y-4 py-8 text-center">
                                                <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
                                                <p className="text-sm text-muted-foreground">
                                                    Generating {generationProgress.current} /{" "}
                                                    {generationProgress.total}…
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
                                            <Button
                                                className="w-full h-12 text-lg gap-2"
                                                onClick={handleGenerate}
                                            >
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
                                    <Button
                                        variant="ghost"
                                        onClick={() => setCurrentStep("generate")}
                                        className="gap-2"
                                    >
                                        <ArrowLeft className="w-4 h-4" /> Back
                                    </Button>
                                    {isConnected && chainType === "xrpl" ? (
                                        <Button
                                            onClick={handleMint}
                                            className="gap-2 bg-gradient-to-r from-primary to-accent"
                                        >
                                            Pin to IPFS & Mint{" "}
                                            <Rocket className="w-4 h-4" />
                                        </Button>
                                    ) : (
                                        <Button onClick={() => connectXRPL()} className="gap-2">
                                            Connect XRPL Wallet
                                        </Button>
                                    )}
                                </div>

                                <Card className="glass-card p-6 border-primary/10">
                                    <CardHeader className="px-0 pt-0">
                                        <CardTitle className="text-lg">
                                            {generatedAssets.length} NFTs ready · {network}
                                        </CardTitle>
                                        <CardDescription>
                                            Storage backend: <strong>Pinata IPFS</strong> (both
                                            testnet + mainnet)
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="px-0">
                                        <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                                            {generatedAssets.slice(0, 24).map((a) => (
                                                <div key={a.id} className="space-y-1">
                                                    <img
                                                        src={a.preview}
                                                        alt={a.name}
                                                        className="w-full aspect-square rounded-lg border border-border object-cover"
                                                    />
                                                    <p className="text-[10px] text-muted-foreground truncate">
                                                        {a.name}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                        {generatedAssets.length > 24 && (
                                            <p className="text-xs text-muted-foreground mt-3">
                                                Showing first 24 of {generatedAssets.length}
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}

                        {currentStep === "minting" && (
                            <motion.div
                                key="minting"
                                initial="enter"
                                animate="center"
                                exit="exit"
                                variants={variants}
                            >
                                <Card className="glass-card p-8 border-primary/10 text-center space-y-6">
                                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                                    <div className="space-y-2">
                                        <h3 className="text-xl font-bold">
                                            {isLaunching
                                                ? `Minting on XRPL ${network}…`
                                                : pinProgress.label || "Preparing…"}
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            {isLaunching
                                                ? `Tx ${progress.current} / ${progress.total}`
                                                : `${pinProgress.current} / ${pinProgress.total} pinned`}
                                        </p>
                                    </div>
                                    <Progress
                                        value={
                                            isLaunching
                                                ? (progress.current /
                                                    Math.max(1, progress.total)) *
                                                100
                                                : (pinProgress.current /
                                                    Math.max(1, pinProgress.total)) *
                                                100
                                        }
                                    />
                                </Card>
                            </motion.div>
                        )}

                        {currentStep === "complete" && mintResult && (
                            <motion.div
                                key="complete"
                                initial="enter"
                                animate="center"
                                exit="exit"
                                variants={variants}
                            >
                                <Card className="glass-card p-8 border-primary/10 text-center space-y-6">
                                    <CheckCircle2 className="w-16 h-16 mx-auto text-primary" />
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-bold gradient-text">
                                            Launched on XRPL!
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            {mintResult.nfts?.length || 0} NFTs minted on {network}
                                        </p>
                                    </div>
                                    <div className="space-y-2 text-left max-h-64 overflow-y-auto">
                                        <a
                                            href={`${explorerBase}${mintResult.domainTxHash}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center justify-between text-xs p-2 rounded border border-border hover:border-primary/40"
                                        >
                                            <span>AccountSet (Domain)</span>
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                        {mintResult.nfts?.slice(0, 50).map((n: any, i: number) => (
                                            <a
                                                key={i}
                                                href={`${explorerBase}${n.txHash}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center justify-between text-xs p-2 rounded border border-border hover:border-primary/40"
                                            >
                                                <span className="truncate">{n.name}</span>
                                                <ExternalLink className="w-3 h-3 shrink-0" />
                                            </a>
                                        ))}
                                    </div>
                                    <div className="flex gap-3 justify-center">
                                        <Button
                                            variant="outline"
                                            onClick={() => navigate("/launchpad")}
                                        >
                                            Back to Launchpad
                                        </Button>
                                        <Button onClick={() => navigate("/my-nfts")}>
                                            View My NFTs
                                        </Button>
                                    </div>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
