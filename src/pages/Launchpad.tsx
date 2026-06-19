import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { MPLHybridLanding } from "@/components/launchpad/MPLHybridLanding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Rocket, Clock, CheckCircle, Sparkles, Loader2, FileEdit, Trash2,
  Image as ImageIcon, LayoutGrid, Check, Pencil, Lock, AlertCircle, ArrowRight,
  Layers, Globe, ChevronRight, Palette, Music, BarChart3, ShoppingCart,
  TrendingUp, Repeat,
} from "lucide-react";
import { HomepageFeaturedCollections } from "@/components/sections/HomepageFeaturedCollections";
import { ImportCollectionModal } from "@/components/launchpad/ImportCollectionModal";
import { CollectionCsvImportModal } from "@/components/launchpad/CollectionCsvImportModal";
import { RecentSalesTable } from "@/components/launchpad/RecentSalesTable";
import { BuybackProgramBadge } from "@/components/BuybackProgramBadge";
import { MetaplexBadge, MetaplexHexIcon } from "@/components/MetaplexBadge";
import { ChainIcon } from "@/components/launchpad/ChainSelector";
import { useWallet } from "@/providers/WalletProvider";
import { supabase } from "@/integrations/supabase/client";
import lilypadLogo from "@/assets/lilypad-logo.png";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useSEO } from "@/hooks/useSEO";
import { useLaunchpadData, getCollectionPrice, getCollectionProgress, getHealthStatus, getStepLabel, getPhaseNames } from "@/hooks/useLaunchpadData";
import { useLaunchpadStats } from "@/hooks/useLaunchpadStats";
import { useBuybackProgram } from "@/hooks/useBuybackProgram";
import { SupportedChain, CHAINS, getStoredChain, setStoredChain } from "@/config/chains";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useIpfs } from "@/providers/IpfsProvider";

// ── Status helpers ────────────────────────────────────────────────────────────
const statusColors = {
  live: "bg-green-500/20 text-green-400 border-green-500/30",
  upcoming: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ended: "bg-muted text-muted-foreground border-border",
};
const statusIcons = { live: Sparkles, upcoming: Clock, ended: CheckCircle };

// ── Chain definitions shown in the sidebar ───────────────────────────────────
interface ChainEntry {
  id: SupportedChain;
  label: string;
  description: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "outline";
}

const ALL_CHAIN_ENTRIES: ChainEntry[] = [
  { id: "solana", label: "Solana", description: "Metaplex Core & Candy Machine", badge: "Live", badgeVariant: "default" },
  { id: "monad", label: "Monad", description: "EVM-Compatible Layer 1", badge: "Live", badgeVariant: "default" },
];
const CHAIN_ENTRIES = ALL_CHAIN_ENTRIES;

// ── Primary collection type cards ─────────────────────────────────────────────
interface CollectionTypeTile {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tag?: string;
  highlight?: boolean;
  chains: SupportedChain[];
}

const PRIMARY_TYPES: CollectionTypeTile[] = [
  {
    id: "generative",
    title: "Generative / PFP Collection",
    description: "Upload pre-made assets or import trait layers for procedural generation with custom rarity weights.",
    icon: Layers,
    highlight: true,
    chains: ["solana", "monad", "xrpl"],
    tag: "Most Popular",
  },
  {
    id: "1of1",
    title: "1-of-1 Art",
    description: "Upload individual artworks with unique metadata. Direct RAW minting to your wallet.",
    icon: ImageIcon,
    chains: ["solana", "monad", "xrpl"],
  },
  {
    id: "music",
    title: "Music NFTs",
    description: "Launch audio collectibles with tracks, cover art, and rich metadata (genre, artist, BPM).",
    icon: Music,
    chains: ["solana"],
    tag: "Audio",
  },
];

const SECONDARY_TYPES: CollectionTypeTile[] = [
  {
    id: "art-generator",
    title: "Art Generator (ZIP)",
    description: "No-code tool: generate high-res assets with metadata and download as a ZIP.",
    icon: Palette,
    chains: ["solana", "monad", "xrpl"],
    tag: "No-Code",
  },
  {
    id: "hybrid-404",
    title: "MPL-Hybrid (404)",
    description: "Create an escrow to swap between fungible tokens and NFTs instantly.",
    icon: Repeat,
    highlight: true,
    chains: ["solana"],
    tag: "MPL-Hybrid",
  },
];

// ── Filter tabs ───────────────────────────────────────────────────────────────
const FILTER_TABS = [
  { value: "all", label: "All", icon: LayoutGrid },
  { value: "live", label: "Live", icon: Sparkles },
  { value: "upcoming", label: "Upcoming", icon: Clock },
  { value: "ended", label: "Ended", icon: CheckCircle },
  { value: "drafts", label: "Drafts", icon: FileEdit },
];

// ── Draft finder (reads from the new lilypad_draft_* keys) ────────────────────
const DRAFT_PREFIX = 'lilypad_draft_';
const DRAFT_TYPES = ['generative', 'music', 'advanced', 'basic', '1of1'];

function findLatestDraft(chain: string): { key: string; type: string; data: any } | null {
  let best: { key: string; type: string; data: any; ts: number } | null = null;
  for (const type of DRAFT_TYPES) {
    const key = `${DRAFT_PREFIX}${chain}_${type}`;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      const ts = new Date(data.savedAt || 0).getTime();
      if (!best || ts > best.ts) {
        best = { key, type, data, ts };
      }
    } catch { /* ignore corrupt */ }
  }
  return best ? { key: best.key, type: best.type, data: best.data } : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function Launchpad() {
  const navigate = useNavigate();
  const { network, isConnected, address } = useWallet();
  const { resolveToGateway } = useIpfs();

  const [selectedChain, setSelectedChain] = useState<SupportedChain>(getStoredChain);
  const currentChain = CHAINS[selectedChain];
  const isTestnet = network === "testnet";

  const [activeTab, setActiveTab] = useState("all");
  const [deleteCollectionId, setDeleteCollectionId] = useState<string | null>(null);
  const [showHybridForm, setShowHybridForm] = useState(false);

  const {
    collections, isLoading,
    currentUserId, deleteCollection, isDeleting, restoreCollection,
    getFilteredCollections, refetch,
  } = useLaunchpadData(selectedChain);

  const [localDraft, setLocalDraft] = useState<{ key: string; type: string; data: any } | null>(null);

  const { stats, isLoading: statsLoading } = useLaunchpadStats();
  const { isInProgram } = useBuybackProgram();

  useSEO({
    title: `NFT Launchpad – ${currentChain.name} | The Lily Pad`,
    description: `Launch your NFT collection on ${currentChain.name}. Create generative art, set mint phases, manage allowlists, and deploy.`,
  });

  const handleChainChange = (chain: SupportedChain) => {
    setStoredChain(chain);
    setSelectedChain(chain);
  };

  const handleDeleteCollection = (collectionId: string) => {
    deleteCollection(collectionId);
    setDeleteCollectionId(null);
  };

  const continueDraft = () => {
    if (selectedChain === 'xrpl') {
      navigate('/launchpad/xrpl-generator');
      return;
    }
    if (localDraft) {
      navigate(`/launchpad/create/${selectedChain}/${localDraft.type || 'generative'}`);
    } else {
      navigate(`/launchpad/create/${selectedChain}`);
    }
  };

  useEffect(() => {
    // One-time migration: old "collection-draft" → new keyed format
    const oldRaw = localStorage.getItem('collection-draft');
    if (oldRaw) {
      try {
        const old = JSON.parse(oldRaw);
        const newKey = `${DRAFT_PREFIX}${selectedChain}_generative`;
        if (!localStorage.getItem(newKey)) {
          const migrated = {
            name: old.name || '',
            symbol: old.symbol || '',
            description: old.description || '',
            royaltyPercent: parseFloat(old.royalty) || 5,
            targetSupply: parseInt(old.totalSupply) || 100,
            mode: (old.layers?.length > 0 ? 'advanced' : 'basic'),
            currentStep: old.currentStep || 0,
            treasuryWallet: '',
            phases: old.phases || [],
            savedAt: old.savedAt || new Date().toISOString(),
          };
          localStorage.setItem(newKey, JSON.stringify(migrated));
        }
        localStorage.removeItem('collection-draft');
      } catch {
        localStorage.removeItem('collection-draft');
      }
    }
    setLocalDraft(findLatestDraft(selectedChain));
  }, [selectedChain]);

  const filteredCollections = getFilteredCollections(activeTab);

  const getProgress = (step: number) => Math.round(((step + 1) / 3) * 100);

  // Tiles for the selected chain
  const primaryTiles = PRIMARY_TYPES.filter((t) => t.chains.includes(selectedChain));
  const secondaryTiles = SECONDARY_TYPES.filter((t) => t.chains.includes(selectedChain));

  const handleTileClick = (tile: CollectionTypeTile) => {
    // XRPL doesn't use Metaplex/Candy Machine — route to dedicated XLS-20 flows.
    if (selectedChain === 'xrpl') {
      if (tile.id === 'generative' || tile.id === 'art-generator') {
        navigate('/launchpad/xrpl-trait-generator');
      } else {
        navigate('/launchpad/xrpl-generator');
      }
      return;
    }
    if (tile.id === "hybrid-404") {
      setShowHybridForm(true);
      return;
    }
    if (tile.id === "art-generator") {
      navigate(`/launchpad/art-generator`);
      return;
    }
    // Navigate to the unified creation page — type is picked inline
    navigate(`/launchpad/create/${selectedChain}/${tile.id}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 pt-24 pb-16">

        {/* ── Page Header ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-10">
          <img src={lilypadLogo} alt="Lily Launchpad" className="w-14 h-14 rounded-xl object-contain bg-primary/10 p-2" />
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Lily Launchpad</h1>
              <MetaplexBadge variant="inline" />
            </div>
            <p className="text-muted-foreground mt-0.5">Launch your NFT collection on Solana or Monad — 3-step wizard, no friction.</p>
          </div>
        </div>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Total Collections", value: statsLoading ? null : stats.totalCollections.toLocaleString(), icon: LayoutGrid },
            { label: "Live Now", value: statsLoading ? null : stats.liveNow.toString(), icon: Sparkles, pulse: stats.liveNow > 0 },
            { label: "NFTs Minted", value: statsLoading ? null : stats.nftsMinted >= 1000 ? `${(stats.nftsMinted / 1000).toFixed(1)}K` : stats.nftsMinted.toLocaleString(), icon: TrendingUp },
            { label: "Volume (SOL Equiv)", value: statsLoading ? null : `${stats.totalVolume >= 1000 ? `${(stats.totalVolume / 1000).toFixed(1)}K` : stats.totalVolume}`, icon: BarChart3 },
          ].map(({ label, value, icon: Icon, pulse }) => (
            <Card key={label} className="border-border/60">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-1">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  {pulse && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                </div>
                {value === null ? (
                  <Skeleton className="h-7 w-20 mb-1" />
                ) : (
                  <div className="text-2xl font-bold">{value}</div>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Main two-column layout ─────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-8">

          {/* ── Sidebar: Chain selector ─────────────────────────────────── */}
          <aside className="lg:w-56 shrink-0 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1 mb-3">Blockchain</p>
            {CHAIN_ENTRIES.map((entry) => {
              const active = selectedChain === entry.id;
              return (
                <button
                  key={entry.id}
                  onClick={() => handleChainChange(entry.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-all duration-150",
                    active
                      ? "border-primary/60 bg-primary/8 shadow-sm"
                      : "border-border hover:border-border/80 hover:bg-muted/50",
                  )}
                >
                  <ChainIcon chain={entry.id} className="w-5 h-5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", active && "text-primary")}>{entry.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate leading-tight">{entry.description}</p>
                  </div>
                  {entry.badge && (
                    <Badge
                      variant={entry.badgeVariant}
                      className={cn("text-[9px] h-4 px-1.5 shrink-0",
                        entry.badgeVariant === "default" && "bg-primary/20 text-primary border-primary/30 border"
                      )}
                    >
                      {entry.badge}
                    </Badge>
                  )}
                </button>
              );
            })}

            <div className="pt-4 border-t border-border/40">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1 mb-3">Quick Links</p>
              <button onClick={() => navigate("/raffles")} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
                <Sparkles className="w-4 h-4 text-amber-400" />
                1/1 &amp; Editions Studio
              </button>
              <button onClick={() => navigate("/marketplace")} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
                <ShoppingCart className="w-4 h-4" />
                Marketplace
              </button>
              <button onClick={() => navigate("/ready-trade")} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
                <TrendingUp className="w-4 h-4" />
                Ready Trade
              </button>
              <a href="https://github.com/solana-foundation/awesome-solana-ai" target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
                <Sparkles className="w-4 h-4" />
                Solana AI Tools
              </a>
            </div>
          </aside>

          {/* ── Right panel ─────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-10">

            {/* ── MPL-404 Hybrid Escrow Form (full-page overlay in panel) ── */}
            {showHybridForm ? (
                <MPLHybridLanding onClose={() => setShowHybridForm(false)} />
            ) : (
              <>
                {/* ── Chain header + Create button ───────────────────────────── */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <ChainIcon chain={selectedChain} className="w-7 h-7" />
                    <div>
                      <h2 className="text-xl font-bold">{currentChain.name}</h2>
                      <p className="text-xs text-muted-foreground">{isTestnet ? "Testnet Mode" : "Mainnet"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ImportCollectionModal
                      chain={selectedChain}
                      onSuccess={() => refetch()}
                    />
                    <CollectionCsvImportModal
                      chain={selectedChain}
                      onSuccess={() => refetch()}
                    />
                    <Button
                      size="default"
                      onClick={() => selectedChain === 'xrpl'
                        ? navigate('/launchpad/xrpl-generator')
                        : navigate(`/launchpad/create/${selectedChain}`)}
                      className="gap-2 shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      New Collection
                    </Button>
                  </div>
                </div>

                {/* ── Primary collection type cards ──────────────────────────── */}
                <AnimatePresence mode="wait">
                  <motion.section
                    key={selectedChain}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Start Building</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                      {primaryTiles.map((tile) => {
                        const Icon = tile.icon;
                        return (
                          <button
                            key={tile.id}
                            onClick={() => handleTileClick(tile)}
                            className={cn(
                              "group relative text-left p-6 rounded-2xl border transition-all duration-150",
                              "border-primary/30 bg-gradient-to-br from-primary/5 to-transparent hover:border-primary/60 hover:from-primary/10 hover:shadow-lg hover:shadow-primary/5"
                            )}
                          >
                            {tile.tag && (
                              <Badge className="absolute top-3 right-3 text-[9px] h-4 px-1.5 bg-primary/15 text-primary border-primary/30 border">
                                {tile.tag}
                              </Badge>
                            )}
                            <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center mb-4">
                              <Icon className="w-5.5 h-5.5 text-primary" />
                            </div>
                            <p className="font-bold text-sm mb-1.5">{tile.title}</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{tile.description}</p>
                            <div className="flex items-center gap-1 mt-4 text-xs font-semibold text-primary transition-colors">
                              <span>Create</span>
                              <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Secondary tools */}
                    {secondaryTiles.length > 0 && (
                      <>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">More Tools</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {secondaryTiles.map((tile) => {
                            const Icon = tile.icon;
                            return (
                              <button
                                key={tile.id}
                                onClick={() => handleTileClick(tile)}
                                className="group flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-muted/30 transition-all text-left"
                              >
                                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                  <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-sm">{tile.title}</p>
                                  <p className="text-[11px] text-muted-foreground leading-relaxed">{tile.description}</p>
                                </div>
                                {tile.tag && <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">{tile.tag}</Badge>}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </motion.section>
                </AnimatePresence>

                {/* ── Draft resume banner ────────────────────────────────────── */}
                {localDraft && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                        <ImageIcon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{localDraft.data.name || "Untitled Draft"}</p>
                        <p className="text-xs text-muted-foreground">
                          Saved {localDraft.data.savedAt ? formatDistanceToNow(new Date(localDraft.data.savedAt), { addSuffix: true }) : "recently"}
                          · Step {Math.min((localDraft.data.currentStep ?? 0) + 1, 3)}
                        </p>
                        <div className="w-full bg-muted rounded-full h-1 mt-2">
                          <div className="bg-primary h-1 rounded-full" style={{ width: `${getProgress(localDraft.data.currentStep ?? 0)}%` }} />
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" onClick={continueDraft} className="gap-1.5">
                          <FileEdit className="w-3.5 h-3.5" />
                          Resume
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          if (localDraft) localStorage.removeItem(localDraft.key);
                          setLocalDraft(null);
                          toast.success("Draft deleted");
                        }} className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ── Featured collections ────────────────────────────────────── */}
                <section>
                  <HomepageFeaturedCollections />
                </section>

                {/* ── Recent Sales ───────────────────────────────────────────── */}
                <section>
                  <RecentSalesTable />
                </section>

                {/* ── Collections list ───────────────────────────────────────── */}
                <section>
                  {/* Filter tabs */}
                  <div className="flex items-center gap-1 mb-5 flex-wrap">
                    {FILTER_TABS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setActiveTab(value)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                          activeTab === value
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                        {value === "drafts" && localDraft && (
                          <Badge variant="secondary" className="h-4 px-1 text-[9px]">1</Badge>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Drafts tab */}
                  {activeTab === "drafts" && !localDraft && (
                    <div className="text-center py-16 border border-dashed rounded-xl">
                      <FileEdit className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="font-medium mb-1">No drafts saved</p>
                      <p className="text-sm text-muted-foreground">Start a collection and your progress will auto-save here.</p>
                    </div>
                  )}

                  {/* Collection grid */}
                  {activeTab !== "drafts" && (
                    isLoading
                      ? <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
                      : filteredCollections.length === 0
                        ? (
                          <div className="text-center py-16 border border-dashed rounded-xl">
                            <Rocket className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                            <p className="font-medium mb-1">No collections yet</p>
                            <p className="text-sm text-muted-foreground mb-5">Be the first to launch!</p>
                            <Button onClick={() => selectedChain === 'xrpl' ? navigate('/launchpad/xrpl-generator') : navigate(`/launchpad/create/${selectedChain}`)} size="sm">
                              <Plus className="w-4 h-4 mr-1.5" />
                              Create Collection
                            </Button>
                          </div>
                        )
                        : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                            {filteredCollections.map((collection) => {
                              const StatusIcon = statusIcons[collection.status as keyof typeof statusIcons] ?? Sparkles;
                              const isOwner = !!(
                                (currentUserId && collection.creator_id === currentUserId) ||
                                (address && collection.creator_address && collection.creator_address === address)
                              );
                              const isDeployed = !!collection.contract_address;
                              const canEdit = isOwner && !isDeployed;
                              const progress = getCollectionProgress(collection);
                              const health = getHealthStatus(collection);

                              return (
                                <Card
                                  key={collection.id}
                                  className={cn(
                                    "overflow-hidden hover:border-primary/40 transition-all cursor-pointer group",
                                    canEdit && "border-primary/20"
                                  )}
                                  onClick={() => navigate(`/launchpad/${collection.id}`)}
                                >
                                  <div className="aspect-square relative overflow-hidden bg-muted">
                                    {collection.image_url
                                      ? <img src={resolveToGateway(collection.image_url)} alt={collection.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                      : <div className="w-full h-full flex items-center justify-center"><Rocket className="w-10 h-10 text-muted-foreground" /></div>
                                    }
                                    <div className="absolute top-2.5 right-2.5 flex gap-1.5 flex-wrap justify-end">
                                      <Badge variant="secondary" className="bg-black/50 text-white backdrop-blur-md border-white/10 h-5 text-[10px]">
                                        <ChainIcon chain={selectedChain} className="w-2.5 h-2.5 mr-1" />
                                        {currentChain.symbol}
                                        {selectedChain === 'solana' && <MetaplexHexIcon className="ml-1" />}
                                      </Badge>
                                      {canEdit && (
                                        <>
                                          <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 h-5 text-[10px]">
                                            <Pencil className="w-2.5 h-2.5 mr-1" />
                                            Draft
                                          </Badge>
                                          <button
                                            className="h-5 w-5 flex items-center justify-center rounded bg-destructive/20 text-destructive border border-destructive/30 hover:bg-destructive/40 transition-colors"
                                            onClick={(e) => { e.stopPropagation(); setDeleteCollectionId(collection.id); }}
                                          >
                                            <Trash2 className="w-2.5 h-2.5" />
                                          </button>
                                        </>
                                      )}
                                      {isOwner && isDeployed && (
                                        <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 h-5 text-[10px]">
                                          <Lock className="w-2.5 h-2.5 mr-1" />
                                          Deployed
                                        </Badge>
                                      )}
                                    </div>
                                    <Badge variant="outline" className={`absolute top-2.5 left-2.5 h-5 text-[10px] ${statusColors[collection.status as keyof typeof statusColors]}`}>
                                      <StatusIcon className="w-2.5 h-2.5 mr-1" />
                                      {collection.status ? (collection.status.charAt(0).toUpperCase() + collection.status.slice(1)) : "Unknown"}
                                    </Badge>
                                  </div>

                                  <CardHeader className="pb-2 pt-4 px-4">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <CardTitle className="text-base leading-tight">{collection.name}</CardTitle>
                                          {isInProgram(collection.id) && <BuybackProgramBadge />}
                                        </div>
                                        <CardDescription className="text-xs mt-0.5">
                                          by {collection.creator_address ? `${collection.creator_address.slice(0, 6)}…${collection.creator_address.slice(-4)}` : "Anonymous"}
                                        </CardDescription>
                                      </div>
                                      {isOwner && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger>
                                              <Badge variant="outline" className={`text-[9px] px-1.5 h-5 ${health.color} border-current/30 bg-current/10`}>
                                                {progress.percentage}%
                                              </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent side="left" className="max-w-[180px]">
                                              <p className="font-medium mb-1">{health.label}</p>
                                              <p className="text-xs text-muted-foreground">{progress.completedSteps}/{progress.steps.length} steps</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                    </div>
                                  </CardHeader>

                                  <CardContent className="px-4 pb-4 space-y-2.5">
                                    {isOwner && !isDeployed && (
                                      <div>
                                        <Progress value={progress.percentage} className="h-1" />
                                        {progress.nextStep && (
                                          <p className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                                            <ArrowRight className="w-2.5 h-2.5 text-primary" />
                                            Next: {progress.nextStep.name}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    {isDeployed && (
                                      <div>
                                        <div className="flex justify-between text-xs mb-1">
                                          <span className="text-muted-foreground">Minted</span>
                                          <span className="font-medium">{collection.minted} / {collection.total_supply}</span>
                                        </div>
                                        <div className="w-full bg-muted rounded-full h-1">
                                          <div className="bg-primary h-1 rounded-full" style={{ width: `${collection.total_supply > 0 ? (collection.minted / collection.total_supply) * 100 : 0}%` }} />
                                        </div>
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-muted-foreground">Price</span>
                                      <span className="font-medium">{getCollectionPrice(collection)}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {getPhaseNames(collection).map((phase) => (
                                        <Badge key={phase} variant="secondary" className="text-[10px] h-4 px-1.5">{phase}</Badge>
                                      ))}
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        )
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </main>

      {/* ── Delete Dialog ───────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteCollectionId} onOpenChange={(open) => !open && setDeleteCollectionId(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Delete Collection?
            </AlertDialogTitle>
          </AlertDialogHeader>
          {(() => {
            const c = collections.find((x) => x.id === deleteCollectionId);
            if (!c) return null;
            return (
              <div className="flex gap-4 p-4 bg-muted/50 rounded-lg border">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                  {c.image_url ? <img src={resolveToGateway(c.image_url)} alt={c.name} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full"><ImageIcon className="w-5 h-5 text-muted-foreground" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.total_supply} items · {c.status}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Created {c.created_at && !isNaN(new Date(c.created_at).getTime()) ? formatDistanceToNow(new Date(c.created_at)) : "some time"} ago</p>
                </div>
              </div>
            );
          })()}
          <AlertDialogDescription>
            This collection will be moved to trash and <strong>permanently deleted in 7 days</strong>.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCollectionId && handleDeleteCollection(deleteCollectionId)}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting…</> : <><Trash2 className="w-4 h-4 mr-2" />Move to Trash</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
