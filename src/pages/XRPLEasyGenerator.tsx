/**
 * XRPLEasyGenerator - 3-step XRPL NFT creation wizard
 */

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
    Rocket,
    ImageIcon,
    Wand2,
    Settings,
    ChevronRight,
    Loader2,
    Upload,
    X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useXRPLConnectedLaunch } from "@/hooks/useXRPLConnectedLaunch";
import { useWallet } from "@/providers/WalletProvider";
import { pinFile, pinJson, ipfsUri } from "@/integrations/pinata/client";
import { cn } from "@/lib/utils";
import { useSEO } from "@/hooks/useSEO";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Step = "setup" | "upload" | "review" | "minting" | "complete";

interface NFTItem {
    name: string;
    uri: string;
    file?: File;
    preview?: string;
}

export default function XRPLEasyGenerator() {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState<Step>("setup");

    // Collection Metadata
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [symbol, setSymbol] = useState("");
    const [network] = useState<"mainnet" | "testnet">("mainnet");
    const [transferFee, setTransferFee] = useState(0);
    const [taxon, setTaxon] = useState(Math.floor(Date.now() / 1000));

    // XLS-20 mint flags
    const [flagTransferable, setFlagTransferable] = useState(true);
    const [flagBurnable, setFlagBurnable] = useState(false);
    const [flagOnlyXRP, setFlagOnlyXRP] = useState(false);
    const [flagTrustLine, setFlagTrustLine] = useState(false);

    // NFT Items
    const [nftItems, setNftItems] = useState<NFTItem[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    // Minting — uses connected Joey Wallet (no raw seeds)
    const { address, isConnected, chainType, connectXRPL } = useWallet();
    const { launch, isLaunching, progress } = useXRPLConnectedLaunch();
    const [mintResult, setMintResult] = useState<any>(null);

    useSEO({
        title: "XRPL NFT Generator | The Lily Pad",
        description: "Create and launch NFT collections on XRP Ledger with our easy-to-use generator."
    });

    const MAX_NFTS = 10000;
    const MIN_DIM = 400;
    const MAX_DIM = 512;

    const getImageDimensions = (file: File): Promise<{ width: number; height: number; url: string }> =>
        new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, url });
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Could not read image"));
            };
            img.src = url;
        });

    const handleFileUpload = async (files: FileList | null) => {
        if (!files) return;

        setIsUploading(true);
        const remaining = MAX_NFTS - nftItems.length;
        if (remaining <= 0) {
            toast.error(`Collection cap reached (max ${MAX_NFTS.toLocaleString()} NFTs)`);
            setIsUploading(false);
            return;
        }

        const newItems: NFTItem[] = [];
        let rejectedSize = 0;
        let rejectedRatio = 0;
        let truncated = false;

        for (let i = 0; i < files.length; i++) {
            if (newItems.length >= remaining) {
                truncated = true;
                break;
            }
            const file = files[i];
            try {
                const { width, height, url } = await getImageDimensions(file);
                if (width !== height) {
                    rejectedRatio++;
                    URL.revokeObjectURL(url);
                    continue;
                }
                if (width < MIN_DIM || width > MAX_DIM) {
                    rejectedSize++;
                    URL.revokeObjectURL(url);
                    continue;
                }
                newItems.push({
                    name: file.name.replace(/\.[^/.]+$/, ""),
                    uri: "",
                    file,
                    preview: url,
                });
            } catch {
                rejectedSize++;
            }
        }

        setNftItems(prev => [...prev, ...newItems]);
        setIsUploading(false);

        if (newItems.length > 0) toast.success(`Added ${newItems.length} NFTs`);
        if (rejectedRatio > 0) toast.error(`${rejectedRatio} image(s) skipped — must be square (1:1)`);
        if (rejectedSize > 0) toast.error(`${rejectedSize} image(s) skipped — must be ${MIN_DIM}x${MIN_DIM} to ${MAX_DIM}x${MAX_DIM}`);
        if (truncated) toast.error(`Stopped at ${MAX_NFTS.toLocaleString()} NFT cap`);
    };

    const removeItem = (index: number) => {
        setNftItems(prev => prev.filter((_, i) => i !== index));
    };

    const computedFlags =
        (flagBurnable ? 1 : 0) |
        (flagOnlyXRP ? 2 : 0) |
        (flagTrustLine ? 4 : 0) |
        (flagTransferable ? 8 : 0);

    const handleMint = async () => {
        if (!name || nftItems.length === 0) {
            return toast.error("Please fill in collection name and add NFTs");
        }
        if (!isConnected || chainType !== 'xrpl' || !address) {
            toast.error("Connect your XRPL wallet first");
            try { await connectXRPL(); } catch { return; }
            return;
        }
        if (transferFee > 0 && !flagTransferable) {
            return toast.error("Transfer Fee requires the Transferable flag to be enabled");
        }

        try {
            setCurrentStep("minting");

            // 1. Pin each image + per-NFT metadata JSON to IPFS via Pinata.
            //    Used for both mainnet and testnet on XRPL.
            const pinnedItems: { name: string; uri: string }[] = [];
            let firstImageCid: string | null = null;

            for (let i = 0; i < nftItems.length; i++) {
                const item = nftItems[i];
                if (!item.file) {
                    throw new Error(`Item "${item.name}" is missing its image file`);
                }

                toast.loading(
                    `Pinning image ${i + 1}/${nftItems.length} to IPFS…`,
                    { id: "xrpl-pin" }
                );
                const img = await pinFile(item.file, item.file.name);
                if (!firstImageCid) firstImageCid = img.cid;

                toast.loading(
                    `Pinning metadata ${i + 1}/${nftItems.length} to IPFS…`,
                    { id: "xrpl-pin" }
                );
                const meta = await pinJson(
                    {
                        name: item.name,
                        description,
                        image: ipfsUri(img.cid),
                        attributes: [],
                        collection: { name, family: symbol || name },
                    },
                    `${item.name}.json`
                );

                pinnedItems.push({ name: item.name, uri: ipfsUri(meta.cid) });
            }

            // 2. Pin collection-level metadata; use its ipfs:// URI as the
            //    collection root URI written into AccountSet Domain.
            toast.loading("Pinning collection metadata to IPFS…", { id: "xrpl-pin" });
            const collectionMeta = await pinJson(
                {
                    name,
                    description,
                    symbol: symbol || undefined,
                    image: firstImageCid ? ipfsUri(firstImageCid) : undefined,
                },
                `${name}.json`
            );
            toast.success("All assets pinned to IPFS", { id: "xrpl-pin" });

            // 3. Sign & submit AccountSet + NFTokenMint txs via connected Joey Wallet.
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
        } catch (error: any) {
            console.error("XRPL mint failed:", error);
            toast.error(error?.message || "Failed to mint collection", { id: "xrpl-pin" });
            setCurrentStep("review");
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

            <main className="flex-1 pt-24 pb-12 px-4 container max-w-5xl mx-auto flex flex-col items-center">
                {/* Header */}
                <div className="text-center space-y-3 mb-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary mb-2">
                        <Palette className="w-3 h-3" />
                        <span>XRPL NFT Generator</span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight gradient-text">
                        Create on XRP Ledger
                    </h1>
                    <p className="text-muted-foreground max-w-xl mx-auto">
                        Launch your NFT collection on XRPL with XLS-20 standard. 
                        Simple, fast, and decentralized.
                    </p>
                </div>

                {/* Progress Tracker */}
                {currentStep !== "complete" && (
                    <div className="w-full max-w-3xl mb-12 flex justify-between relative px-2">
                        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-muted -translate-y-1/2 z-0" />
                        {[
                            { id: "setup", label: "Setup", icon: Settings },
                            { id: "upload", label: "Upload", icon: Upload },
                            { id: "review", label: "Review", icon: Sparkles },
                        ].map((s, i) => (
                            <div key={s.id} className="relative z-10 flex flex-col items-center gap-2">
                                <div
                                    className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all duration-300",
                                        currentStep === s.id || (currentStep === "minting" && s.id === "review")
                                            ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110"
                                            : "bg-card border-border text-muted-foreground"
                                    )}
                                >
                                    <s.icon className="w-5 h-5" />
                                </div>
                                <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-wider",
                                    (currentStep === s.id || (currentStep === "minting" && s.id === "review")) ? "text-primary" : "text-muted-foreground"
                                )}>
                                    {s.label}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="w-full flex flex-col md:flex-row gap-8 items-start">
                    {/* Workspace Area */}
                    <div className="flex-1 w-full min-h-[500px]">
                        <AnimatePresence mode="wait">
                            {currentStep === "setup" && (
                                <motion.div key="setup" initial="enter" animate="center" exit="exit" variants={variants} className="space-y-6">
                                    <Card className="glass-card p-8 border-primary/10">
                                        <CardHeader className="px-0 pt-0">
                                            <CardTitle className="text-xl">Collection Details</CardTitle>
                                            <CardDescription>Set up your XRPL collection</CardDescription>
                                        </CardHeader>
                                        <CardContent className="px-0 space-y-6">
                                            <div className="space-y-2">
                                                <Label>Collection Name</Label>
                                                <Input
                                                    placeholder="My XRPL Collection"
                                                    value={name}
                                                    onChange={e => setName(e.target.value)}
                                                    className="h-12 text-lg font-bold"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Symbol</Label>
                                                <Input
                                                    placeholder="XRPL"
                                                    value={symbol}
                                                    onChange={e => setSymbol(e.target.value.toUpperCase())}
                                                    maxLength={10}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Description</Label>
                                                <Input
                                                    placeholder="A unique collection on XRP Ledger..."
                                                    value={description}
                                                    onChange={e => setDescription(e.target.value)}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>Network</Label>
                                                    <div className="h-10 flex items-center px-3 rounded-md border border-input bg-muted/40 text-sm">XRPL Mainnet</div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Transfer Fee (%)</Label>
                                                    <Input
                                                        type="number"
                                                        value={transferFee}
                                                        onChange={e => setTransferFee(Math.min(50, Math.max(0, Number(e.target.value))))}
                                                        min={0}
                                                        max={50}
                                                        step={0.1}
                                                    />
                                                    <p className="text-[10px] text-muted-foreground">XLS-20 max 50%. Requires Transferable flag.</p>
                                                </div>
                                            </div>

                                            {/* XLS-20 NFTokenMint flags */}
                                            <div className="space-y-2">
                                                <Label>Token Flags (XLS-20)</Label>
                                                <div className="grid grid-cols-2 gap-2 text-sm">
                                                    <label className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer">
                                                        <input type="checkbox" checked={flagTransferable} onChange={e => setFlagTransferable(e.target.checked)} />
                                                        <span>Transferable</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer">
                                                        <input type="checkbox" checked={flagBurnable} onChange={e => setFlagBurnable(e.target.checked)} />
                                                        <span>Burnable</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer">
                                                        <input type="checkbox" checked={flagOnlyXRP} onChange={e => setFlagOnlyXRP(e.target.checked)} />
                                                        <span>OnlyXRP</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer">
                                                        <input type="checkbox" checked={flagTrustLine} onChange={e => setFlagTrustLine(e.target.checked)} />
                                                        <span>TrustLine</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* NFTokenTaxon — required group identifier */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>NFTokenTaxon</Label>
                                                    <Input
                                                        type="number"
                                                        value={taxon}
                                                        onChange={e => setTaxon(Math.max(0, Number(e.target.value) | 0))}
                                                        min={0}
                                                    />
                                                    <p className="text-[10px] text-muted-foreground">Required XLS-20 collection grouping ID.</p>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Issuer Address</Label>
                                                    <Input
                                                        value={address || ''}
                                                        readOnly
                                                        placeholder={isConnected ? '' : 'Connect XRPL wallet'}
                                                        className="font-mono text-xs"
                                                    />
                                                </div>
                                            </div>
                                            <Button
                                                className="w-full h-12 text-lg gap-2 mt-4"
                                                onClick={() => setCurrentStep("upload")}
                                                disabled={!name}
                                            >
                                                Next: Upload NFTs <ChevronRight className="w-5 h-5" />
                                            </Button>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            )}

                            {currentStep === "upload" && (
                                <motion.div key="upload" initial="enter" animate="center" exit="exit" variants={variants} className="space-y-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <Button variant="ghost" onClick={() => setCurrentStep("setup")} className="gap-2">
                                            <ArrowLeft className="w-4 h-4" /> Back
                                        </Button>
                                        <Button onClick={() => setCurrentStep("review")} disabled={nftItems.length === 0} className="gap-2">
                                            Next: Review <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    
                                    <Card className="glass-card p-8 border-primary/10">
                                        <CardHeader className="px-0 pt-0">
                                            <CardTitle className="text-xl">Upload NFTs</CardTitle>
                                            <CardDescription>Add images for your collection</CardDescription>
                                        </CardHeader>
                                        <CardContent className="px-0 space-y-6">
                                            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                                                <input
                                                    type="file"
                                                    multiple
                                                    accept="image/*"
                                                    onChange={e => handleFileUpload(e.target.files)}
                                                    className="hidden"
                                                    id="file-upload"
                                                    disabled={isUploading}
                                                />
                                                <label htmlFor="file-upload" className="cursor-pointer">
                                                    <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                                                    <p className="text-sm text-muted-foreground">
                                                        {isUploading ? "Uploading..." : "Click to upload images or drag and drop"}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground mt-2">
                                                        Square images only · {MIN_DIM}x{MIN_DIM} to {MAX_DIM}x{MAX_DIM} px · max {MAX_NFTS.toLocaleString()} NFTs
                                                    </p>
                                                </label>
                                            </div>

                                            {nftItems.length > 0 && (
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <Label>Uploaded NFTs ({nftItems.length.toLocaleString()} / {MAX_NFTS.toLocaleString()})</Label>
                                                        <Badge variant="outline">{nftItems.length} items</Badge>
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-4">
                                                        {nftItems.map((item, index) => (
                                                            <div key={index} className="relative group">
                                                                <img
                                                                    src={item.preview}
                                                                    alt={item.name}
                                                                    className="w-full aspect-square object-cover rounded-lg border border-border"
                                                                />
                                                                <button
                                                                    onClick={() => removeItem(index)}
                                                                    className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                                <p className="text-xs text-muted-foreground mt-1 truncate">{item.name}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            )}

                            {currentStep === "review" && (
                                <motion.div key="review" initial="enter" animate="center" exit="exit" variants={variants} className="space-y-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <Button variant="ghost" onClick={() => setCurrentStep("upload")} className="gap-2">
                                            <ArrowLeft className="w-4 h-4" /> Back
                                        </Button>
                                        {isConnected && chainType === 'xrpl' ? (
                                            <Button onClick={handleMint} className="gap-2 bg-gradient-to-r from-primary to-accent">
                                                Launch Collection <Rocket className="w-4 h-4" />
                                            </Button>
                                        ) : (
                                            <Button onClick={() => connectXRPL()} className="gap-2">
                                                Connect XRPL Wallet
                                            </Button>
                                        )}
                                    </div>
                                    
                                    <Card className="glass-card p-8 border-primary/10">
                                        <CardHeader className="px-0 pt-0">
                                            <CardTitle className="text-xl">Review & Launch</CardTitle>
                                            <CardDescription>Confirm your XLS-20 collection details</CardDescription>
                                        </CardHeader>
                                        <CardContent className="px-0 space-y-6">
                                            <div className="space-y-4">
                                                <div className="flex justify-between"><Label>Name</Label><span className="font-medium">{name}</span></div>
                                                <div className="flex justify-between"><Label>Symbol</Label><span className="font-medium">{symbol}</span></div>
                                                <div className="flex justify-between"><Label>Network</Label><Badge variant={network === "mainnet" ? "default" : "secondary"}>{network}</Badge></div>
                                                <div className="flex justify-between"><Label>NFTokenTaxon</Label><span className="font-mono text-sm">{taxon}</span></div>
                                                <div className="flex justify-between"><Label>Transfer Fee</Label><span className="font-medium">{transferFee}%</span></div>
                                                <div className="flex justify-between gap-4"><Label>Flags</Label><span className="font-mono text-xs text-right">{[flagTransferable && 'Transferable', flagBurnable && 'Burnable', flagOnlyXRP && 'OnlyXRP', flagTrustLine && 'TrustLine'].filter(Boolean).join(', ') || 'None'}</span></div>
                                                <div className="flex justify-between gap-4"><Label>Issuer</Label><span className="font-mono text-xs text-right truncate max-w-[60%]">{address || '— not connected —'}</span></div>
                                                <div className="flex justify-between"><Label>Total NFTs</Label><span className="font-medium">{nftItems.length}</span></div>
                                            </div>
                                            <Separator />
                                            <div className="text-sm text-muted-foreground">
                                                <p>By clicking "Launch Collection", you agree to deploy this collection on the XRP Ledger.</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            )}

                            {currentStep === "minting" && (
                                <motion.div key="minting" initial="enter" animate="center" exit="exit" variants={variants} className="space-y-8 flex flex-col items-center justify-center text-center py-12">
                                    <div className="w-24 h-24 rounded-3xl bg-primary/20 flex items-center justify-center mb-4 animate-pulse">
                                        {isLaunching ? (
                                            <Loader2 className="w-12 h-12 text-primary animate-spin" />
                                        ) : (
                                            <Wand2 className="w-12 h-12 text-primary" />
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <h2 className="text-3xl font-bold">Launching Collection</h2>
                                        <p className="text-muted-foreground max-w-sm">
                                            Minting {nftItems.length} NFTs on XRP Ledger...
                                        </p>
                                    </div>

                                    {isLaunching && (
                                        <div className="w-full max-w-sm space-y-4">
                                            <div className="flex justify-between text-sm font-medium">
                                                <span>Progress</span>
                                                <span>{progress.current}/{progress.total}</span>
                                            </div>
                                            <Progress value={(progress.current / progress.total) * 100} className="h-3" />
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {currentStep === "complete" && (
                                <motion.div key="complete" initial="enter" animate="center" exit="exit" variants={variants} className="space-y-8 flex flex-col items-center justify-center text-center py-12">
                                    <div className="w-24 h-24 rounded-3xl bg-green-500/20 flex items-center justify-center mb-4">
                                        <CheckCircle2 className="w-12 h-12 text-green-500" />
                                    </div>
                                    <div className="space-y-2">
                                        <h2 className="text-3xl font-bold">Collection Launched!</h2>
                                        <p className="text-muted-foreground max-w-sm">
                                            Your XRPL collection has been successfully deployed with {nftItems.length} NFTs.
                                        </p>
                                    </div>

                                    <div className="flex gap-4">
                                        <Button onClick={() => navigate("/launchpad")} variant="outline">
                                            Back to Launchpad
                                        </Button>
                                        <Button onClick={() => {
                                            setCurrentStep("setup");
                                            setName("");
                                            setDescription("");
                                            setSymbol("");
                                            setNftItems([]);
                                            setMintResult(null);
                                        }}>
                                            Create Another
                                        </Button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Sidebar */}
                    <div className="w-full md:w-[320px] shrink-0 space-y-4">
                        <Card className="glass-card p-6 border-white/5 bg-white/5">
                            <h3 className="font-bold flex items-center gap-2 mb-4">
                                <ImageIcon className="w-4 h-4 text-primary" /> Collection Info
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Network</span>
                                    <Badge variant="outline">{network}</Badge>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Standard</span>
                                    <span className="text-primary font-bold">XLS-20</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">NFTs</span>
                                    <span className="font-bold">{nftItems.length}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Transfer Fee</span>
                                    <span className="font-bold">{transferFee}%</span>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
}
