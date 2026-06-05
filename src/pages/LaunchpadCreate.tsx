import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    Sparkles,
    Image as ImageIcon,
    Rocket,
    FolderOpen,
    Layers,
    Settings,
    ArrowLeft,
    ExternalLink,
    Loader2,
    XCircle,
    RotateCcw,
    Music,
    ChevronDown,
    Check,
    Shield,
} from "lucide-react";
import { toast } from "sonner";
import { FolderUploader } from "@/components/launchpad/FolderUploader";
import { GuardConfigurator } from "@/components/launchpad/GuardConfigurator";
import { LaunchpadPreview } from "@/components/launchpad/LaunchpadPreview";
import { LazyPreviewGrid } from "@/components/launchpad/LazyPreviewGrid";
import { LayerManager, Layer } from "@/components/launchpad/LayerManager";
import { TraitRarityEditor } from "@/components/launchpad/TraitRarityEditor";
import { TraitRulesManager, TraitRule } from "@/components/launchpad/TraitRulesManager";
import { ArtworkUploader, type ArtworkItem } from "@/components/launchpad/ArtworkUploader";
import { EditionTierManager, type ArtworkEditionConfig } from "@/components/launchpad/EditionTierManager";
import { MusicArtworkUploader } from "@/components/launchpad/MusicArtworkUploader";
import { type MusicTrack } from "@/components/launchpad/MusicMetadataEditor";
import { useWallet } from "@/providers/WalletProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useSolanaLaunch, LaunchpadPhase } from "@/hooks/useSolanaLaunch";
import { useMonadLaunch } from "@/hooks/useMonadLaunch";
import { pinCollectionToIPFS } from "@/lib/nftStorageService";
import { useIpfs } from "@/providers/IpfsProvider";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { validateAssets, AssetFile } from "@/utils/assetValidator";
import { generateAssets, GeneratedAsset } from "@/lib/assetGenerator";
import { SupportedChain, CHAINS } from "@/config/chains";
import { ChainIcon } from "@/components/launchpad/ChainSelector";
import { useChain } from "@/providers/ChainProvider";
import { useChainTheme } from "@/hooks/useChainTheme";
import { useDraftCollection } from "@/hooks/useDraftCollection";
import { cn, dataUrlToBlob } from "@/lib/utils";
import { bundleAssetsAsZip, GeneratedNFT } from "@/lib/assetBundler";
import { getDbChainValue } from "@/config/chains";
import { getLaunchpadConfig, CollectionMode } from "@/config/launchpad";
import { uploadToArweave, uploadMetadataToArweave, uploadBatchToArweave, BatchUploadItem, mutateNFTMetadata, loadUploadProgress, clearUploadProgress, preFundIrysForBatch } from "@/integrations/irys/client";
import { getErrorMessage } from "@/lib/errorUtils";
import { Progress } from "@/components/ui/progress";
import { LaunchpadTools } from "@/components/launchpad/LaunchpadTools";
import { Switch } from "@/components/ui/switch";
import { Info } from "lucide-react";
import { addToDecentralizedIndex, IndexedCollection } from "@/integrations/arweave/indexClient";
import { buildMusicNftMetadata } from "@/lib/musicMetadata";
import { getRpcUrl } from "@/config/solana";
import { CartCheckoutModal, type CheckoutStatus } from "@/components/raffles/CartCheckoutModal";
import type { CartCostEstimate } from "@/chains";

// ─── Types ───────────────────────────────────────────────────────────────────

type CollectionType = "generative" | "1of1" | "music";

const COLLECTION_TYPE_OPTIONS: { id: CollectionType; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "generative", label: "Generative / PFP", description: "Upload pre-made assets or layer-based traits", icon: Layers },
    { id: "1of1", label: "1-of-1 Art", description: "Individual artworks with unique metadata", icon: ImageIcon },
    { id: "music", label: "Music NFTs", description: "Audio tracks with cover art & metadata", icon: Music },
];

// Default Phases
const defaultPhases: LaunchpadPhase[] = [
    {
        id: "public",
        price: 0.1,
        startTime: null,
        endTime: null,
        maxPerWallet: 5,
    },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function LaunchpadCreate() {
    const { chain: chainParam, type: typeParam } = useParams<{ chain: string; type: string }>();
    const navigate = useNavigate();
    const { address, network, chainType, getSolanaProvider } = useWallet();
    const walletChain: typeof selectedChain =
        chainType === 'monad' ? 'monad' : 'solana';
    const { isAdmin } = useAuth();
    const { chain } = useChain();
    const { theme } = chain;

    const selectedChain = (chainParam as SupportedChain) || 'solana';
    useChainTheme(true);

    const solanaLaunch = useSolanaLaunch();
    const monadLaunch = useMonadLaunch();

    const { hasDraft, loadDraft, saveDraft, saveDraftCover, saveDraftAssets, clearDraft } = useDraftCollection(chainParam || 'solana', typeParam || 'generative');

    const currentChain = CHAINS[selectedChain];
    const chainSymbol = currentChain.symbol;
    const launchpadConfig = getLaunchpadConfig(selectedChain);

    // ─── Wizard State ────────────────────────────────────────────────────────
    const [currentStep, setCurrentStep] = useState(0);
    const [direction, setDirection] = useState(0);
    const [isDeploying, setIsDeploying] = useState(false);

    // Collection type — selected inline in Step 1
    const [collectionType, setCollectionType] = useState<CollectionType>(() => {
        if (typeParam === '1of1' || typeParam === 'rwa') return '1of1';
        if (typeParam === 'music') return 'music';
        return 'generative';
    });

    // Derived mode for backward compat with backend
    const mode: CollectionMode = collectionType === '1of1' ? '1of1' : collectionType === 'music' ? 'music' : 'basic';
    const is1of1 = collectionType === '1of1';
    const isMusic = collectionType === 'music';

    // Generative sub-mode: basic (folder) vs advanced (layers)
    const [useLayerMode, setUseLayerMode] = useState(false);

    const STEPS = launchpadConfig.modes[mode] || launchpadConfig.modes.basic || [];
    const maxStep = STEPS.length - 1;

    // ─── Collection Data ─────────────────────────────────────────────────────
    const [name, setName] = useState("");
    const [symbol, setSymbol] = useState("");
    const [description, setDescription] = useState("");
    const [royaltyPercent, setRoyaltyPercent] = useState(5);
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);

    // Basic Mode: Asset Data
    const [folderAssets, setFolderAssets] = useState<{ name: string; uri: string; file: File; jsonFile?: File }[]>([]);
    const [validationErrors, setValidationErrors] = useState<{ file: string, error: string }[]>([]);

    // Advanced Mode: Layer Data
    const [layers, setLayers] = useState<Layer[]>([]);
    const [generatedAssets, setGeneratedAssets] = useState<GeneratedAsset[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
    const [targetSupply, setTargetSupply] = useState(100);
    const [isDownloadingZip, setIsDownloadingZip] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    // 1/1 Mode: Artwork Data
    const [artworks, setArtworks] = useState<ArtworkItem[]>([]);
    const [editionConfigs, setEditionConfigs] = useState<ArtworkEditionConfig[]>([]);
    const [rules, setRules] = useState<TraitRule[]>([]);

    // Music Mode: Track Data
    const [tracks, setTracks] = useState<MusicTrack[]>([]);

    // Config Data
    const [phases, setPhases] = useState<LaunchpadPhase[]>(defaultPhases);
    const [treasuryWallet, setTreasuryWallet] = useState("");

    // Dynamic NFT
    const [isDynamic, setIsDynamic] = useState(false);

    // Upload cancel/resume state
    const [uploadAbortController, setUploadAbortController] = useState<AbortController | null>(null);
    const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number; status: string } | null>(null);
    const [hasResumableUpload, setHasResumableUpload] = useState(false);
    const [resumeKey, setResumeKey] = useState<string>("");
    const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);

    // Advanced settings accordion (Step 3)
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

    // ─── Deploy confirmation modal ───────────────────────────────────────────
    interface PendingOnChainDeploy {
        collectionId: string;
        itemLinks: { tokenID: string; arweaveUri: string; arweaveImageUri: string }[];
        primaryArweaveUri: string;
        assetsCount: number;
        builtMetadata?: any[];
        collectionMetadataUri?: string;
        collectionImageUri?: string;
        revealPlaceholderUri?: string;
    }
    const [pendingOnChainDeploy, setPendingOnChainDeploy] = useState<PendingOnChainDeploy | null>(null);
    const [deployCheckoutOpen, setDeployCheckoutOpen] = useState(false);
    const [deployCheckoutProcessing, setDeployCheckoutProcessing] = useState(false);
    const [deployCheckoutStatus, setDeployCheckoutStatus] = useState<CheckoutStatus>('idle');
    const [deployCheckoutEstimate, setDeployCheckoutEstimate] = useState<CartCostEstimate | null>(null);
    const [deployCheckoutProgress, setDeployCheckoutProgress] = useState({ label: "", completed: 0, total: 1 });

    // ─── Draft restore ───────────────────────────────────────────────────────
    useEffect(() => {
        const draft = loadDraft();
        if (draft) {
            setName(draft.name || '');
            setSymbol(draft.symbol || '');
            setDescription(draft.description || '');
            setRoyaltyPercent(draft.royaltyPercent ?? 5);
            setTargetSupply(draft.targetSupply ?? 100);
            setTreasuryWallet(draft.treasuryWallet || '');
            if (draft.phases?.length) setPhases(draft.phases);
            if (draft.currentStep > 0) setCurrentStep(Math.min(draft.currentStep, 2));
            if (draft.coverImageUrl) setCoverImage(draft.coverImageUrl);
            toast.info('Draft restored — re-upload your asset files to continue');
        }
    }, [loadDraft]);

    // Auto-save draft on field changes
    useEffect(() => {
        if (!name && !symbol) return;
        saveDraft({
            name, symbol, description, royaltyPercent, targetSupply, mode, currentStep, treasuryWallet,
            phases: phases as any[],
            coverImageUrl: coverImage || undefined,
            folderAssetNames: folderAssets.length > 0 ? folderAssets.map(a => a.name) : undefined,
            artworkMeta: artworks.length > 0 ? artworks.map(a => ({ name: a.name, description: a.description, attributes: a.attributes })) : undefined,
        });
    }, [name, symbol, description, royaltyPercent, targetSupply, mode, currentStep, treasuryWallet, phases, coverImage, folderAssets, artworks, saveDraft]);

    // Resume detection
    useEffect(() => {
        if (name && symbol) {
            const key = `${name}_${symbol}`.replace(/\s+/g, '_');
            setResumeKey(key);
            const saved = loadUploadProgress(key);
            if (saved && saved.completedItems.length > 0 && saved.completedItems.length < saved.totalItems) {
                setHasResumableUpload(true);
                toast.info(`Previous upload was interrupted. ${saved.completedItems.length} of ${saved.totalItems} items completed.`, {
                    duration: 8000,
                    action: { label: "Dismiss", onClick: () => {} },
                });
            } else {
                setHasResumableUpload(false);
            }
        }
    }, [name, symbol]);

    const handleCancelUpload = useCallback(() => {
        if (uploadAbortController) {
            uploadAbortController.abort();
            setUploadAbortController(null);
            toast.warning("Upload cancelled — progress saved. You can resume later.");
        }
    }, [uploadAbortController]);

    const uploadEta = useMemo(() => {
        if (!uploadProgress || !uploadStartTime || uploadProgress.completed === 0) return null;
        const elapsed = Date.now() - uploadStartTime;
        const perItem = elapsed / uploadProgress.completed;
        const remaining = (uploadProgress.total - uploadProgress.completed) * perItem;
        const minutes = Math.ceil(remaining / 60_000);
        return minutes <= 1 ? "< 1 min" : `~${minutes} min`;
    }, [uploadProgress, uploadStartTime]);

    // ─── Handlers ────────────────────────────────────────────────────────────
    const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setCoverImage(reader.result as string);
            reader.readAsDataURL(file);
            saveDraftCover(file).then(url => {
                if (url) setCoverImage(url);
            });
        }
    };

    const handleAssetsLoaded = async (assets: { name: string; uri: string; file: File; jsonFile?: File }[]) => {
        await new Promise(resolve => setTimeout(resolve, 0));
        const errors = validateAssets(assets.flatMap(a => [{ name: a.file.name, file: a.file }, a.jsonFile ? { name: a.jsonFile.name, file: a.jsonFile } : null]).filter((x): x is AssetFile => x !== null));
        setValidationErrors(errors);
        if (errors.length === 0) {
            setFolderAssets(assets);
            toast.success(`${assets.length} assets packed!`);
        } else {
            toast.error(`Found ${errors.length} issues.`);
        }
    };

    const { resolveToGateway } = useIpfs();

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const assets = await generateAssets(layers, { collectionName: name, collectionSymbol: symbol, description, totalSupply: targetSupply, allowDuplicates: false, rules }, (current, total) => setGenerationProgress({ current, total }));
            setGeneratedAssets(assets);
            toast.success("Generated!");
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadZip = async () => {
        setIsDownloadingZip(true);
        try {
            const zipBlob = await bundleAssetsAsZip(
                generatedAssets.map((a, i) => ({
                    id: i + 1,
                    traits: a.traits.map(t => ({
                        layerId: t.layer,
                        layerName: t.layer,
                        traitId: t.trait,
                        traitName: t.trait,
                        imageUrl: a.preview
                    }))
                })),
                name, description, selectedChain, 1024,
                (status, progress) => { console.log(status); setDownloadProgress(progress); }
            );
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "collection.zip";
            a.click();
            toast.success("Downloaded!");
        } catch (err: any) {
            toast.error("Export failed");
        } finally {
            setIsDownloadingZip(false);
        }
    };

    // ─── On-chain deploy (called from checkout modal) ────────────────────────
    const handleConfirmOnChainDeploy = async () => {
        if (!pendingOnChainDeploy) return;
        const { collectionId, itemLinks, primaryArweaveUri, assetsCount, builtMetadata, collectionMetadataUri, revealPlaceholderUri, collectionImageUri } = pendingOnChainDeploy;
        const finalCollectionImageUrl = collectionImageUri || (itemLinks.length > 0 ? itemLinks[0].arweaveImageUri : '');

        setDeployCheckoutProcessing(true);
        setDeployCheckoutStatus('processing');
        setDeployCheckoutProgress({ label: "Deploying collection...", completed: 0, total: 1 });

        try {
            let deployedAddress = "";
            let manifestRootForReveal: string | null = null;
            let candyMachineAddressForReveal: string | null = null;
            let candyGuardAddressForReveal: string | null = null;
            let collectionMintForReveal: string | null = null;
            setDeployCheckoutProgress({ label: "Deploying collection...", completed: 1, total: 3 });

            if (selectedChain === 'solana') {
                if (!is1of1) {
                    setDeployCheckoutProgress({ label: "Deploying collection via backend...", completed: 1, total: 3 });
                    
                    const result = await solanaLaunch.deployViaBackend({
                        collectionId,
                        name,
                        symbol,
                        uri: collectionMetadataUri || primaryArweaveUri,
                        creatorAddress: address,
                        itemsAvailable: assetsCount,
                        phases,
                        baseUri: primaryArweaveUri,
                        royaltyPercent,
                        network: network as string
                    });

                    deployedAddress = result.collectionAddress;
                    collectionMintForReveal = result.collectionAddress;
                    candyMachineAddressForReveal = result.candyMachineAddress;
                    candyGuardAddressForReveal = result.candyGuardAddress;
                    
                    setDeployCheckoutProgress({ label: "Candy Machine ready!", completed: 3, total: 3 });
                } else {
                    // For 1-of-1s, we still deploy the collection, then mint
                    setDeployCheckoutProgress({ label: "Deploying 1-of-1 collection via backend...", completed: 1, total: 3 });
                    
                    const result = await solanaLaunch.deployViaBackend({
                        collectionId,
                        name,
                        symbol,
                        uri: collectionMetadataUri || primaryArweaveUri,
                        creatorAddress: address,
                        itemsAvailable: 0, // No Candy Machine for 1-of-1s
                        phases: [],
                        baseUri: primaryArweaveUri,
                        royaltyPercent,
                        network: network as string
                    });
                    
                    deployedAddress = result.collectionAddress;
                    collectionMintForReveal = result.collectionAddress;

                    setDeployCheckoutProgress({ label: "Minting 1-of-1 NFTs to your wallet...", completed: 2, total: 3 });
                    const batchItems = itemLinks.map((item, i) => ({
                        name: builtMetadata?.[i]?.name || `${name} #${i + 1}`,
                        uri: item.arweaveUri,
                        sellerFeeBasisPoints: Math.round(royaltyPercent * 100),
                    }));
                    if (batchItems.length > 0) {
                        await solanaLaunch.batchMintCore(deployedAddress, batchItems);
                    }
                    setDeployCheckoutProgress({ label: "Minting complete!", completed: 3, total: 3 });
                }
            } else if (selectedChain === 'monad') {
                const result = await monadLaunch.createCollection({
                    name, symbol,
                    metadataBaseUri: primaryArweaveUri,
                    totalSupply: assetsCount
                });
                deployedAddress = result.address;
            }

            // Finalize DB
            const isOffline = (supabase as any).isOffline;
            if (!isOffline) {
                await supabase.from("collections").update({
                    contract_address: deployedAddress,
                    status: "live",
                    image_url: finalCollectionImageUrl,
                    is_dynamic: isDynamic || false,
                    manifest_root: manifestRootForReveal,
                    candy_machine_address: candyMachineAddressForReveal,
                    candy_guard_address: candyGuardAddressForReveal,
                    collection_mint_address: collectionMintForReveal,
                } as any).eq('id', collectionId);
            }

            // Decentralized index
            try {
                const indexedData: IndexedCollection = {
                    id: collectionId || `offline-${Date.now()}`,
                    name, symbol, description,
                    chain: selectedChain,
                    contract_address: deployedAddress,
                    image_url: finalCollectionImageUrl,
                    manifest_uri: primaryArweaveUri,
                    created_at: new Date().toISOString(),
                    creator_address: address || '',
                    is_dynamic: isDynamic || false
                };
                const indexRoot = import.meta.env.VITE_INDEX_ROOT_TX;
                await addToDecentralizedIndex(indexedData, { address, chainType: selectedChain, network }, indexRoot);
            } catch (indexErr) {
                console.warn("Decentralized indexing failed (optional):", indexErr);
            }

            setDeployCheckoutStatus('success');
            setDeployCheckoutProcessing(false);
            setDeployCheckoutOpen(false);
            setPendingOnChainDeploy(null);

            toast.success(
                <div className="flex flex-col gap-1">
                    <span className="font-bold">Successfully Launched!</span>
                    <span className="text-xs opacity-80">Metadata secured on Arweave</span>
                    <a href={primaryArweaveUri} target="_blank" rel="noreferrer" className="text-[10px] text-primary underline mt-1">View Arweave Manifest</a>
                    <span className="text-[9px] opacity-60 mt-0.5">Note: Arweave links may take 5–30 min to propagate</span>
                </div>,
                { duration: 10000 }
            );

            clearDraft();
            navigate(isOffline ? '/' : '/launchpad');
        } catch (e: any) {
            console.error("On-chain deploy failed:", e);
            setDeployCheckoutStatus('failed');
            setDeployCheckoutProcessing(false);
            toast.error(getErrorMessage(e) || "On-chain deployment failed. Your uploads are safe — try again.");
        }
    };

    // ─── Main deploy handler ─────────────────────────────────────────────────
    const handleDeploy = async () => {
        if (isDeploying) return;
        if (!name || !symbol) return toast.error("Please enter a name and symbol.");
        if (!address) return toast.error("Connect your wallet to launch.");

        if (walletChain !== selectedChain) {
            setIsDeploying(false);
            return toast.error(
                `Wallet is connected to ${walletChain.toUpperCase()} but you are deploying on ${selectedChain.toUpperCase()}. Switch your wallet or select the correct chain.`
            );
        }

        setIsDeploying(true);
        const abortCtrl = new AbortController();
        setUploadAbortController(abortCtrl);
        setUploadStartTime(Date.now());
        setUploadProgress(null);
        let collectionId = "";

        const currentRpc = getRpcUrl(network as any);
        const rpcProvider = currentRpc.includes('helius') ? 'Helius (Premium)' : 'Solana (Default)';

        try {
            toast.loading(
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium">Starting deployment flow...</span>
                    <span className="text-[10px] opacity-70">Provider: {rpcProvider}</span>
                </div>,
                { id: 'deploy' }
            );

            let assetsToUpload: { name: string; file: File; metadata: any }[] = [];

            if (is1of1) {
                assetsToUpload = artworks.map((art) => ({
                    name: art.name,
                    file: art.file!,
                    metadata: { name: art.name, description: art.description || description, attributes: art.attributes || [] }
                }));
            } else if (isMusic) {
                toast.loading("Uploading audio tracks to Arweave...", { id: 'deploy' });
                const audioUriMap: Record<number, string> = {};
                for (let i = 0; i < tracks.length; i++) {
                    const track = tracks[i];
                    toast.loading(`Uploading audio ${i + 1}/${tracks.length}...`, { id: 'deploy' });
                    const audioTags = [
                        { name: "Content-Type", value: track.audioFile.type || "audio/mpeg" },
                        { name: "App-Name", value: "TheLilyPad" },
                        { name: "Collection-Name", value: name },
                        { name: "Track-Name", value: track.metadata.name || `Track ${i + 1}` },
                        ...(track.metadata.artist ? [{ name: "Artist", value: track.metadata.artist }] : []),
                        ...(track.metadata.genre ? [{ name: "Genre", value: track.metadata.genre }] : []),
                        ...(track.metadata.bpm ? [{ name: "BPM", value: String(track.metadata.bpm) }] : []),
                        ...(track.metadata.durationSeconds ? [{ name: "Duration", value: String(track.metadata.durationSeconds) }] : []),
                        { name: "x-lilypad-music", value: "true" },
                        { name: "License", value: "yRj4a5KMctX_uOmKWCFJIjmY8DeJcusVk6-HzLiM_t8" },
                        { name: "License-Fee", value: "One-Time-0.1" },
                        { name: "Commercial-Use", value: "Allowed" },
                        { name: "Derivation", value: "Allowed-With-Credit" },
                    ];
                    const audioUri = await uploadToArweave(
                        track.audioFile, { address, chainType: walletChain, network },
                        false, undefined, undefined, audioTags, true, getSolanaProvider()
                    );
                    audioUriMap[i] = audioUri;
                }
                assetsToUpload = tracks.map((track, i) => ({
                    name: track.metadata.name || `${name} Track #${i + 1}`,
                    file: track.coverFile!,
                    metadata: { ...track.metadata, _audioUri: audioUriMap[i], _trackIndex: i }
                }));
            } else if (useLayerMode && generatedAssets.length > 0) {
                assetsToUpload = generatedAssets.map((asset) => ({
                    name: asset.name,
                    file: dataUrlToBlob(asset.preview) as File,
                    metadata: asset.metadata
                }));
            } else {
                assetsToUpload = folderAssets.map((asset) => ({
                    name: asset.name,
                    file: asset.file,
                    metadata: { name: asset.name, description, attributes: [] }
                }));
            }

            if (assetsToUpload.length === 0) return toast.error("No assets ready for launch.");

            // Pre-fund Irys
            toast.loading("Calculating total storage cost...", { id: 'deploy' });
            const allFilesToPayFor: (File | Blob)[] = [];
            if (coverFile) allFilesToPayFor.push(coverFile);
            assetsToUpload.forEach(asset => allFilesToPayFor.push(asset.file));
            if (isMusic) tracks.forEach(t => allFilesToPayFor.push(t.audioFile));

            await preFundIrysForBatch(allFilesToPayFor, { address, chainType: walletChain, network }, {
                onStatus: (status) => toast.loading(status, { id: 'deploy' })
            }, getSolanaProvider());

            // DB entry
            toast.loading("Establishing provenance...", { id: 'deploy' });
            const { data: { user } } = await supabase.auth.getUser();
            const { data: collection, error: collErr } = await supabase
                .from("collections")
                .insert({
                    name, symbol, description,
                    chain: getDbChainValue(selectedChain, network as 'mainnet' | 'testnet'),
                    status: "upcoming",
                    total_supply: assetsToUpload.length,
                    creator_id: user?.id,
                    creator_address: address,
                    collection_type: isMusic ? 'music' : (is1of1 ? '1of1' : 'generative'),
                    media_type: isMusic ? 'audio' : 'image',
                })
                .select('id')
                .single();

            if (collErr) throw collErr;
            collectionId = collection.id;

            // Upload to Arweave
            toast.loading(`Securing ${assetsToUpload.length} items to Arweave...`, { id: 'deploy' });
            const builtMetadata: any[] = new Array(assetsToUpload.length);

            const batchItems: BatchUploadItem[] = assetsToUpload.map((asset, idx) => ({
                file: asset.file,
                buildMetadata: (arweaveImageUri: string, thumbUri?: string, previewUri?: string) => {
                    let m: any;
                    if (isMusic && asset.metadata._audioUri) {
                        const track = tracks[asset.metadata._trackIndex ?? idx];
                        m = buildMusicNftMetadata(track, arweaveImageUri, asset.metadata._audioUri, name);
                    } else {
                        m = {
                            ...asset.metadata,
                            image: arweaveImageUri,
                            ...(thumbUri && thumbUri !== arweaveImageUri ? { thumbnail: thumbUri } : {}),
                            ...(previewUri && previewUri !== arweaveImageUri ? { preview: previewUri } : {}),
                        };
                    }
                    builtMetadata[idx] = m;
                    return m;
                },
            }));

            const { items: uploadResults, manifestUri } = await uploadBatchToArweave(
                batchItems,
                { address, chainType: walletChain, network },
                (completed, total, status) => {
                    setUploadProgress({ completed, total, status });
                    toast.loading(status, { id: 'deploy' });
                },
                10, true,
                [{ name: "Collection-Name", value: name }, { name: "Collection-Symbol", value: symbol }],
                isDynamic, undefined, undefined,
                abortCtrl.signal, resumeKey || undefined, true, getSolanaProvider()
            );

            if (abortCtrl.signal.aborted) {
                setIsDeploying(false);
                setUploadAbortController(null);
                setHasResumableUpload(true);
                return;
            }

            if (resumeKey) clearUploadProgress(resumeKey);
            setHasResumableUpload(false);

            const itemLinks = uploadResults.map((r) => ({
                tokenID: r.tokenId.toString(),
                arweaveUri: r.arweaveUri,
                arweaveImageUri: r.arweaveImageUri,
                arweaveThumbUri: r.arweaveThumbUri,
                arweavePreviewUri: r.arweavePreviewUri,
            }));

            toast.loading("Persistence secured on Arweave...", { id: 'deploy' });
            const primaryArweaveUri = manifestUri || (itemLinks.length > 0 ? itemLinks[0].arweaveUri : "");

            // Upload collection metadata & reveal placeholder
            let collectionMetadataUri = "";
            let revealPlaceholderUri = "";
            let collectionImageUri = "";

            if (coverFile) {
                toast.loading("Uploading collection banner/metadata to Arweave...", { id: 'deploy' });
                collectionImageUri = await uploadToArweave(
                    coverFile, { address, chainType: walletChain, network },
                    false, undefined, undefined, [{ name: "Content-Type", value: coverFile.type }], true, getSolanaProvider()
                );

                const collectionMetadata = { name, symbol, description, image: collectionImageUri };
                collectionMetadataUri = await uploadMetadataToArweave(
                    collectionMetadata, { address, chainType: walletChain, network },
                    false, undefined, undefined, getSolanaProvider()
                );

                const revealMetadata = { name: `Unrevealed - ${name}`, description: "This item has not been revealed yet.", image: collectionImageUri };
                revealPlaceholderUri = await uploadMetadataToArweave(
                    revealMetadata, { address, chainType: walletChain, network },
                    false, undefined, undefined, getSolanaProvider()
                );
            }

            // Show cost preview modal
            const isCompressed = !is1of1;
            const onChainEstimate = solanaLaunch.estimateCheckoutCost(assetsToUpload.length, 0, isCompressed);

            setPendingOnChainDeploy({
                collectionId, itemLinks, primaryArweaveUri,
                assetsCount: assetsToUpload.length,
                builtMetadata, collectionMetadataUri, revealPlaceholderUri, collectionImageUri,
            });
            setDeployCheckoutEstimate(onChainEstimate);
            setDeployCheckoutOpen(true);
            setIsDeploying(false);
            toast.dismiss('deploy');
            return;

        } catch (e: any) {
            console.error("Launch Error:", e);
            let errorMessage = e.message || "Launch failed";
            const lower = errorMessage.toLowerCase();
            const isFetchErr = lower.includes("fetch") || lower.includes("network error") || lower.includes("failed to fetch");
            const mentionsIrys = lower.includes("irys") || lower.includes("arweave") || lower.includes("turbo") || lower.includes("bundle") || lower.includes("upload");
            const mentionsRpc = lower.includes("rpc") || lower.includes("blockhash") || lower.includes("simulate") || lower.includes("send transaction") || lower.includes("429");

            let description: string | undefined;
            if (isFetchErr && mentionsIrys && !mentionsRpc) {
                errorMessage = "Arweave/Irys upload failed: the uploader endpoint is unreachable or rate-limited.";
                description = "Tip: Retry in a moment. This is an asset-upload issue, not your Solana RPC.";
            } else if (isFetchErr && mentionsRpc) {
                errorMessage = "Network Connection Error: The Solana RPC is currently unstable or rate-limited.";
                description = "Tip: Try switching to a different RPC (Helius) in the Wallet Connection settings (gear icon) for better stability on devnet.";
            } else if (isFetchErr) {
                errorMessage = `Network request failed: ${errorMessage}`;
                description = "A network call failed. Check your connection and retry.";
            }

            toast.error(errorMessage, {
                id: 'deploy',
                duration: 8000,
                description,
            });

            const isOffline = (supabase as any).isOffline;
            if (collectionId && !isOffline) {
                await supabase.from("collections")
                    .update({ status: 'failed', description: `Launch failed: ${errorMessage}. ` + (description || '') })
                    .eq('id', collectionId);
            }
        } finally {
            setIsDeploying(false);
            setUploadAbortController(null);
            setUploadProgress(null);
            setUploadStartTime(null);
        }
    };

    // ─── Navigation ──────────────────────────────────────────────────────────
    const nextStep = () => {
        if (currentStep < maxStep) { setDirection(1); setCurrentStep(s => s + 1); }
    };
    const prevStep = () => {
        if (currentStep > 0) { setDirection(-1); setCurrentStep(s => s - 1); }
    };

    const variants = {
        enter: (d: number) => ({ x: d > 0 ? 50 : -50, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (d: number) => ({ x: d < 0 ? 50 : -50, opacity: 0 }),
    };

    // ─── Step validation ─────────────────────────────────────────────────────
    const canProceedFromStep = (step: number): boolean => {
        if (step === 0) return !!(name && symbol);
        if (step === 1) {
            if (is1of1) return artworks.length > 0;
            if (isMusic) return tracks.length > 0;
            if (useLayerMode) return generatedAssets.length > 0 || layers.length > 0;
            return folderAssets.length > 0;
        }
        return true;
    };

    // Asset count for preview
    const assetCount = is1of1 ? artworks.length : isMusic ? tracks.length : useLayerMode ? (generatedAssets.length || targetSupply) : folderAssets.length;

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-muted/40 flex flex-col">
            <Navbar />
            <main className="flex-1 pt-16 px-3 sm:px-6 lg:px-10 pb-6 lg:pb-10">
                <div className="mx-auto w-full max-w-[1400px] bg-card rounded-[28px] lg:rounded-[40px] shadow-[0_30px_80px_-30px_hsl(var(--foreground)/0.15)] border border-border/60 overflow-hidden flex flex-col lg:flex-row min-h-[calc(100vh-7rem)]">

                    {/* ─── CONFIG PANEL ─────────────────────────────────────── */}
                    <div className="w-full lg:w-[460px] xl:w-[520px] flex flex-col bg-card relative z-20 lg:border-r lg:border-border/60">

                        {/* Header */}
                        <div className="px-6 sm:px-8 pt-8 sm:pt-10 pb-5">
                            <button
                                onClick={() => navigate('/launchpad')}
                                className="flex items-center text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground hover:text-primary transition-colors mb-5 group"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" />
                                Back to Launchpad
                            </button>
                            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">New Collection</h1>
                            <p className="text-sm text-muted-foreground mt-1">Deploy with Metaplex Core on {currentChain.name}</p>
                        </div>

                        {/* ─── 3-Step Indicator ─────────────────────────────── */}
                        <div className="px-6 sm:px-8 mb-6">
                            <div className="flex items-center gap-0">
                                {STEPS.map((step, idx) => {
                                    const active = currentStep === step.id;
                                    const completed = currentStep > step.id;
                                    return (
                                        <React.Fragment key={step.id}>
                                            <button
                                                onClick={() => completed && setCurrentStep(step.id)}
                                                className={cn(
                                                    "flex items-center gap-2.5 transition-all",
                                                    completed && "cursor-pointer",
                                                    !active && !completed && "cursor-default"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all shrink-0",
                                                    active && "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-110",
                                                    completed && "bg-primary/15 text-primary border border-primary/30",
                                                    !active && !completed && "bg-muted text-muted-foreground/50"
                                                )}>
                                                    {completed ? <Check className="w-4 h-4" /> : idx + 1}
                                                </div>
                                                <div className={cn(
                                                    "hidden sm:block",
                                                    !active && "opacity-50"
                                                )}>
                                                    <p className={cn("text-xs font-bold leading-none", active && "text-primary")}>{step.title}</p>
                                                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{step.description}</p>
                                                </div>
                                            </button>
                                            {idx < STEPS.length - 1 && (
                                                <div className={cn(
                                                    "flex-1 h-px mx-3 transition-colors",
                                                    completed ? "bg-primary/40" : "bg-border"
                                                )} />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ─── Form Content ────────────────────────────────── */}
                        <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-40 scroll-smooth">
                            <AnimatePresence initial={false} custom={direction} mode="wait">
                                <motion.div
                                    key={currentStep}
                                    custom={direction}
                                    variants={variants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    className="space-y-8"
                                >
                                    {/* ═══ STEP 0: Collection Info ═══════════════════ */}
                                    {currentStep === 0 && (
                                        <div className="space-y-7">

                                            {/* Collection Type Selector */}
                                            <div className="space-y-3">
                                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Collection Type</Label>
                                                <div className="grid grid-cols-1 gap-2.5">
                                                    {COLLECTION_TYPE_OPTIONS.filter(o => o.id !== 'music' || selectedChain === 'solana').map((option) => {
                                                        const Icon = option.icon;
                                                        const selected = collectionType === option.id;
                                                        return (
                                                            <button
                                                                key={option.id}
                                                                onClick={() => setCollectionType(option.id)}
                                                                className={cn(
                                                                    "flex items-center gap-4 p-4 rounded-2xl text-left transition-all border",
                                                                    selected
                                                                        ? "border-primary bg-primary/8 shadow-sm shadow-primary/10"
                                                                        : "border-border hover:border-primary/30 hover:bg-muted/40"
                                                                )}
                                                            >
                                                                <div className={cn(
                                                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                                                    selected ? "bg-primary/20" : "bg-muted"
                                                                )}>
                                                                    <Icon className={cn("w-5 h-5", selected ? "text-primary" : "text-muted-foreground")} />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={cn("text-sm font-bold", selected && "text-primary")}>{option.label}</p>
                                                                    <p className="text-[11px] text-muted-foreground leading-relaxed">{option.description}</p>
                                                                </div>
                                                                {selected && (
                                                                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                                                                        <Check className="w-3.5 h-3.5 text-primary-foreground" />
                                                                    </div>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <Separator className="opacity-30" />

                                            {/* Cover Image */}
                                            <div className="space-y-3">
                                                <Label>Cover Image</Label>
                                                <div className="border-2 border-dashed border-border rounded-3xl p-6 hover:border-primary/50 hover:bg-primary/5 text-center cursor-pointer relative transition-all bg-muted/30">
                                                    <Input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleCoverUpload} />
                                                    {coverImage ? <img src={coverImage} className="max-h-40 mx-auto rounded-2xl" alt="Cover" /> : (
                                                        <div className="flex flex-col items-center gap-2 py-3">
                                                            <div className="w-10 h-10 bg-card rounded-full shadow-sm flex items-center justify-center">
                                                                <ImageIcon className="w-5 h-5 text-primary" />
                                                            </div>
                                                            <span className="text-xs font-semibold text-muted-foreground">Upload Cover Art</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Name + Symbol */}
                                            <div className="space-y-3"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="My Collection" /></div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-3"><Label>Symbol</Label><Input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="MYC" /></div>
                                                <div className="space-y-3"><Label>Royalty %</Label><Input type="number" value={royaltyPercent} onChange={e => setRoyaltyPercent(Number(e.target.value))} /></div>
                                            </div>
                                            <div className="space-y-3"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell the story of your collection..." rows={3} /></div>

                                            {/* Dynamic NFT Toggle */}
                                            <div className="p-1 bg-muted rounded-3xl">
                                                <div className="bg-card p-4 rounded-[20px] shadow-sm flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center shrink-0">
                                                            <Sparkles className="w-4 h-4 text-primary-foreground" />
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-foreground text-sm">Dynamic NFT</h4>
                                                            <p className="text-[10px] text-muted-foreground">Enable post-mint metadata updates</p>
                                                        </div>
                                                    </div>
                                                    <Switch checked={isDynamic} onCheckedChange={setIsDynamic} />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ═══ STEP 1: Upload Assets ═════════════════════ */}
                                    {currentStep === 1 && (
                                        <div className="space-y-6">

                                            {/* 1-of-1 Artworks */}
                                            {is1of1 && (
                                                <>
                                                    <ArtworkUploader artworks={artworks} onArtworksChange={setArtworks} collectionType="one_of_one" creatorId={address || 'anonymous'} chainSymbol={chainSymbol} />
                                                    {artworks.length > 0 && (
                                                        <EditionTierManager artworks={artworks} configs={editionConfigs} onConfigsChange={setEditionConfigs} chainSymbol={chainSymbol} />
                                                    )}
                                                </>
                                            )}

                                            {/* Music Tracks */}
                                            {isMusic && (
                                                <MusicArtworkUploader tracks={tracks} onTracksChange={setTracks} />
                                            )}

                                            {/* Generative — Basic or Layer Mode */}
                                            {collectionType === 'generative' && (
                                                <>
                                                    {/* Layer mode toggle */}
                                                    <div className="p-1 bg-muted rounded-3xl">
                                                        <div className="bg-card p-4 rounded-[20px] shadow-sm flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 bg-accent/15 rounded-2xl flex items-center justify-center shrink-0">
                                                                    <Layers className="w-4 h-4 text-accent" />
                                                                </div>
                                                                <div>
                                                                    <h4 className="font-bold text-foreground text-sm">Layer-Based Generation</h4>
                                                                    <p className="text-[10px] text-muted-foreground">Import trait layers to generate combinations</p>
                                                                </div>
                                                            </div>
                                                            <Switch checked={useLayerMode} onCheckedChange={setUseLayerMode} />
                                                        </div>
                                                    </div>

                                                    {useLayerMode ? (
                                                        <div className="space-y-6">
                                                            <LayerManager layers={layers} onLayersChange={setLayers} />

                                                            {layers.length > 0 && (
                                                                <>
                                                                    <TraitRarityEditor layers={layers} onLayersChange={setLayers} />
                                                                    <div className="border-t border-border/50 pt-6">
                                                                        <TraitRulesManager layers={layers} rules={rules} onRulesChange={setRules} />
                                                                    </div>
                                                                    <Separator className="opacity-30" />
                                                                    <div className="space-y-4">
                                                                        <div className="space-y-2">
                                                                            <Label>Target Supply</Label>
                                                                            <Input type="number" value={targetSupply} onChange={e => setTargetSupply(Number(e.target.value))} />
                                                                        </div>
                                                                        <Button onClick={handleGenerate} disabled={isGenerating} className="w-full h-12 rounded-2xl">
                                                                            {isGenerating ? `Generating ${generationProgress.current}/${generationProgress.total}` : "Generate NFTs"}
                                                                        </Button>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <FolderUploader onAssetsLoaded={handleAssetsLoaded} />
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* ═══ STEP 2: Review & Launch ════════════════════ */}
                                    {currentStep === 2 && (
                                        <div className="space-y-6">

                                            {/* Summary Card */}
                                            <div className="p-5 rounded-3xl bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/15">
                                                <h3 className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
                                                    <Shield className="w-4 h-4" />
                                                    Collection Summary
                                                </h3>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Name</p>
                                                        <p className="font-bold truncate">{name || '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Symbol</p>
                                                        <p className="font-bold">{symbol || '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Items</p>
                                                        <p className="font-bold">{assetCount}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Type</p>
                                                        <p className="font-bold capitalize">{collectionType === '1of1' ? '1-of-1' : collectionType}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Royalty</p>
                                                        <p className="font-bold">{royaltyPercent}%</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Chain</p>
                                                        <div className="flex items-center gap-1.5">
                                                            <ChainIcon chain={selectedChain} className="w-3.5 h-3.5" />
                                                            <p className="font-bold">{currentChain.name}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                {isDynamic && (
                                                    <Badge className="mt-3 bg-primary/10 text-primary border-primary/20 text-[10px]">
                                                        <Sparkles className="w-3 h-3 mr-1" />
                                                        Dynamic NFT Enabled
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Advanced Settings Accordion */}
                                            <div className="rounded-3xl border border-border/60 overflow-hidden">
                                                <button
                                                    onClick={() => setShowAdvancedSettings(v => !v)}
                                                    className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <Settings className="w-4 h-4 text-muted-foreground" />
                                                        <span className="text-sm font-bold">Mint Settings</span>
                                                        <Badge variant="outline" className="text-[9px] h-4 px-1.5">Optional</Badge>
                                                    </div>
                                                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showAdvancedSettings && "rotate-180")} />
                                                </button>
                                                <AnimatePresence>
                                                    {showAdvancedSettings && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.2 }}
                                                            className="overflow-hidden"
                                                        >
                                                            <div className="p-5 pt-0 space-y-6 border-t border-border/40">
                                                                <GuardConfigurator phase={phases[0] || defaultPhases[0]} onChange={u => setPhases(p => [{ ...(p[0] || defaultPhases[0]), ...u }])} chainSymbol={chainSymbol} />
                                                                <Separator />
                                                                <div className="space-y-3">
                                                                    <Label>Treasury Wallet</Label>
                                                                    <Input value={treasuryWallet} onChange={e => setTreasuryWallet(e.target.value)} placeholder="0x... / Address" />
                                                                    <p className="text-[10px] text-muted-foreground">Leave blank to use your connected wallet</p>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            {/* Resume banner */}
                                            {hasResumableUpload && !isDeploying && (
                                                <div className="p-4 rounded-2xl border border-accent/30 bg-accent/5 space-y-2 text-left">
                                                    <div className="flex items-center gap-2">
                                                        <RotateCcw className="w-4 h-4 text-accent" />
                                                        <span className="text-sm font-semibold">Resume Previous Upload</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        A previous upload was interrupted. Click Deploy to resume.
                                                    </p>
                                                </div>
                                            )}

                                            {/* Upload progress */}
                                            {isDeploying && uploadProgress && (
                                                <div className="space-y-3 text-left">
                                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                        <span>{uploadProgress.status}</span>
                                                        <span>
                                                            {uploadProgress.completed}/{uploadProgress.total}
                                                            {uploadEta && ` • ETA: ${uploadEta}`}
                                                        </span>
                                                    </div>
                                                    <Progress value={uploadProgress.total > 0 ? (uploadProgress.completed / uploadProgress.total) * 100 : 0} className="h-2" />
                                                </div>
                                            )}

                                            {/* Deploy button */}
                                            <div className="space-y-4 pt-2">
                                                {isDeploying ? (
                                                    <div className="flex gap-3">
                                                        <Button disabled className="flex-1 h-14 text-lg font-bold rounded-2xl">
                                                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                                            Deploying...
                                                        </Button>
                                                        <Button variant="destructive" onClick={handleCancelUpload} className="h-14 px-6 rounded-2xl">
                                                            <XCircle className="w-5 h-5 mr-1" />
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button onClick={handleDeploy} disabled={!canProceedFromStep(0) || !canProceedFromStep(1)} className="w-full h-14 text-lg font-bold rounded-2xl shadow-xl shadow-primary/20">
                                                        {hasResumableUpload ? (
                                                            <><RotateCcw className="w-5 h-5 mr-2" /> Resume Upload</>
                                                        ) : (
                                                            <><Rocket className="w-5 h-5 mr-2" /> Deploy Collection</>
                                                        )}
                                                    </Button>
                                                )}
                                                <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                                                    <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[9px]">LOWEST FEES</Badge>
                                                    <span>2.0% Flat Fee • Zero Launch Fees • Permanent Arweave Storage</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* ─── Sticky Action Footer ─────────────────────────── */}
                        <div className="absolute bottom-0 left-0 w-full p-5 sm:p-6 bg-card/95 backdrop-blur-xl border-t border-border/60 flex items-center gap-3">
                            <Button
                                variant="outline"
                                onClick={prevStep}
                                disabled={currentStep === 0 || isDeploying}
                                className="h-14 w-14 p-0 rounded-2xl shrink-0"
                                aria-label="Previous step"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                            {currentStep < maxStep ? (
                                <Button
                                    onClick={nextStep}
                                    disabled={!canProceedFromStep(currentStep) || isDeploying}
                                    className="flex-1 h-14 rounded-2xl font-bold text-sm shadow-xl shadow-primary/20 group"
                                >
                                    Continue
                                    <span className="ml-2 transition-transform group-hover:translate-x-1">→</span>
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleDeploy}
                                    disabled={isDeploying || !canProceedFromStep(0) || !canProceedFromStep(1)}
                                    className="flex-1 h-14 rounded-2xl font-bold text-sm shadow-xl shadow-primary/20"
                                >
                                    {isDeploying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deploying...</> : <><Rocket className="w-4 h-4 mr-2" /> Deploy Collection</>}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* ─── PREVIEW PANEL ────────────────────────────────────── */}
                    <div className="hidden lg:flex flex-1 bg-[hsl(160_30%_8%)] relative flex-col overflow-y-auto overflow-x-hidden p-8 lg:p-12">
                        {/* Ambient glows */}
                        <div className="absolute -top-20 -right-20 w-[500px] h-[500px] rounded-full bg-primary/15 blur-[120px] pointer-events-none" />
                        <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] rounded-full bg-accent/15 blur-[100px] pointer-events-none" />

                        <div className="relative z-10 flex justify-between items-center mb-8 max-w-xl mx-auto w-full">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">Live Preview</span>
                            </div>
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Draft</span>
                        </div>

                        <div className="max-w-xl mx-auto w-full space-y-10 relative z-10 pb-12">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="rounded-[32px] bg-[hsl(160_25%_12%)]/80 border border-white/5 p-4 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] backdrop-blur-xl"
                            >
                                <LaunchpadPreview
                                    name={name || "Collection"}
                                    description={description}
                                    coverImage={coverImage}
                                    itemsAvailable={assetCount}
                                    phases={phases}
                                    activePhaseIndex={0}
                                    selectedChain={selectedChain}
                                />
                            </motion.div>

                            {(folderAssets.length > 0 || generatedAssets.length > 0 || artworks.length > 0 || tracks.length > 0) && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.4 }}
                                    className="space-y-4"
                                >
                                    <div className="flex items-center justify-between px-2">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Asset Batch</h3>
                                        <Badge variant="outline" className="text-[10px] border-white/10 bg-white/5 text-white/70">
                                            {assetCount} items
                                        </Badge>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-xl">
                                        <LazyPreviewGrid
                                            items={isMusic ? tracks.map(t => ({ preview: t.coverPreview })) : (is1of1 ? artworks : (useLayerMode ? generatedAssets : folderAssets))}
                                            isMusic={isMusic}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Deploy confirmation modal */}
            <CartCheckoutModal
                open={deployCheckoutOpen}
                onOpenChange={(v) => {
                    if (!deployCheckoutProcessing) {
                        setDeployCheckoutOpen(v);
                        if (!v) { setDeployCheckoutStatus('idle'); setPendingOnChainDeploy(null); }
                    }
                }}
                estimate={deployCheckoutEstimate}
                itemCount={pendingOnChainDeploy?.assetsCount ?? 0}
                isCompressed={!is1of1}
                onConfirm={handleConfirmOnChainDeploy}
                isProcessing={deployCheckoutProcessing}
                progressLabel={deployCheckoutProgress.label}
                progressCompleted={deployCheckoutProgress.completed}
                progressTotal={deployCheckoutProgress.total}
                checkoutStatus={deployCheckoutStatus}
                mintedCount={0}
                failedCount={0}
                onRetry={undefined}
            />
        </div>
    );
}
