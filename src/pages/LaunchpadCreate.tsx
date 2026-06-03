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
import { getErrorMessage } from "@/lib/errorUtils";
import { Progress } from "@/components/ui/progress";
import { LaunchpadTools } from "@/components/launchpad/LaunchpadTools";
import { Switch } from "@/components/ui/switch";
import { Check, Info } from "lucide-react";
import { addToDecentralizedIndex, IndexedCollection } from "@/integrations/arweave/indexClient";
import { buildMusicNftMetadata } from "@/lib/musicMetadata";
import { getRpcUrl } from "@/config/solana";
import { CartCheckoutModal, type CheckoutStatus } from "@/components/raffles/CartCheckoutModal";
import type { CartCostEstimate } from "@/chains";

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

    // Deploy confirmation modal — shown after upload completes, before on-chain txs
    const handleConfirmOnChainDeploy = async () => {
        if (!pendingOnChainDeploy) return;
        const { collectionId, itemLinks, primaryArweaveUri, assetsCount, builtMetadata, collectionMetadataUri, revealPlaceholderUri, collectionImageUri } = pendingOnChainDeploy;
        // Prefer the explicit collection cover; fall back to the first item image so the
        // collection card / banner never ends up empty after a successful deploy.
        const finalCollectionImageUrl = collectionImageUri || (itemLinks.length > 0 ? itemLinks[0].arweaveImageUri : '');

        setDeployCheckoutProcessing(true);
        setDeployCheckoutStatus('processing');
        setDeployCheckoutProgress({ label: "Deploying collection...", completed: 0, total: 1 });

        try {
            let deployedAddress = "";
            // Reveal-flow metadata captured during the hidden-settings path
            let manifestRootForReveal: string | null = null;
            let candyMachineAddressForReveal: string | null = null;
            let candyGuardAddressForReveal: string | null = null;
            let collectionMintForReveal: string | null = null;
            setDeployCheckoutProgress({ label: "Deploying collection...", completed: 1, total: 3 });

            if (selectedChain === 'solana') {
                const result = await solanaLaunch.deploySolanaCollection({
                    name,
                    symbol,
                    uri: collectionMetadataUri || primaryArweaveUri,
                    sellerFeeBasisPoints: Math.round(royaltyPercent * 100),
                    creators: [{ address, share: 100 }]
                });
                deployedAddress = result.address;
                collectionMintForReveal = result.address;

                // Create Candy Machine for Solana (skip for 1-of-1 mode)
                if (mode !== '1of1') {
                    const candyMachineItems = itemLinks.map((item, i) => ({
                        name: `${name} #${i + 1}`,
                        uri: item.arweaveUri
                    }));

                    // For collections >= threshold, use Hidden Settings (3 sigs total, fixed cost).
                    // For smaller collections, use Config Lines (allows on-chain reveals).
                    // Lowered to 50 so generative drops use the fixed-cost path aggressively.
                    const USE_HIDDEN_SETTINGS_THRESHOLD = 50;

                    if (assetsCount > USE_HIDDEN_SETTINGS_THRESHOLD) {
                        // FASTEST PATH: bundle all per-item metadata into ONE Arweave
                        // directory manifest so reveal URIs resolve as
                        // arweave.net/<ROOT>/N.json without any addConfigLines tx.
                        // We use the in-memory metadata captured during upload — this
                        // avoids the 5–30 min Arweave propagation window that would
                        // otherwise break a fetch() loop here.

                        if (itemLinks.length === 0) {
                            throw new Error(
                                "No uploaded items found — cannot create Arweave manifest. " +
                                "Ensure your assets uploaded successfully before deploying."
                            );
                        }

                        setDeployCheckoutProgress({ label: "Bundling metadata into Arweave manifest...", completed: 2, total: 3 });
                        let placeholderUri = primaryArweaveUri;
                        try {
                            // Use in-memory metadata when available (avoids Arweave propagation delay).
                            // builtMetadata may have undefined holes if buildMetadata wasn't called
                            // for every index — fill those holes with fallback objects so the array
                            // length matches itemLinks exactly.
                            const metadataObjects = (builtMetadata && builtMetadata.length === itemLinks.length && builtMetadata.every(Boolean))
                                ? builtMetadata
                                : itemLinks.map((item, i) => {
                                    // Prefer in-memory if available for this index
                                    if (builtMetadata && builtMetadata[i]) return builtMetadata[i];
                                    // Fallback: construct minimal metadata from what we know
                                    return { name: `${name} #${i + 1}`, image: item.arweaveImageUri };
                                });
                            const manifest = await solanaLaunch.uploadJsonManifest(metadataObjects);
                            placeholderUri = revealPlaceholderUri || manifest.itemUris[0] || primaryArweaveUri;
                            manifestRootForReveal = manifest.manifestRoot;
                            console.log("[Deploy] Arweave manifest root:", manifest.manifestRoot);
                            console.log("[Deploy] Metadata entries:", metadataObjects.length);
                        } catch (e) {
                            console.warn("[Deploy] Manifest bundle failed, falling back to primary URI:", e);
                        }

                        setDeployCheckoutProgress({ label: "Creating Hidden Settings Candy Machine (Large Collection)...", completed: 2, total: 3 });
                        const cmResult = await solanaLaunch.createHiddenSettingsCandyMachine(
                            deployedAddress,
                            candyMachineItems,
                            phases,
                            `${name} #`,
                            placeholderUri,
                            treasuryWallet
                        );
                        candyMachineAddressForReveal = cmResult.address;
                        candyGuardAddressForReveal = (cmResult as any).candyGuardAddress ?? null;
                        console.log("[Deploy] Hidden Settings Candy Machine created:", cmResult.address);
                        console.log("[Deploy] Items hash:", Buffer.from(cmResult.itemsHash).toString('hex').slice(0, 16) + "...");
                        setDeployCheckoutProgress({ label: "Candy Machine ready (Hidden Settings - no item insertion needed)", completed: 3, total: 3 });

                    } else {
                        setDeployCheckoutProgress({ label: "Creating Candy Machine...", completed: 2, total: 3 });
                        const cmResult = await solanaLaunch.createLaunchpadCandyMachine(
                            deployedAddress,
                            assetsCount,
                            phases,
                            { name, symbol, uri: collectionMetadataUri || primaryArweaveUri, sellerFeeBasisPoints: Math.round(royaltyPercent * 100), creators: [{ address, share: 100 }] },
                            treasuryWallet,
                            primaryArweaveUri
                        );
                        candyMachineAddressForReveal = cmResult.address;
                        candyGuardAddressForReveal = (cmResult as any).candyGuardAddress ?? null;

                        // Insert config lines into the Candy Machine
                        setDeployCheckoutProgress({ label: "Loading items into Candy Machine...", completed: 3, total: 3 });
                        await solanaLaunch.insertItemsToCandyMachine(
                            cmResult.address,
                            candyMachineItems,
                            15 // Max items per config-line transaction
                        );
                    }
                } else {
                    // 1-of-1 "Metaplex RAW" flow
                    setDeployCheckoutProgress({ label: "Minting RAW 1-of-1 NFTs directly to your wallet...", completed: 2, total: 3 });
                    
                    const batchItems = itemLinks.map((item, i) => ({
                        name: builtMetadata?.[i]?.name || `${name} #${i + 1}`,
                        uri: item.arweaveUri,
                        sellerFeeBasisPoints: Math.round(royaltyPercent * 100),
                    }));
                    
                    if (batchItems.length > 0) {
                        await solanaLaunch.batchMintCore(
                            deployedAddress,
                            batchItems
                        );
                    }
                    
                    setDeployCheckoutProgress({ label: "RAW Minting Complete!", completed: 3, total: 3 });
                }
            } else if (selectedChain === 'monad') {
                const result = await monadLaunch.createCollection({
                    name,
                    symbol,
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
                    // Reveal-flow metadata — powers RevealCandyMachinePanel's
                    // updateCandyMachine step without any manual paste.
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
                    name,
                    symbol,
                    description,
                    chain: selectedChain,
                    contract_address: deployedAddress,
                    image_url: finalCollectionImageUrl,
                    manifest_uri: primaryArweaveUri,
                    created_at: new Date().toISOString(),
                    creator_address: address || '',
                    is_dynamic: isDynamic || false
                };
                const indexRoot = import.meta.env.VITE_INDEX_ROOT_TX;
                await addToDecentralizedIndex(
                    indexedData,
                    { address, chainType: selectedChain, network },
                    indexRoot
                );
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
                    <a
                        href={primaryArweaveUri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-primary underline mt-1"
                    >
                        View Arweave Manifest
                    </a>
                    <span className="text-[9px] opacity-60 mt-0.5">
                        Note: Arweave links may take 5–30 min to propagate
                    </span>
                </div>,
                { duration: 10000 }
            );

            clearDraft();
            if (isOffline) {
                navigate('/');
            } else {
                navigate('/launchpad');
            }
        } catch (e: any) {
            console.error("On-chain deploy failed:", e);
            setDeployCheckoutStatus('failed');
            setDeployCheckoutProcessing(false);
            toast.error(getErrorMessage(e) || "On-chain deployment failed. Your uploads are safe — try again.");
        }
    };

    // Deploy confirmation modal — shown after upload completes, before on-chain txs
    interface PendingOnChainDeploy {
        collectionId: string;
        itemLinks: { tokenID: string; arweaveUri: string; arweaveImageUri: string }[];
        primaryArweaveUri: string;
        assetsCount: number;
        /** In-memory metadata captured during upload — avoids re-fetching from Arweave (5–30 min propagation). */
        builtMetadata?: any[];
        collectionMetadataUri?: string;
        revealPlaceholderUri?: string;
    }
    const [pendingOnChainDeploy, setPendingOnChainDeploy] = useState<PendingOnChainDeploy | null>(null);
    const [deployCheckoutOpen, setDeployCheckoutOpen] = useState(false);
    const [deployCheckoutProcessing, setDeployCheckoutProcessing] = useState(false);
    const [deployCheckoutStatus, setDeployCheckoutStatus] = useState<CheckoutStatus>('idle');
    const [deployCheckoutEstimate, setDeployCheckoutEstimate] = useState<CartCostEstimate | null>(null);
    const [deployCheckoutProgress, setDeployCheckoutProgress] = useState({ label: "", completed: 0, total: 1 });


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

            // Capture every built metadata object so we can bundle them into an
            // Arweave directory manifest later without re-fetching from the gateway
            // (Arweave propagation can take 5–30 min — re-fetching right after
            // upload is the single biggest source of "manifest failed" errors).
            const builtMetadata: any[] = new Array(assetsToUpload.length);

            const batchItems: BatchUploadItem[] = assetsToUpload.map((asset, idx) => ({
                file: asset.file,
                buildMetadata: (arweaveImageUri: string, thumbUri?: string, previewUri?: string) => {
                    let m: any;
                    if (flowType === 'music' && asset.metadata._audioUri) {
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
                10, // concurrency: parallelizes upload batches
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

            // ── Step 3.5: Upload Collection Metadata & Reveal Placeholder ───
            let collectionMetadataUri = "";
            let revealPlaceholderUri = "";
            let collectionImageUri = "";

            if (coverFile) {
                toast.loading("Uploading collection banner/metadata to Arweave...", { id: 'deploy' });
                collectionImageUri = await uploadToArweave(
                    coverFile, 
                    { address, chainType: walletChain, network }, 
                    false, undefined, undefined, 
                    [{ name: "Content-Type", value: coverFile.type }], 
                    true, getSolanaProvider()
                );
                
                const collectionMetadata = {
                    name,
                    symbol,
                    description,
                    image: collectionImageUri,
                };
                
                collectionMetadataUri = await uploadMetadataToArweave(
                    collectionMetadata, 
                    { address, chainType: walletChain, network }, 
                    false, undefined, undefined, 
                    true, getSolanaProvider()
                );

                const revealMetadata = {
                    name: `Unrevealed - ${name}`,
                    description: "This item has not been revealed yet.",
                    image: collectionImageUri,
                };

                revealPlaceholderUri = await uploadMetadataToArweave(
                    revealMetadata, 
                    { address, chainType: walletChain, network }, 
                    false, undefined, undefined, 
                    true, getSolanaProvider()
                );
            }

            // ── PAUSE: Show cost preview modal before on-chain deployment ───
            // Storage is already paid (Turbo auto-debited during upload)
            // Estimate on-chain costs only
            const isCompressed = !is1of1; // generative/editions use compressed NFTs
            const onChainEstimate = solanaLaunch.estimateCheckoutCost(assetsToUpload.length, 0, isCompressed);

            setPendingOnChainDeploy({
                collectionId,
                itemLinks,
                primaryArweaveUri,
                assetsCount: assetsToUpload.length,
                // Pass the full array including possible undefined holes —
                // the consumer fills gaps with fallback metadata per-index.
                builtMetadata,
                collectionMetadataUri,
                revealPlaceholderUri,
                collectionImageUri,
            });
            setDeployCheckoutEstimate(onChainEstimate);
            setDeployCheckoutOpen(true);
            setIsDeploying(false); // Allow user to interact with modal
            toast.dismiss('deploy');
            return; // Exit here — on-chain deploy runs after modal confirm

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
        <div className="min-h-screen bg-muted/40 flex flex-col">
            <Navbar />
            <main className="flex-1 pt-16 px-3 sm:px-6 lg:px-10 pb-6 lg:pb-10">
                <div className="mx-auto w-full max-w-[1400px] bg-card rounded-[28px] lg:rounded-[40px] shadow-[0_30px_80px_-30px_hsl(var(--foreground)/0.15)] border border-border/60 overflow-hidden flex flex-col lg:flex-row min-h-[calc(100vh-7rem)]">
                    {/* CONFIG PANEL */}
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
                            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Collection Setup</h1>
                        </div>

                        {/* Numbered step pills */}
                        <div className="px-6 sm:px-8 mb-6">
                            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1">
                                {STEPS.map((step, idx) => {
                                    const active = currentStep === step.id;
                                    const completed = currentStep > step.id;
                                    return (
                                        <button
                                            key={step.id}
                                            onClick={() => completed && setCurrentStep(step.id)}
                                            className={cn(
                                                "shrink-0 px-4 py-2 rounded-2xl text-[11px] font-bold whitespace-nowrap transition-all",
                                                active && "bg-primary text-primary-foreground shadow-lg shadow-primary/25 px-5",
                                                !active && completed && "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 cursor-pointer",
                                                !active && !completed && "bg-muted/60 text-muted-foreground/60"
                                            )}
                                        >
                                            {String(idx + 1).padStart(2, '0')} {step.title}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Form Content */}
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
                                    {currentStep === 0 && !is1of1 && !isMusic && <ModeSelector mode={mode as "basic" | "advanced"} onModeChange={setMode} />}
                                    {((is1of1 && currentStep === 0) || (isMusic && currentStep === 0) || (!is1of1 && !isMusic && currentStep === 1)) && (
                                        <div className="space-y-6">
                                            <div className="space-y-4">
                                                <Label>Cover Image</Label>
                                                <div className="border-2 border-dashed border-border rounded-3xl p-8 hover:border-primary/50 hover:bg-primary/5 text-center cursor-pointer relative transition-all bg-muted/30">
                                                    <Input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleCoverUpload} />
                                                    {coverImage ? <img src={coverImage} className="max-h-48 mx-auto rounded-2xl" alt="Cover" /> : (
                                                        <div className="flex flex-col items-center gap-2 py-4">
                                                            <div className="w-10 h-10 bg-card rounded-full shadow-sm flex items-center justify-center">
                                                                <ImageIcon className="w-5 h-5 text-primary" />
                                                            </div>
                                                            <span className="text-xs font-semibold text-muted-foreground">Upload Cover Art</span>
                                                        </div>
                                                    )}
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
                                            <div className="p-1 bg-muted rounded-3xl">
                                                <div className="bg-card p-5 rounded-[20px] shadow-sm flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shrink-0">
                                                            <Sparkles className="w-5 h-5 text-primary-foreground" />
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-foreground text-sm">Dynamic NFT</h4>
                                                            <p className="text-[11px] text-muted-foreground">Enable post-mint metadata updates</p>
                                                        </div>
                                                    </div>
                                                    <Switch checked={isDynamic} onCheckedChange={setIsDynamic} />
                                                </div>
                                                {isDynamic && (
                                                    <div className="flex items-start gap-2 p-3 pt-2">
                                                        <Info className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                                            Mutable URI via <code className="bg-primary/10 px-1 rounded text-[9px]">gateway.irys.xyz/mutable/</code> — only the creator wallet can push updates.
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

                                                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 text-left space-y-2">
                                                    <div className="flex items-center gap-2 text-primary text-sm font-bold">
                                                        <Info className="w-4 h-4" />
                                                        Resolution Info
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                                        Generated assets inherit the resolution of your source layers. Standard aspect ratios (1:1, 4:5, 3:4, 16:9, etc.) are fully supported.
                                                    </p>
                                                </div>
                                            </div>

                                            <Button onClick={handleGenerate} disabled={isGenerating} className="w-full h-12 rounded-2xl">
                                                {isGenerating ? `Generating ${generationProgress.current}/${generationProgress.total}` : "Generate NFTs"}
                                            </Button>
                                        </div>
                                    )}
                                    {isMusic && currentStep === 1 && <MusicArtworkUploader tracks={tracks} onTracksChange={setTracks} />}
                                    {isMusic && currentStep === 2 && (
                                        <div className="space-y-4">
                                            <div className="p-4 rounded-2xl bg-muted/30 border border-border">
                                                <h3 className="font-bold mb-1">Track Customization</h3>
                                                <p className="text-xs text-muted-foreground">Adjust metadata for your tracks.</p>
                                            </div>
                                            <div className="space-y-3">
                                                {tracks.map((track, i) => (
                                                    <div key={track.id} className="flex items-center gap-4 p-3 border rounded-xl bg-card">
                                                        <img src={track.coverPreview} className="w-10 h-10 rounded-lg object-cover" />
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
                                            <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
                                                <Rocket className="w-10 h-10 text-primary" />
                                            </div>
                                            <h2 className="text-2xl font-bold">Ready to Launch!</h2>
                                            <LaunchpadTools config={launchpadConfig} theme={theme} />

                                            {hasResumableUpload && !isDeploying && (
                                                <div className="p-4 rounded-2xl border border-accent/30 bg-accent/5 space-y-3 text-left">
                                                    <div className="flex items-center gap-2">
                                                        <RotateCcw className="w-4 h-4 text-accent" />
                                                        <span className="text-sm font-semibold">Resume Previous Upload</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        A previous upload was interrupted. Your progress has been saved — click Launch to resume.
                                                    </p>
                                                </div>
                                            )}

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
                                                        <Button disabled className="flex-1 h-16 text-xl font-bold rounded-2xl">
                                                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                                            Deploying...
                                                        </Button>
                                                        <Button variant="destructive" onClick={handleCancelUpload} className="h-16 px-6 rounded-2xl">
                                                            <XCircle className="w-5 h-5 mr-1" />
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button onClick={handleDeploy} className="w-full h-16 text-xl font-bold rounded-2xl">
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

                        {/* Sticky Action Footer */}
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
                            <Button
                                onClick={nextStep}
                                disabled={currentStep === maxStep || isDeploying}
                                className="flex-1 h-14 rounded-2xl font-bold text-sm shadow-xl shadow-primary/20 group"
                            >
                                {currentStep === maxStep ? "Launch" : (
                                    <>
                                        Continue
                                        <span className="ml-2 transition-transform group-hover:translate-x-1">→</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* PREVIEW PANEL */}
                    <div className="hidden lg:flex flex-1 bg-[hsl(160_30%_8%)] relative flex-col overflow-y-auto overflow-x-hidden p-8 lg:p-12">
                        {/* Ambient glows */}
                        <div className="absolute -top-20 -right-20 w-[500px] h-[500px] rounded-full bg-primary/15 blur-[120px] pointer-events-none" />
                        <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] rounded-full bg-accent/15 blur-[100px] pointer-events-none" />

                        {/* Preview header */}
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
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Asset Batch</h3>
                                        <Badge variant="outline" className="text-[10px] border-white/10 bg-white/5 text-white/70">
                                            {(mode === 'music' ? tracks.length : (is1of1 ? artworks.length : (mode === 'basic' ? folderAssets.length : generatedAssets.length)))} items
                                        </Badge>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-xl">
                                        <LazyPreviewGrid
                                            items={mode === 'music' ? tracks.map(t => ({ preview: t.coverPreview })) : (is1of1 ? artworks : (mode === 'basic' ? folderAssets : generatedAssets))}
                                            isMusic={mode === 'music'}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Deploy confirmation modal — shown after upload completes */}
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
