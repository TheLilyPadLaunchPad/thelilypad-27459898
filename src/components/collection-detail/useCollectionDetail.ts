import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/providers/WalletProvider";
import { useChain } from "@/providers/ChainProvider";
import { useSolanaMint } from "@/hooks/useSolanaMint";
import { useMonadLaunch } from "@/hooks/useMonadLaunch";
import { initializeUmi } from "@/config/solana";
import { publicKey } from "@metaplex-foundation/umi";
import { fetchCandyMachine } from "@metaplex-foundation/mpl-core-candy-machine";
import { getMerkleProof } from "@/utils/merkle";
import { SupportedChain, CHAINS } from "@/config/chains";
import { isTestnet as isChainTestnet } from "@/lib/chainUtils";
import { Collection, Phase, AllowlistEntry } from "./types";
import { getBaseChain, isPhaseCurrentlyLive } from "./utils";

export function useCollectionDetail() {
    const { collectionId } = useParams();
    const navigate = useNavigate();
    const { network, isConnected, connect, balance, address } = useWallet();
    const { setChain } = useChain();
    const solanaMint = useSolanaMint();
    const monadLaunch = useMonadLaunch();

    // ── State ──────────────────────────────────────────────────────────────────
    const [collection, setCollection] = useState<Collection | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [mintQuantity, setMintQuantity] = useState(1);
    const [activePhase, setActivePhase] = useState<Phase | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [isAllowlistModalOpen, setIsAllowlistModalOpen] = useState(false);
    const [allowlistEntries, setAllowlistEntries] = useState<AllowlistEntry[]>([]);
    const [showRevealModal, setShowRevealModal] = useState(false);
    const [revealedNfts, setRevealedNfts] = useState<any[]>([]);
    const [revealTxHash, setRevealTxHash] = useState<string>("");
    const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
    const [isMinting, setIsMinting] = useState(false);
    const [mintTxHash, setMintTxHash] = useState<string | null>(null);
    const [isLivePolling, setIsLivePolling] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // ── Derived State ──────────────────────────────────────────────────────────
    const dbChainRaw = collection?.chain || collection?.blockchain || '';
    const collectionChain = getBaseChain(dbChainRaw);

    const chainConfig = CHAINS[collectionChain] || CHAINS.solana;
    const isSolana = collectionChain === 'solana';
    const isMonad = collectionChain === 'monad';

    const currency = chainConfig?.symbol || 'SOL';
    const collectionNetwork = chainConfig?.name || 'Solana';
    const isCollectionTestnet = isChainTestnet(dbChainRaw);
    const collectionExplorerUrl = chainConfig?.networks[isCollectionTestnet ? 'testnet' : 'mainnet']?.explorer || '';
    const isCreator = currentUserId && collection?.creator_id === currentUserId;
    const totalSupply = collection?.total_supply || 0;
    const liveSupply = collection?.minted || 0;
    const userBalance = balance ? parseFloat(balance) : 0;
    const phases = useMemo(() => {
        if (!collection?.phases || !Array.isArray(collection.phases)) return [];
        return collection.phases as unknown as Phase[];
    }, [collection]);

    const isLive = useMemo(() =>
        isPhaseCurrentlyLive(activePhase, collection?.status, !!collection?.contract_address),
        [activePhase, collection?.status, collection?.contract_address]
    );

    const isWhitelisted = useMemo(() => {
        if (!address || !allowlistEntries.length) return false;
        return allowlistEntries.some(e =>
            e.wallet_address?.toLowerCase() === address.toLowerCase() ||
            (e as any).walletAddress?.toLowerCase() === address.toLowerCase()
        );
    }, [address, allowlistEntries]);

    // ── Actions ────────────────────────────────────────────────────────────────
    const fetchCollection = useCallback(async () => {
        if (!collectionId) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from("collections")
                .select("*")
                .eq("id", collectionId)
                .maybeSingle();

            if (error) {
                console.error("Error fetching collection:", error);
                toast.error("Failed to load collection");
            } else if (data) {
                setCollection(data as unknown as Collection);
                const phasesData = data.phases as unknown as Phase[] | null;
                if (phasesData && Array.isArray(phasesData) && phasesData.length > 0) {
                    // Pick the phase whose time window contains "now" first;
                    // otherwise the next upcoming phase; otherwise the explicit
                    // active/public phase; otherwise the first phase.
                    const now = Date.now();
                    const inWindow = phasesData.find((p) => {
                        const s = p.startTime ? new Date(p.startTime).getTime() : -Infinity;
                        const e = p.endTime ? new Date(p.endTime).getTime() : Infinity;
                        return now >= s && now < e;
                    });
                    const upcoming = phasesData
                        .filter((p) => p.startTime && new Date(p.startTime).getTime() > now)
                        .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime())[0];
                    const explicit = phasesData.find((p) => p.isActive) || phasesData.find((p) => p.id === "public");
                    setActivePhase(inWindow || upcoming || explicit || phasesData[0]);
                } else if (data.contract_address) {
                    // Fallback: synthesize a default public phase so the mint button activates
                    // for deployed collections that have no phases configured in the DB.
                    const defaultPrice = String((data as any).mint_price ?? (data as any).price ?? 0);
                    setActivePhase({
                        id: "public",
                        name: "Public",
                        price: defaultPrice,
                        maxPerWallet: (data as any).max_per_wallet || 10,
                        supply: data.total_supply || 0,
                        isActive: true,
                        startTime: null,
                        endTime: null,
                        requiresAllowlist: false,
                        candyMachineAddress: data.contract_address,
                    });
                }
            } else {
                toast.error("Collection not found");
                navigate("/launchpad");
            }
        } catch (err) {
            console.error("Error:", err);
        } finally {
            setIsLoading(false);
        }
    }, [collectionId, navigate]);

    const loadAllowlist = useCallback(async () => {
        if (!collectionId || !activePhase?.requiresAllowlist) {
            setAllowlistEntries([]);
            return;
        }

        try {
            const { data } = await supabase
                .from("allowlist_entries")
                .select("wallet_address")
                .eq("collection_id", collectionId)
                .eq("phase_name", activePhase.id);

            if (data) {
                setAllowlistEntries(data as AllowlistEntry[]);
            }
        } catch (err) {
            console.error("Error loading allowlist:", err);
        }
    }, [collectionId, activePhase]);

    const handleRefreshSupply = async () => {
        setIsRefreshing(true);
        await fetchCollection();
        setIsRefreshing(false);
        toast.success("Supply updated");
    };

    const handleCopyAddress = () => {
        if (collection?.contract_address) {
            navigator.clipboard.writeText(collection.contract_address);
            setCopied(true);
            toast.success("Address copied");
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleConnectWallet = () => connect(undefined, collectionChain as any);

    const generateRandomAttributes = (quantity: number, currentMinted: number) => {
        return Array.from({ length: quantity }).map((_, i) => ({
            tokenId: currentMinted + i + 1,
            name: `${collection?.name} #${currentMinted + i + 1}`,
            image: collection?.image_url,
            attributes: [
                { trait_type: "Status", value: "Revealed!", rarity: 100 }
            ]
        }));
    };

    const performSolanaMint = async (
        cmAddress: string,
        standard: string,
        amount: number,
        phaseId: string,
        mintArgs?: any
    ) => {
        let lastHash = null;
        for (let i = 0; i < amount; i++) {
            const result = await solanaMint.mintFromCandyMachine(
                cmAddress,
                collection!.contract_address!,
                { phaseId, price: mintArgs?.price || 0, collectionId: collection!.id }
            );
            lastHash = result.signature;
            setMintTxHash(lastHash);
            if (amount > 1) {
                toast.info(`Minting ${i + 1}/${amount}...`);
            }
        }
        return lastHash;
    };

    const handleMint = async (quantityOverride?: number) => {
        const amount = quantityOverride || mintQuantity;
        if (!isConnected) {
            connect();
            return;
        }

        if (!collection?.contract_address) {
            toast.error("Collection not deployed yet — no contract address found");
            return;
        }

        if (!activePhase) {
            toast.error("No active mint phase configured for this collection");
            return;
        }

        setIsMinting(true);
        try {
            if (isSolana) {
                const mintArgs: any = {};
                if (activePhase!.requiresAllowlist) {
                    const { proof } = getMerkleProof(allowlistEntries as any, address!);
                    mintArgs.allowList = { proof };
                }

                const txHash = await performSolanaMint(
                    activePhase!.candyMachineAddress || collection.contract_address,
                    collection.solana_standard || 'core',
                    amount,
                    activePhase!.id,
                    mintArgs
                );

                if (txHash) {
                    setRevealedNfts(generateRandomAttributes(amount, collection.minted));
                    setRevealTxHash(txHash);
                    setShowRevealModal(true);
                    fetchCollection();
                    toast.success("Mint successful!");
                }
            } else if (isMonad) {
                toast.loading(`Minting your NFT on Monad...`, { id: 'monad-mint' });
                const result = await monadLaunch.mintNFT(
                    collection.contract_address!,
                    amount,
                    activePhase?.price?.toString()
                );

                if (result.success && result.address) {
                    const txHash = result.transactionHash || result.address;
                    setMintTxHash(txHash);
                    setRevealTxHash(txHash);
                    setRevealedNfts(generateRandomAttributes(amount, collection.minted));
                    setShowRevealModal(true);
                    fetchCollection();
                    toast.success("Minted!", { id: 'monad-mint' });
                } else {
                    toast.error(result.error || "Monad mint failed", { id: 'monad-mint' });
                }
            } else {
                toast.info(`${collectionNetwork} minting logic coming soon`);
            }
        } catch (err: any) {
            console.error("Mint failed:", err);
            toast.error("Mint failed", { description: err.message });
        } finally {
            setIsMinting(false);
        }
    };

    // ── Effects ────────────────────────────────────────────────────────────────

    // Auth session
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setCurrentUserId(session?.user?.id ?? null);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setCurrentUserId(session?.user?.id ?? null);
        });
        return () => subscription.unsubscribe();
    }, []);

    // Fetch initial data
    useEffect(() => {
        fetchCollection();
    }, [fetchCollection]);

    // Load allowlist
    useEffect(() => {
        loadAllowlist();
    }, [loadAllowlist]);

    // Sync global chain state when collection is loaded
    useEffect(() => {
        if (collectionChain) {
            setChain(collectionChain as SupportedChain);
        }
    }, [collectionChain, setChain]);

    // Supply Polling
    useEffect(() => {
        if (!collection || !collectionId || !isSolana || !collection.contract_address) return;

        const umi = initializeUmi(network);
        const pollSupply = async () => {
            try {
                const candyMachine = await fetchCandyMachine(umi, publicKey(collection.contract_address!));
                const itemsRedeemed = Number(candyMachine.itemsRedeemed ?? 0);
                if (collection.minted !== itemsRedeemed) {
                    setCollection(prev => prev ? { ...prev, minted: itemsRedeemed } : prev);
                    setLastUpdated(new Date());
                }
            } catch (err) {
                console.error("Polling error:", err);
            }
        };

        const interval = setInterval(pollSupply, 10000);
        pollSupply();
        setIsLivePolling(true);
        return () => {
            clearInterval(interval);
            setIsLivePolling(false);
        };
    }, [collectionId, collection?.contract_address, isSolana, network]);

    return {
        collection,
        isLoading,
        isConnected,
        mintQuantity,
        setMintQuantity,
        activePhase,
        setActivePhase,
        isRefreshing,
        copied,
        isEditMode,
        setIsEditMode,
        isPreviewMode,
        setIsPreviewMode,
        currentUserId,
        isAllowlistModalOpen,
        setIsAllowlistModalOpen,
        allowlistEntries,
        showRevealModal,
        setShowRevealModal,
        revealedNfts,
        revealTxHash,
        isDeployModalOpen,
        setIsDeployModalOpen,
        isMinting,
        mintTxHash,
        isLivePolling,
        lastUpdated,
        collectionChain,
        collectionNetwork,
        isCollectionTestnet,
        collectionExplorerUrl,
        currency,
        isCreator,
        address,
        isSolana,
        isMonad,
        totalSupply,
        liveSupply,
        userBalance,
        phases,
        isLive,
        isWhitelisted,
        fetchCollection,
        handleRefreshSupply,
        handleCopyAddress,
        handleConnectWallet,
        handleMint,
    };
}
