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
    ChevronLeft,
    ChevronRight,
    Sparkles,
    Tags,
    Image as ImageIcon,
    Rocket,
    AlertTriangle,
    FolderOpen,
    Layers,
    Wand2,
    Settings,
    AlertCircle,
    Hash,
    Palette,
    ArrowLeft,
    ExternalLink,
    Download,
    Loader2,
    XCircle,
    RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { FolderUploader } from "@/components/launchpad/FolderUploader";
import { GuardConfigurator } from "@/components/launchpad/GuardConfigurator";
import { LaunchpadPreview } from "@/components/launchpad/LaunchpadPreview";
import { LazyPreviewGrid } from "@/components/launchpad/LazyPreviewGrid";
import { ModeSelector } from "@/components/launchpad/ModeSelector";
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
// storageClient removed — Arweave-only flow
import { motion, AnimatePresence } from "framer-motion";
import { validateAssets, AssetFile } from "@/utils/assetValidator";
import { generateAssets, GeneratedAsset } from "@/lib/assetGenerator";
import { SupportedChain, CHAINS } from "@/config/chains";
import { ChainIcon } from "@/components/launchpad/ChainSelector";
// payloadMapper no longer needed — Arweave-only flow
import { useChain } from "@/providers/ChainProvider";
import { useChainTheme } from "@/hooks/useChainTheme";
import { useDraftCollection } from "@/hooks/useDraftCollection";
import { cn, dataUrlToBlob } from "@/lib/utils";
import { bundleAssetsAsZip, GeneratedNFT } from "@/lib/assetBundler";
import { getDbChainValue } from "@/config/chains";
import { getLaunchpadConfig, CollectionMode } from "@/config/launchpad";
import { uploadToArweave, uploadMetadataToArweave, uploadBatchToArweave, BatchUploadItem, mutateNFTMetadata, loadUploadProgress, clearUploadProgress, preFundIrysForBatch } from "@/integrations/irys/client";
import { Progress } from "@/components/ui/progress";
import { LaunchpadTools } from "@/components/launchpad/LaunchpadTools";
import { Switch } from "@/components/ui/switch";
import { Check, Info } from "lucide-react";
import { addToDecentralizedIndex, IndexedCollection } from "@/integrations/arweave/indexClient";
import { buildMusicNftMetadata } from "@/lib/musicMetadata";
import { getRpcUrl } from "@/config/solana";

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

type CollectionFlowType = "generative" | "1of1" | "music";

function resolveFlowType(standard?: string): CollectionFlowType {
    if (standard === "1of1") return "1of1";
    if (standard === "music") return "music";
    return "generative";
}

export default function LaunchpadCreate() {
    const { chain: chainParam, type: typeParam } = useParams<{ chain: string; type: string }>();
    const navigate = useNavigate();
    const { address, network, chainType, getSolanaProvider } = useWallet();
    // Derive canonical chain from the connected wallet (authoritative for deploys)
    const walletChain: typeof selectedChain =
        chainType === 'monad' ? 'monad'
        : 'solana';
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

    // Wizard State
    const [mode, setMode] = useState<CollectionMode>("basic");
    const [currentStep, setCurrentStep] = useState(0);
    const [direction, setDirection] = useState(0);
    const [isDeploying, setIsDeploying] = useState(false);

    const flowType = resolveFlowType(typeParam);
    const is1of1 = flowType === '1of1';
    const isMusic = flowType === 'music';

    const STEPS = is1of1
        ? (launchpadConfig.modes['1of1'] || launchpadConfig.modes.basic || [])
        : isMusic
            ? (launchpadConfig.modes.music || launchpadConfig.modes.basic || [])
            : (mode === "basic" ? launchpadConfig.modes.basic : launchpadConfig.modes.advanced) || [];
    const maxStep = STEPS.length - 1;

    // Collection Data
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

    // Dynamic NFT (Evolving): uses Irys mutable references so metadata can be updated post-mint
    const [isDynamic, setIsDynamic] = useState(false);

    // Upload cancel/resume state
    const [uploadAbortController, setUploadAbortController] = useState<AbortController | null>(null);
    const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number; status: string } | null>(null);
    const [hasResumableUpload, setHasResumableUpload] = useState(false);
    const [resumeKey, setResumeKey] = useState<string>("");
    const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);


    useEffect(() => {
        if (flowType === '1of1') {
            setMode('1of1');
        } else if (flowType === 'music') {
            setMode('music');
        } else if (typeParam === 'advanced' || typeParam === 'generative') {
            setMode('advanced');
        } else {
            setMode('basic');
        }
    }, [typeParam, flowType]);

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
            if (draft.currentStep > 0) setCurrentStep(draft.currentStep);
            if (draft.mode) setMode(draft.mode);
            if (draft.coverImageUrl) setCoverImage(draft.coverImageUrl);
            // editionConfigs are not persisted in draft (re-configure on restore)
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

    // Resume detection: check for saved upload progress
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

    // Calculate ETA
    const uploadEta = useMemo(() => {
        if (!uploadProgress || !uploadStartTime || uploadProgress.completed === 0) return null;
        const elapsed = Date.now() - uploadStartTime;
        const perItem = elapsed / uploadProgress.completed;
        const remaining = (uploadProgress.total - uploadProgress.completed) * perItem;
        const minutes = Math.ceil(remaining / 60_000);
        return minutes <= 1 ? "< 1 min" : `~${minutes} min`;
    }, [uploadProgress, uploadStartTime]);

    const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setCoverImage(reader.result as string);
            reader.readAsDataURL(file);
            // Persist cover to storage bucket for draft restoration
            saveDraftCover(file).then(url => {
                if (url) setCoverImage(url);
            });
        }
    };

    const handleAssetsLoaded = async (assets: { name: string; uri: string; file: File; jsonFile?: File }[]) => {
        // Yield to main thread before validation
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

    const handleDeploy = async () => {
        if (isDeploying) return;
        if (!name || !symbol) return toast.error("Please enter a name and symbol.");
        if (!address) return toast.error("Connect your wallet to launch.");

        // ── Chain-wallet mismatch guard ─────────────────────────────────────
        if (walletChain !== selectedChain) {
            setIsDeploying(false);
            return toast.error(
                `Wallet is connected to ${walletChain.toUpperCase()} but you are deploying on ${selectedChain.toUpperCase()}. ` +
                `Switch your wallet or select the correct chain.`
            );
        }

        setIsDeploying(true);
        const abortCtrl = new AbortController();
        setUploadAbortController(abortCtrl);
        setUploadStartTime(Date.now());
        setUploadProgress(null);
        let collectionId = "";

        // Show initial RPC status
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
            // ── Step 0: Identify assets to process ──────────────────────────
            let assetsToUpload: { name: string; file: File; metadata: any }[] = [];

            if (is1of1) {
                assetsToUpload = artworks.map((art, i) => ({
                    name: art.name,
                    file: art.file!,
                    metadata: {
                        name: art.name,
                        description: art.description || description,
                        attributes: art.attributes || []
                    }
                }));
            } else if (flowType === 'music') {
                // Music flow: upload audio files first, then covers
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
                        // UDL licensing tags
                        { name: "License", value: "yRj4a5KMctX_uOmKWCFJIjmY8DeJcusVk6-HzLiM_t8" },
                        { name: "License-Fee", value: "One-Time-0.1" },
                        { name: "Commercial-Use", value: "Allowed" },
                        { name: "Derivation", value: "Allowed-With-Credit" },
                    ];
                    const audioUri = await uploadToArweave(
                        track.audioFile,
                        { address, chainType: walletChain, network },
                        false, // isMutable
                        undefined, // rootTx
                        undefined, // feeMultiplier
                        audioTags,
                        true, // skipFunding - we already pre-funded
                        getSolanaProvider()
                    );
                    audioUriMap[i] = audioUri;
                }

                assetsToUpload = tracks.map((track, i) => ({
                    name: track.metadata.name || `${name} Track #${i + 1}`,
                    file: track.coverFile!,
                    metadata: {
                        // Placeholder — will be replaced by buildMetadata in batchItems
                        ...track.metadata,
                        _audioUri: audioUriMap[i],
                        _trackIndex: i,
                    }
                }));
            } else if (mode === 'advanced') {
                assetsToUpload = generatedAssets.map((asset, i) => ({
                    name: asset.name,
                    file: dataUrlToBlob(asset.preview) as File,
                    metadata: asset.metadata
                }));
            } else {
                assetsToUpload = folderAssets.map((asset, i) => ({
                    name: asset.name,
                    file: asset.file,
                    metadata: {
                        name: asset.name,
                        description: description,
                        attributes: []
                    }
                }));
            }

            if (assetsToUpload.length === 0) return toast.error("No assets ready for launch.");

            // ── Step 0.5: Pre-fund Irys for the entire batch ────────────────
            toast.loading("Calculating total storage cost...", { id: 'deploy' });
            
            // Collect all files involved in this launch for price calculation
            const allFilesToPayFor: (File | Blob)[] = [];
            if (coverFile) allFilesToPayFor.push(coverFile);
            
            assetsToUpload.forEach(asset => {
                allFilesToPayFor.push(asset.file);
                // Also account for audio files in music flow
                if (flowType === 'music' && asset.metadata._audioUri === undefined) {
                    // This case should be handled by the mapping above, but for calculation
                    // we ensure we have the sizes. 
                    // (Actually the audio files are already uploaded individually below, 
                    // so we should include them here)
                }
            });

            if (flowType === 'music') {
                tracks.forEach(t => allFilesToPayFor.push(t.audioFile));
            }

            // Estimate total size and fund once
            await preFundIrysForBatch(allFilesToPayFor, { address, chainType: walletChain, network }, {
                onStatus: (status) => toast.loading(status, { id: 'deploy' })
            }, getSolanaProvider());

            // ── Step 1: Initialize Database Entry ──────────────────────────
            toast.loading("Establishing provenance...", { id: 'deploy' });
            const { data: { user } } = await supabase.auth.getUser();

            const { data: collection, error: collErr } = await supabase
                .from("collections")
                .insert({
                    name,
                    symbol,
                    description,
                    chain: getDbChainValue(selectedChain, network as 'mainnet' | 'testnet'),
                    status: "upcoming",
                    total_supply: assetsToUpload.length,
                    creator_id: user?.id,
                    creator_address: address,
                    collection_type: flowType === 'music' ? 'music' : (is1of1 ? '1of1' : 'generative'),
                    media_type: flowType === 'music' ? 'audio' : 'image',
                })
                .select('id')
                .single();

            if (collErr) throw collErr;
            collectionId = collection.id;

            // ── Step 2: Upload to Arweave (Permanent Storage) — batch optimised ─
            toast.loading(`Securing ${assetsToUpload.length} items to Arweave (this may take a few minutes)...`, { id: 'deploy' });

            const batchItems: BatchUploadItem[] = assetsToUpload.map((asset, idx) => ({
                file: asset.file,
                buildMetadata: (arweaveImageUri: string, thumbUri?: string, previewUri?: string) => {
                    // Music flow: use buildMusicNftMetadata for proper Metaplex-standard audio metadata
                    if (flowType === 'music' && asset.metadata._audioUri) {
                        const track = tracks[asset.metadata._trackIndex ?? idx];
                        return buildMusicNftMetadata(track, arweaveImageUri, asset.metadata._audioUri, name);
                    }
                    return {
                        ...asset.metadata,
                        image: arweaveImageUri,
                        ...(thumbUri && thumbUri !== arweaveImageUri ? { thumbnail: thumbUri } : {}),
                        ...(previewUri && previewUri !== arweaveImageUri ? { preview: previewUri } : {}),
                    };
                },
            }));

            const { items: uploadResults, manifestUri } = await uploadBatchToArweave(
                batchItems,
                { address, chainType: walletChain, network },
                (completed, total, status) => {
                    setUploadProgress({ completed, total, status });
                    toast.loading(status, { id: 'deploy' });
                },
                5, // concurrency: reduced from 25 to prevent UI freeze
                true, // enable thumbnails
                [{ name: "Collection-Name", value: name }, { name: "Collection-Symbol", value: symbol }],
                isDynamic, // isMutable
                undefined, // rootTx
                undefined, // feeMultiplier
                abortCtrl.signal, // AbortSignal for cancel
                resumeKey || undefined, // resumeKey for progress persistence
                true, // skipFunding - we already pre-funded
                getSolanaProvider()
            );

            // If aborted, stop here
            if (abortCtrl.signal.aborted) {
                setIsDeploying(false);
                setUploadAbortController(null);
                setHasResumableUpload(true);
                return;
            }

            // Clear saved progress on success
            if (resumeKey) clearUploadProgress(resumeKey);
            setHasResumableUpload(false);

            const itemLinks = uploadResults.map((r) => ({
                tokenID: r.tokenId.toString(),
                arweaveUri: r.arweaveUri,
                arweaveImageUri: r.arweaveImageUri,
                arweaveThumbUri: r.arweaveThumbUri,
                arweavePreviewUri: r.arweavePreviewUri,
            }));

            // ── Step 3: Persistence Finalized ───────────────────────────────
            toast.loading("Persistence secured on Arweave...", { id: 'deploy' });
            // If the manifest was created, we can use it, otherwise fallback to first metadata
            const primaryArweaveUri = manifestUri || (itemLinks.length > 0 ? itemLinks[0].arweaveUri : "");

            // ── Step 4: Chain-Specific Deployment ───────────────────────────
            toast.loading(`Deploying on ${currentChain.name}...`, { id: 'deploy' });
            let deployedAddress = "";

            if (selectedChain === 'solana') {
                const result = await solanaLaunch.deploySolanaCollection({
                    name,
                    symbol,
                    uri: primaryArweaveUri,
                    sellerFeeBasisPoints: Math.round(royaltyPercent * 100),
                    creators: [{ address, share: 100 }]
                });
                deployedAddress = result.address;

                // Create Candy Machine for Solana
                if (mode !== '1of1') {
                    const candyMachineItems = itemLinks.map((item, i) => ({
                        name: `${name} #${i + 1}`,
                        uri: item.arweaveUri
                    }));

                    toast.loading("Creating Candy Machine...", { id: 'deploy' });
                    const cmResult = await solanaLaunch.createLaunchpadCandyMachine(
                        deployedAddress,
                        assetsToUpload.length,
                        phases,
                        { name, symbol, uri: primaryArweaveUri, sellerFeeBasisPoints: Math.round(royaltyPercent * 100), creators: [{ address, share: 100 }] },
                        treasuryWallet,
                        primaryArweaveUri
                    );

                    // Insert config lines into the Candy Machine so minting works
                    toast.loading(`Finalizing: Loading ${candyMachineItems.length} items into launchpad...`, { id: 'deploy' });
                    await solanaLaunch.insertItemsToCandyMachine(
                        cmResult.address,
                        candyMachineItems,
                        10
                    );
                }
            } else if (selectedChain === 'monad') {
                const result = await monadLaunch.createCollection({
                    name,
                    symbol,
                    metadataBaseUri: primaryArweaveUri, // Base Arweave Manifest or single metadata
                    totalSupply: assetsToUpload.length
                });
                deployedAddress = result.address;
            }

            // ── Step 5: Finalize DB (Optional in Decentralized Mode) ────────
            const isOffline = (supabase as any).isOffline;

            if (!isOffline) {
                await supabase.from("collections").update({
                    contract_address: deployedAddress,
                    status: "live",
                    image_url: (itemLinks.length > 0 ? itemLinks[0].arweaveImageUri : ''),
                    is_dynamic: isDynamic || false,
                }).eq('id', collectionId);
            }

            // ── Step 5b: Insert audio metadata for Music NFTs ───────────────
            if (!isOffline && flowType === 'music' && tracks.length > 0) {
                try {
                    const audioRows = tracks.map((track, i) => ({
                        collection_id: collectionId,
                        artwork_id: String(i),
                        audio_url: assetsToUpload[i]?.metadata?._audioUri || '',
                        cover_art_url: itemLinks[i]?.arweaveImageUri || '',
                        artist: track.metadata.artist || null,
                        album: track.metadata.album || null,
                        genre: track.metadata.genre || null,
                        bpm: track.metadata.bpm || null,
                        duration_seconds: track.metadata.durationSeconds || null,
                        track_number: track.metadata.trackNumber || null,
                    }));
                    await supabase.from('collection_audio_metadata').insert(audioRows);
                } catch (audioErr) {
                    console.warn('[Music] Failed to insert audio metadata:', audioErr);
                }
            }

            try {
                const indexedData: IndexedCollection = {
                    id: collectionId || `offline-${Date.now()}`,
                    name,
                    symbol,
                    description,
                    chain: selectedChain,
                    contract_address: deployedAddress,
                    image_url: (itemLinks.length > 0 ? itemLinks[0].arweaveImageUri : ''),
                    manifest_uri: primaryArweaveUri,
                    created_at: new Date().toISOString(),
                    creator_address: address || '',
                    is_dynamic: isDynamic || false
                };

                const indexRoot = import.meta.env.VITE_INDEX_ROOT_TX;
                const newIndexUri = await addToDecentralizedIndex(
                    indexedData,
                    { address, chainType: selectedChain, network },
                    indexRoot
                );

                console.log("[Decentralized] Index updated. If you are using a new index, save this root:",
                    newIndexUri.split('/').pop());
            } catch (indexErr) {
                console.warn("Decentralized indexing failed (optional):", indexErr);
            }

            toast.success(
                <div className="flex flex-col gap-1">
                    <span className="font-bold">Successfully Launched!</span>
                    <span className="text-xs opacity-80">Metadata secured on Arweave</span>
                    <a
                        href={primaryArweaveUri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-primary underline mt-1"
                    >
                        View Arweave Manifest
                    </a>
                </div>,
                { id: 'deploy', duration: 10000 }
            );

            clearDraft();

            // If offline, redirect to home instead of an empty launchpad list
            if (isOffline) {
                navigate('/');
            } else {
                navigate('/launchpad');
            }

        } catch (e: any) {
            console.error("Launch Error:", e);
            
            // Specifically highlight network errors which are common on testnet RPCs
            let errorMessage = e.message || "Launch failed";
            if (errorMessage.toLowerCase().includes("fetch") || errorMessage.toLowerCase().includes("network error") || errorMessage.toLowerCase().includes("failed to fetch")) {
                errorMessage = "Network Connection Error: The Solana RPC is currently unstable or rate-limited.";
            }

            toast.error(errorMessage, { 
                id: 'deploy',
                duration: 8000,
                description: "Tip: Try switching to a different RPC (Helius) in the Wallet Connection settings (gear icon) for better stability on devnet."
            });

            const isOffline = (supabase as any).isOffline;
            if (collectionId && !isOffline) {
                // Instead of deleting, mark as failed so the user has a record of the attempt
                await supabase.from("collections")
                    .update({ 
                        status: 'failed',
                        description: `Launch failed: ${errorMessage}. ` + (description || '')
                    })
                    .eq('id', collectionId);
            }
        } finally {
            setIsDeploying(false);
            setUploadAbortController(null);
            setUploadProgress(null);
            setUploadStartTime(null);
        }
    };

    const nextStep = () => {
        if (currentStep < maxStep) {
            setDirection(1);
            setCurrentStep(s => s + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setDirection(-1);
            setCurrentStep(s => s - 1);
        }
    };

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
                name,
                description,
                selectedChain,
                1024, // Resolution
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

    const variants = {
        enter: (d: number) => ({ x: d > 0 ? 50 : -50, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (d: number) => ({ x: d < 0 ? 50 : -50, opacity: 0 }),
    };

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Navbar />
            <main className="flex-1 pt-16 flex flex-col md:flex-row overflow-hidden relative">
                {/* CONFIG PANEL: Narrower on tablets, fixed on desktops */}
                <div className="w-full md:w-[380px] lg:w-[480px] xl:w-[520px] flex flex-col border-r border-border bg-card/40 backdrop-blur-md h-[calc(100vh-64px)] z-20">
                    <div className="px-6 py-5 border-b border-border bg-muted/20">
                        <Button variant="ghost" size="sm" onClick={() => navigate('/launchpad')} className="-ml-2 mb-3 text-muted-foreground hover:text-primary transition-colors">
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Launchpad
                        </Button>
                        <h1 className="text-2xl font-bold tracking-tight gradient-text-premium">Collection Setup</h1>
                    </div>

                    <div className="px-4 py-2 flex gap-2 overflow-x-auto bg-muted/10 border-b border-border/50">
                        {STEPS.map((step) => {
                            const Icon = step.icon;
                            return (
                                <button
                                    key={step.id}
                                    className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all whitespace-nowrap", currentStep === step.id ? "bg-primary/20 border-primary text-primary" : "opacity-40")}
                                >
                                    <Icon className="w-3 h-3" />
                                    <span>{step.title}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-6">
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
                                {currentStep === 0 && !is1of1 && !isMusic && <ModeSelector mode={mode as "basic" | "advanced"} onModeChange={setMode} />}
                                {((is1of1 && currentStep === 0) || (isMusic && currentStep === 0) || (!is1of1 && !isMusic && currentStep === 1)) && (
                                    <div className="space-y-6">
                                        <div className="space-y-4">
                                            <Label>Cover Image</Label>
                                            <div className="border-2 border-dashed border-white/10 rounded-xl p-8 hover:bg-white/5 text-center cursor-pointer relative">
                                                <Input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleCoverUpload} />
                                                {coverImage ? <img src={coverImage} className="max-h-48 mx-auto rounded" alt="Cover" /> : <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground" />}
                                            </div>
                                            <div className="flex flex-wrap justify-center gap-2 mt-1">
                                                <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/20">2000px+ Recommended</Badge>
                                                <Badge variant="outline" className="text-[10px] bg-muted opacity-60">Max 100MB</Badge>
                                            </div>
                                        </div>
                                        <div className="space-y-3"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-3"><Label>Symbol</Label><Input value={symbol} onChange={e => setSymbol(e.target.value)} /></div>
                                            <div className="space-y-3"><Label>Royalty %</Label><Input type="number" value={royaltyPercent} onChange={e => setRoyaltyPercent(Number(e.target.value))} /></div>
                                        </div>
                                        <div className="space-y-3"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>

                                        {/* Dynamic NFT Toggle */}
                                        <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Sparkles className="w-4 h-4 text-purple-400" />
                                                    <Label className="text-sm font-bold text-purple-300">Dynamic NFT (Evolving)</Label>
                                                </div>
                                                <Switch checked={isDynamic} onCheckedChange={setIsDynamic} />
                                            </div>
                                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                Enable to create <strong>evolving NFTs</strong> whose metadata can be updated after minting.
                                                Perfect for gaming assets that level up, loyalty programs, or seasonal art.
                                                Uses Irys mutable references — metadata updates under 100 KiB are <strong>free</strong>!
                                            </p>
                                            {isDynamic && (
                                                <div className="flex items-start gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/15">
                                                    <Info className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                                                    <p className="text-[10px] text-purple-300/80 leading-relaxed">
                                                        Your NFT metadata URI will use <code className="bg-purple-500/20 px-1 rounded text-[9px]">gateway.irys.xyz/mutable/</code> —
                                                        the same URL always resolves to the latest version. Only the original creator wallet can push updates.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {is1of1 && currentStep === 1 && <ArtworkUploader artworks={artworks} onArtworksChange={setArtworks} collectionType="one_of_one" creatorId={address || 'anonymous'} chainSymbol={chainSymbol} />}
                                {is1of1 && currentStep === 2 && (
                                    <EditionTierManager
                                        artworks={artworks}
                                        configs={editionConfigs}
                                        onConfigsChange={setEditionConfigs}
                                        chainSymbol={chainSymbol}
                                    />
                                )}
                                {!is1of1 && !isMusic && currentStep === 2 && (mode === "basic" ? <FolderUploader onAssetsLoaded={handleAssetsLoaded} /> : <LayerManager layers={layers} onLayersChange={setLayers} />)}
                                {!is1of1 && mode === "advanced" && currentStep === 3 && (
                                    <div className="space-y-8">
                                        <TraitRarityEditor layers={layers} onLayersChange={setLayers} />
                                        <div className="border-t border-border/50 pt-8 mt-8">
                                            <TraitRulesManager layers={layers} rules={rules} onRulesChange={setRules} />
                                        </div>
                                    </div>
                                )}
                                {!is1of1 && mode === "advanced" && currentStep === 4 && (
                                    <div className="space-y-6 text-center py-10">
                                        <h3 className="text-xl font-bold">Generation</h3>
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label>Target Supply</Label>
                                                <Input type="number" value={targetSupply} onChange={e => setTargetSupply(Number(e.target.value))} />
                                            </div>

                                            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 text-left space-y-2">
                                                <div className="flex items-center gap-2 text-blue-500 text-sm font-bold">
                                                    <Info className="w-4 h-4" />
                                                    Resolution Info
                                                </div>
                                                <p className="text-[10px] text-muted-foreground leading-relaxed">
                                                    Generated assets inherit the resolution of your source layers.
                                                    Standard aspect ratios (1:1, 4:5, 3:4, 16:9, etc.) are fully supported. High-res files (4000px+)
                                                    are supported but will increase upload time.
                                                </p>
                                            </div>
                                        </div>

                                        <Button onClick={handleGenerate} disabled={isGenerating} className="w-full h-12">
                                            {isGenerating ? `Generating ${generationProgress.current}/${generationProgress.total}` : "Generate NFTs"}
                                        </Button>
                                    </div>
                                )}
                                {isMusic && currentStep === 1 && <MusicArtworkUploader tracks={tracks} onTracksChange={setTracks} />}
                                {isMusic && currentStep === 2 && (
                                    <div className="space-y-4">
                                        <div className="p-4 rounded-xl bg-muted/30 border border-border">
                                            <h3 className="font-bold mb-1">Track Customization</h3>
                                            <p className="text-xs text-muted-foreground">Adjust metadata for your tracks.</p>
                                        </div>
                                        <div className="space-y-3">
                                            {tracks.map((track, i) => (
                                                <div key={track.id} className="flex items-center gap-4 p-3 border rounded bg-card">
                                                    <img src={track.coverPreview} className="w-10 h-10 rounded object-cover" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium truncate">{track.metadata.name || `Track ${i + 1}`}</p>
                                                        <p className="text-[10px] text-muted-foreground truncate">{track.metadata.artist || 'No artist'}</p>
                                                    </div>
                                                    <Badge variant="outline" className="text-[10px]">
                                                        {track.metadata.genre || 'No genre'}
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {((is1of1 && currentStep === 3) || (isMusic && currentStep === 3) || (!is1of1 && !isMusic && (mode === "basic" ? currentStep === 3 : currentStep === 5))) && (
                                    <div className="space-y-6">
                                        <GuardConfigurator phase={phases[0] || defaultPhases[0]} onChange={u => setPhases(p => [{ ...(p[0] || defaultPhases[0]), ...u }])} chainSymbol={chainSymbol} />
                                        <Separator />
                                        <div className="space-y-3">
                                            <Label>Treasury Wallet</Label>
                                            <Input value={treasuryWallet} onChange={e => setTreasuryWallet(e.target.value)} placeholder="0x... / Address" />
                                        </div>
                                    </div>
                                )}
                                {((is1of1 && currentStep === 4) || (isMusic && currentStep === 4) || (!is1of1 && !isMusic && (mode === "basic" ? currentStep === 4 : currentStep === 6))) && (
                                    <div className="space-y-6 text-center py-10">
                                        <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto"><Rocket className="w-10 h-10" /></div>
                                        <h2 className="text-2xl font-bold">Ready to Launch!</h2>
                                        <LaunchpadTools config={launchpadConfig} theme={theme} />

                                        {/* Resume banner */}
                                        {hasResumableUpload && !isDeploying && (
                                            <div className="p-4 rounded-xl border border-accent/30 bg-accent/5 space-y-3 text-left">
                                                <div className="flex items-center gap-2">
                                                    <RotateCcw className="w-4 h-4 text-accent" />
                                                    <span className="text-sm font-semibold">Resume Previous Upload</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    A previous upload was interrupted. Your progress has been saved — click Launch to resume where you left off.
                                                </p>
                                            </div>
                                        )}

                                        {/* Upload progress bar */}
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

                                        <div className="space-y-4">
                                            {isDeploying ? (
                                                <div className="flex gap-3">
                                                    <Button disabled className="flex-1 h-16 text-xl font-bold">
                                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                                        Deploying...
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        onClick={handleCancelUpload}
                                                        className="h-16 px-6"
                                                    >
                                                        <XCircle className="w-5 h-5 mr-1" />
                                                        Cancel
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button onClick={handleDeploy} className="w-full h-16 text-xl font-bold">
                                                    {hasResumableUpload ? (
                                                        <><RotateCcw className="w-5 h-5 mr-2" /> Resume Upload</>
                                                    ) : (
                                                        "Launch Collection"
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

                    <div className="px-6 py-6 border-t border-border bg-muted/30 backdrop-blur-sm flex gap-4">
                        <Button 
                            variant="outline" 
                            size="lg"
                            onClick={prevStep} 
                            disabled={currentStep === 0 || isDeploying} 
                            className="flex-1 rounded-xl font-semibold"
                        >
                            Back
                        </Button>
                        <Button 
                            size="lg"
                            onClick={nextStep} 
                            disabled={currentStep === maxStep || isDeploying} 
                            className="flex-1 rounded-xl font-bold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                        >
                            {currentStep === maxStep ? "Launch" : "Next Step"}
                        </Button>
                    </div>
                </div>

                {/* PREVIEW PANEL: Responsive visibility and scaling */}
                <div className="hidden md:flex flex-1 bg-gradient-to-br from-muted/10 to-background/50 flex-col overflow-y-auto overflow-x-hidden p-6 lg:p-12 relative">
                    {/* Perspective Background Decoration */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px]" />
                        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-accent/10 blur-[100px]" />
                    </div>

                    <div className="max-w-xl mx-auto w-full space-y-12 relative z-10 py-8">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <LaunchpadPreview
                                name={name || "Collection"}
                                description={description}
                                coverImage={coverImage}
                                itemsAvailable={is1of1 ? artworks.length : (mode === 'basic' ? folderAssets.length : targetSupply)}
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
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Asset Batch Preview</h3>
                                    <Badge variant="outline" className="text-[10px] opacity-50">
                                        Showing logic variants
                                    </Badge>
                                </div>
                                <div className="glass-card p-4 bg-card/30">
                                    <LazyPreviewGrid
                                        items={mode === 'music' ? tracks.map(t => ({ preview: t.coverPreview })) : (is1of1 ? artworks : (mode === 'basic' ? folderAssets : generatedAssets))}
                                        isMusic={mode === 'music'}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
