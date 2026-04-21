import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Image as ImageIcon, Copy, Upload, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useSolanaLaunch } from "@/hooks/useSolanaLaunch";
import { useWallet } from "@/providers/WalletProvider";
import { getErrorMessage } from "@/lib/errorUtils";
import { cn } from "@/lib/utils";
import { type SupportedChain, getDbChainValue } from "@/config/chains";
import { supabase } from "@/integrations/supabase/client";
import { uploadBatchToArweave, BatchUploadItem, uploadToArweave, preFundIrysForBatch } from "@/integrations/irys/client";
import { useMonadLaunch } from "@/hooks/useMonadLaunch";
import { Plus, Trash2, Clock, Calendar } from "lucide-react";
import { buildMusicNftMetadata } from "@/lib/musicMetadata";

interface Tier {
    name: string;
    supply: number;
    price?: number;
    startDate?: string;
    endDate?: string;
}

interface CreateOneOfOneModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    chain?: SupportedChain;
}

export function CreateOneOfOneModal({ open, onOpenChange, onSuccess, chain = 'solana' }: CreateOneOfOneModalProps) {
    const { deploySolanaCollection, deployBubblegumTree, mintCompressedCore, batchMintCompressedCore } = useSolanaLaunch();
    const { createCollection: deployMonadCollection, mintNFT: mintMonadNFT } = useMonadLaunch();
    const { getSolanaProvider, address, isConnected, chainType, network } = useWallet();
    const [mode, setMode] = useState<"one-of-one" | "edition">("one-of-one");
    const [isLoading, setIsLoading] = useState(false);

    // Form
    const [name, setName] = useState("");
    const [symbol, setSymbol] = useState("");
    const [description, setDescription] = useState("");
    const [supply, setSupply] = useState("1"); // Legacy single supply
    const [tiers, setTiers] = useState<Tier[]>([]);
    const [useTiers, setUseTiers] = useState(false);
    const [royaltyPercent, setRoyaltyPercent] = useState("5"); // Default 5% royalty
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [audioFile, setAudioFile] = useState<File | null>(null); // For music 1-of-1
    const [audioPreview, setAudioPreview] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            setFile(selected);
            const reader = new FileReader();
            reader.onloadend = () => setPreview(reader.result as string);
            reader.readAsDataURL(selected);
        }
    };

    const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            setAudioFile(selected);
            const url = URL.createObjectURL(selected);
            setAudioPreview(url);
        }
    };

    const handleSubmit = async () => {
        if (!file || !name) {
            toast.error("Please provide a name and an image.");
            return;
        }

        setIsLoading(true);
        try {
            if (!isConnected || !address) {
                toast.error("Please connect your wallet first. If connected, wait a moment.");
                setIsLoading(false);
                return;
            }

            // Shared Logic: Get User ID
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id || address;

            // Shared Logic: Upload Image to Arweave (Irys)
            toast.loading("Uploading artwork to Arweave...", { id: "upload" });

            // Wallet-chain mismatch guard
            const walletChain = chainType === 'monad' ? 'monad' : 'solana';
            if (walletChain !== chain) {
                toast.error(`Wallet is connected to ${walletChain.toUpperCase()} but you are deploying on ${chain.toUpperCase()}. Switch your wallet.`);
                setIsLoading(false);
                return;
            }

            // Upload audio file first if present (for music NFTs)
            let audioUrl = "";
            const solProvider = getSolanaProvider();
            if (audioFile) {
                toast.loading("Uploading audio file...", { id: "upload" });
                audioUrl = await uploadToArweave(
                    audioFile,
                    { address, chainType: walletChain, network },
                    false, undefined, undefined, undefined,
                    true, // skipFunding — we pre-fund below
                    solProvider
                );
            }

            const batchItems: BatchUploadItem[] = [
                {
                    file,
                    buildMetadata: (arweaveImageUri: string, thumbUri?: string, previewUri?: string) => {
                        // Music NFT: use Metaplex audio metadata standard
                        if (audioFile && audioUrl) {
                            return buildMusicNftMetadata(
                                {
                                    id: `track-${Date.now()}`,
                                    audioFile,
                                    audioPreview: audioPreview || '',
                                    audioUrl,
                                    coverFile: file,
                                    coverPreview: preview || '',
                                    coverUrl: arweaveImageUri,
                                    metadata: {
                                        name: `${name} ${mode === "edition" ? "Edition" : "1/1"}`,
                                        description: description || '',
                                        artist: '',
                                        album: '',
                                        trackNumber: null,
                                        genre: '',
                                        bpm: null,
                                        durationSeconds: null,
                                    }
                                },
                                arweaveImageUri,
                                audioUrl,
                                name
                            );
                        }
                        // Standard image NFT
                        return {
                            name: `${name} ${mode === "edition" ? "Edition" : "1/1"}`,
                            description,
                            image: arweaveImageUri,
                            ...(thumbUri && thumbUri !== arweaveImageUri ? { thumbnail: thumbUri } : {}),
                            ...(previewUri && previewUri !== arweaveImageUri ? { preview: previewUri } : {})
                        };
                    }
                }
            ];

            // Pre-fund Irys for the batch
            const allFiles = [file, ...(audioFile ? [audioFile] : [])];
            await preFundIrysForBatch(allFiles, { address, chainType: walletChain, network }, {
                onStatus: (status) => toast.loading(status, { id: 'upload' })
            }, solProvider);

            // Skip thumbnails for single 1-of-1 to speed up upload
            const shouldThumbnail = mode === "edition" && batchItems.length > 1;
            const { items: uploadResults, manifestUri } = await uploadBatchToArweave(
                batchItems,
                { address, chainType: walletChain, network },
                (completed, total, status) => {
                    toast.loading(status, { id: "upload" });
                },
                5, // concurrency
                shouldThumbnail, // skip thumbnails for 1-of-1
                [], // customTags
                false, // isMutable
                undefined, // rootTx
                undefined, // feeMultiplier
                undefined, // signal
                undefined, // resumeKey
                true, // skipFunding — we already pre-funded
                solProvider
            );

            const imageUrl = uploadResults[0]?.arweaveImageUri || manifestUri || "";
            const metadataUrl = uploadResults[0]?.arweaveUri || "";
            toast.dismiss("upload");

            let txHash = `mock_tx_${Date.now()}`;
            const chainName = chain === 'monad' ? 'Monad' : 'Solana';

            const mintItems = [];
            if (mode === "edition" && useTiers && tiers.length > 0) {
                for (const tier of tiers) {
                    for (let i = 0; i < tier.supply; i++) {
                        mintItems.push({
                            name: `${name} - ${tier.name} #${i + 1}`,
                            tier: tier.name
                        });
                    }
                }
            } else {
                const supplyCount = mode === "edition" ? parseInt(supply) || 1 : 1;
                for (let i = 0; i < supplyCount; i++) {
                    mintItems.push({
                        name: `${name} ${mode === "edition" ? '#' + (i + 1) : ''}`.trim(),
                        tier: mode === "edition" ? "Edition" : "1/1"
                    });
                }
            }

            if (chain === 'monad') {
                toast.loading(`Deploying Monad Collection...`, { id: "deploy" });
                const monadResult = await deployMonadCollection({
                    name,
                    symbol,
                    description: description || "Lily Pad 1/1",
                    imageUri: imageUrl,
                    royaltyBasisPoints: 0,
                    totalSupply: mintItems.length,
                });

                if (monadResult.success && monadResult.address) {
                    txHash = monadResult.address;
                    toast.loading(`Minting ${mintItems.length} NFTs on Monad...`, { id: "deploy" });
                    
                    // Monad minting is usually one by one in the current hook or batch if supported
                    for (let i = 0; i < mintItems.length; i++) {
                        await mintMonadNFT(monadResult.address, 1);
                    }
                } else {
                    throw new Error(monadResult.error || "Monad deployment failed");
                }
                toast.dismiss("deploy");
            } else {
                // Solana logic
                const provider = getSolanaProvider();
                if (!provider) throw new Error("Solana Wallet not connected");

                const creatorAddress = (provider as any)?.publicKey?.toString?.() || address;

                toast.loading("Deploying Solana collection...", { id: "deploy" });
                const royaltyBasisPoints = Math.round(parseFloat(royaltyPercent || "0") * 100);
                
                const result = await deploySolanaCollection({
                    name,
                    symbol,
                    uri: metadataUrl, // Fixed: use metadata JSON URI, not image URL
                    sellerFeeBasisPoints: royaltyBasisPoints,
                    creators: [{ address: creatorAddress, share: 100 }],
                    // 1-of-1 flow mints cNFTs via Bubblegum's mintV2, which
                    // requires the collection to carry the BubblegumV2 plugin.
                    withBubblegumV2: true,
                });

                if (result?.address) {
                    txHash = result.address;

                    toast.loading("Deploying Bubblegum Tree for compressed NFTs...", { id: "deploy" });
                    // Use smaller tree for small mints (faster + cheaper)
                    const treeDepth = mintItems.length <= 8 ? 3 : mintItems.length <= 16 ? 5 : 14;
                    const treeBuffer = mintItems.length <= 8 ? 8 : mintItems.length <= 16 ? 8 : 64;
                    const treeCanopy = mintItems.length <= 8 ? 0 : mintItems.length <= 16 ? 0 : 8;
                    const treeAddress = await deployBubblegumTree(treeDepth, treeBuffer, treeCanopy);
                    if (!treeAddress) {
                        throw new Error("Failed to deploy Bubblegum Tree. Collection was created but NFTs could not be minted.");
                    }

                    if (mintItems.length === 1) {
                        // Single mint — fastest path for 1-of-1
                        toast.loading(`Minting compressed NFT...`, { id: "deploy" });
                        await mintCompressedCore(
                            treeAddress,
                            result.address,
                            mintItems[0].name,
                            metadataUrl,
                            royaltyBasisPoints,
                            creatorAddress
                        );
                    } else {
                        // Batch mint for editions — up to 10 per transaction
                        const batchItems = mintItems.map(item => ({
                            name: item.name,
                            uri: metadataUrl,
                            sellerFeeBasisPoints: royaltyBasisPoints,
                            owner: creatorAddress,
                        }));

                        // Process in chunks of 10 (max per transaction)
                        const BATCH_SIZE = 10;
                        for (let i = 0; i < batchItems.length; i += BATCH_SIZE) {
                            const chunk = batchItems.slice(i, i + BATCH_SIZE);
                            toast.loading(`Minting batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(batchItems.length / BATCH_SIZE)} (${chunk.length} NFTs)...`, { id: "deploy" });
                            await batchMintCompressedCore(treeAddress, result.address, chunk);
                        }
                    }
                }
                toast.dismiss("deploy");
            }

            // Insert into the Database for All Chains so they show in "My NFTs"
            toast.loading("Finalizing NFT...", { id: "finalize" });

            // Supabase requests can occasionally hang on flaky networks, which
            // would freeze the "Finalizing NFT..." toast forever. Race every DB
            // call against a hard timeout so the user always gets resolution.
            const FINALIZE_TIMEOUT_MS = 20_000;
            const withTimeout = <T,>(p: PromiseLike<T>, label: string): Promise<T> =>
                Promise.race<T>([
                    Promise.resolve(p),
                    new Promise<T>((_, reject) =>
                        setTimeout(
                            () => reject(new Error(`${label} timed out after ${FINALIZE_TIMEOUT_MS / 1000}s`)),
                            FINALIZE_TIMEOUT_MS,
                        ),
                    ),
                ]);

            let collectionId: string | null = null;
            let collectionError: { message?: string } | null = null;
            try {
                const collectionsQuery = supabase
                    .from("collections")
                    .insert({
                        name: `${name} ${mode === "edition" ? "Edition" : "1/1"}`,
                        symbol,
                        description: description,
                        image_url: imageUrl,
                        creator_id: userId,
                        creator_address: address,
                        contract_address: txHash,
                        chain: getDbChainValue(chain, network as 'mainnet' | 'testnet'),
                        collection_type: mode === 'one-of-one' ? '1of1' : 'editions',
                        total_supply: mintItems.length,
                        status: 'upcoming',
                        media_type: audioFile ? 'audio' : 'image',
                    })
                    .select("id")
                    .single();
                type CollectionsResult = Awaited<typeof collectionsQuery>;
                const { data: collectionInsert, error } = await withTimeout<CollectionsResult>(
                    collectionsQuery,
                    "Collection database save",
                );
                collectionError = error;
                collectionId = error ? null : (collectionInsert?.id ?? null);
            } catch (e) {
                console.error("collections insert failed/timed out:", e);
                collectionError = { message: e instanceof Error ? e.message : String(e) };
            }

            const finalMintItems = [];
            if (mode === "edition" && useTiers && tiers.length > 0) {
                for (const tier of tiers) {
                    for (let i = 0; i < tier.supply; i++) {
                        finalMintItems.push({
                            name: `${name} - ${tier.name} #${i + 1}`,
                            tier: tier.name,
                            tokenId: finalMintItems.length + 1
                        });
                    }
                }
            } else {
                const supplyCount = mode === "edition" ? parseInt(supply) || 1 : 1;
                for (let i = 0; i < supplyCount; i++) {
                    finalMintItems.push({
                        name: `${name} ${mode === "edition" ? '#' + (i + 1) : ''}`.trim(),
                        tier: mode === "edition" ? "Edition" : "1/1",
                        tokenId: i + 1
                    });
                }
            }

            const nftRecords = [];
            for (const item of finalMintItems) {
                nftRecords.push({
                    name: item.name,
                    description: description,
                    image_url: imageUrl,
                    collection_id: collectionId,
                    owner_address: address,
                    owner_id: userId,
                    token_id: item.tokenId,
                    tx_hash: `${txHash}_${item.tokenId}`,
                    attributes: [
                        { trait_type: "Type", value: item.tier },
                        { trait_type: "Chain", value: chainName }
                    ],
                    is_revealed: true
                });
            }

            let insertError: { message?: string } | null = null;
            try {
                const nftsQuery = supabase.from("minted_nfts").insert(nftRecords);
                type NftsResult = Awaited<typeof nftsQuery>;
                const { error } = await withTimeout<NftsResult>(
                    nftsQuery,
                    "NFT database save",
                );
                insertError = error;
            } catch (e) {
                console.error("minted_nfts insert failed/timed out:", e);
                insertError = { message: e instanceof Error ? e.message : String(e) };
            }

            toast.dismiss("finalize");

            if (collectionError) {
                console.error("Collection DB Insert error:", collectionError);
            }
            if (insertError) {
                console.error("NFT Database Insert error:", insertError);
                toast.error(
                    `NFT is minted on-chain, but saving it to your profile failed (${insertError.message || "unknown"}). It may appear after a refresh.`,
                    { duration: 8000 },
                );
                onSuccess?.();
                onOpenChange(false);
            } else {
                toast.success(mode === "one-of-one" ? `1/1 Created on ${chainName}!` : `Edition Created on ${chainName}!`);
                onSuccess?.();
                onOpenChange(false);
            }

        } catch (error) {
            console.error(error);
            toast.dismiss("upload");
            toast.dismiss("deploy");
            toast.dismiss("finalize");

            // Provide a more actionable message when the Irys/RPC layer throws a
            // generic axios "Network Error" — that's almost always a transient node/RPC hiccup.
            const raw = getErrorMessage(error);
            const isTransientNetwork = /network error|failed to fetch|err_network|econnreset/i.test(raw);
            toast.error(
                isTransientNetwork
                    ? "Network error while contacting the storage node. Please check your connection and try again in a moment."
                    : raw
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn("transition-all duration-300", mode === "edition" && useTiers ? "max-w-2xl" : "max-w-md")}>
                <DialogHeader>
                    <DialogTitle>Launch {mode === "one-of-one" ? "1-of-1" : "Edition"}</DialogTitle>
                    <DialogDescription>
                        Create a standalone NFT or a limited edition series on {chain === 'monad' ? 'Monad' : 'Solana'}.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={mode} onValueChange={(v: any) => setMode(v)}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="one-of-one" className="gap-2">
                            <ImageIcon className="w-4 h-4" /> 1-of-1
                        </TabsTrigger>
                        <TabsTrigger value="edition" className="gap-2">
                            <Copy className="w-4 h-4" /> Edition
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="space-y-4 py-4">
                    {/* Image Upload */}
                    <div className="flex justify-center">
                        {preview ? (
                            <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
                                <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="absolute bottom-0 w-full text-xs h-6 opacity-90"
                                    onClick={() => { setFile(null); setPreview(null); }}
                                >
                                    Change
                                </Button>
                            </div>
                        ) : (
                            <label className="w-32 h-32 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                                <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                                <span className="text-xs text-muted-foreground">Upload</span>
                                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                            </label>
                        )}
                    </div>

                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input placeholder="My Artwork" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Symbol</Label>
                            <Input placeholder="ART" value={symbol} onChange={e => setSymbol(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea placeholder="Tell the story..." value={description} onChange={e => setDescription(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                        <Label>Royalty Percentage (%)</Label>
                        <Input
                            type="number"
                            value={royaltyPercent}
                            onChange={e => setRoyaltyPercent(e.target.value)}
                            min="0"
                            max="50"
                            step="0.5"
                        />
                        <p className="text-xs text-muted-foreground">Creator royalty on secondary sales (0-50%)</p>
                    </div>

                    {/* Audio Upload for Music NFTs */}
                    <div className="space-y-2">
                        <Label>Audio File (Optional - for Music NFTs)</Label>
                        <div className="flex items-center gap-3">
                            <label className="flex-1">
                                <div className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                                    <Upload className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground truncate">
                                        {audioFile ? audioFile.name : "Upload audio file..."}
                                    </span>
                                </div>
                                <input 
                                    type="file" 
                                    accept="audio/*" 
                                    className="hidden" 
                                    onChange={handleAudioFileChange} 
                                />
                            </label>
                            {audioPreview && (
                                <audio controls className="h-8 w-32">
                                    <source src={audioPreview} />
                                </audio>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">MP3, WAV, FLAC, or other audio formats</p>
                    </div>

                    {mode === "edition" && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">Edition Type</Label>
                                <div className="flex gap-2">
                                    <Button 
                                        variant={!useTiers ? "default" : "outline"} 
                                        size="sm" 
                                        onClick={() => setUseTiers(false)}
                                        className="h-8"
                                    >
                                        Simple
                                    </Button>
                                    <Button 
                                        variant={useTiers ? "default" : "outline"} 
                                        size="sm" 
                                        onClick={() => {
                                            setUseTiers(true);
                                            if (tiers.length === 0) setTiers([{ name: "Standard", supply: 10 }]);
                                        }}
                                        className="h-8"
                                    >
                                        Tiered
                                    </Button>
                                </div>
                            </div>

                            {!useTiers ? (
                                <div className="space-y-2">
                                    <Label>Supply</Label>
                                    <Input
                                        type="number"
                                        value={supply}
                                        onChange={e => setSupply(e.target.value)}
                                        min="1"
                                    />
                                    <p className="text-xs text-muted-foreground">Number of copies to mint</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Tiers Configuration</Label>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => setTiers([...tiers, { name: "New Tier", supply: 5 }])}
                                            className="h-7 text-xs gap-1"
                                        >
                                            <Plus className="w-3 h-3" /> Add Tier
                                        </Button>
                                    </div>
                                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                        {tiers.map((tier, idx) => (
                                            <Card key={idx} className="p-3 bg-muted/30 border-muted relative group">
                                                <div className="grid grid-cols-12 gap-3 items-end">
                                                    <div className="col-span-12 sm:col-span-5 space-y-1.5">
                                                        <Label className="text-[10px]">Tier Name</Label>
                                                        <Input 
                                                            className="h-8 text-sm" 
                                                            value={tier.name} 
                                                            onChange={e => {
                                                                const newTiers = [...tiers];
                                                                newTiers[idx].name = e.target.value;
                                                                setTiers(newTiers);
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="col-span-6 sm:col-span-3 space-y-1.5">
                                                        <Label className="text-[10px]">Supply</Label>
                                                        <Input 
                                                            type="number" 
                                                            className="h-8 text-sm" 
                                                            value={tier.supply} 
                                                            onChange={e => {
                                                                const newTiers = [...tiers];
                                                                newTiers[idx].supply = parseInt(e.target.value) || 0;
                                                                setTiers(newTiers);
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="col-span-6 sm:col-span-3 space-y-1.5">
                                                        <Label className="text-[10px]">Price ({chain === 'solana' ? 'SOL' : 'MON'})</Label>
                                                        <Input 
                                                            type="number" 
                                                            className="h-8 text-sm" 
                                                            step="0.01"
                                                            value={tier.price || ""} 
                                                            placeholder="0.00"
                                                            onChange={e => {
                                                                const newTiers = [...tiers];
                                                                newTiers[idx].price = parseFloat(e.target.value) || 0;
                                                                setTiers(newTiers);
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="col-span-12 sm:col-span-1 flex justify-end">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                            onClick={() => setTiers(tiers.filter((_, i) => i !== idx))}
                                                            disabled={tiers.length <= 1}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-muted/50 pt-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                                    <div className="space-y-1">
                                                        <Label className="text-[9px] flex items-center gap-1">
                                                            <Calendar className="w-2.5 h-2.5" /> Start Date
                                                        </Label>
                                                        <Input 
                                                            type="datetime-local" 
                                                            className="h-7 text-[10px] px-1.5" 
                                                            value={tier.startDate || ""}
                                                            onChange={e => {
                                                                const newTiers = [...tiers];
                                                                newTiers[idx].startDate = e.target.value;
                                                                setTiers(newTiers);
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-[9px] flex items-center gap-1">
                                                            <Clock className="w-2.5 h-2.5" /> End Date
                                                        </Label>
                                                        <Input 
                                                            type="datetime-local" 
                                                            className="h-7 text-[10px] px-1.5" 
                                                            value={tier.endDate || ""}
                                                            onChange={e => {
                                                                const newTiers = [...tiers];
                                                                newTiers[idx].endDate = e.target.value;
                                                                setTiers(newTiers);
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground text-center italic">
                                        Total supply: {tiers.reduce((acc, t) => acc + (t.supply || 0), 0)} NFTs
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    <Button className="w-full" onClick={handleSubmit} disabled={isLoading}>
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        {mode === "one-of-one" ? "Mint 1-of-1" : "Create Edition"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
