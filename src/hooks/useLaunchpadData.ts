import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSubscription } from "./useRealtimeSubscription";
import { toast } from "sonner";
import { addDays } from "date-fns";
import { SupportedChain, getDbChainValues } from "@/config/chains";

export interface DraftCollection {
  name: string;
  symbol: string;
  description: string;
  totalSupply: string;
  royalty: string;
  currentStep: number;
  savedAt: string;
  layers?: any[];
  phases?: any[];
  imageUrl?: string;
  oneOfOneArtworks?: any[];
}

export interface Collection {
  id: string;
  name: string;
  image_url: string | null;
  banner_url: string | null;
  description: string | null;
  creator_address: string;
  creator_id: string;
  total_supply: number;
  minted: number;
  status: string;
  phases: unknown;
  royalty_percent: number;
  created_at: string;
  contract_address: string | null;
  collection_type: string | null;
  layers_metadata: unknown;
  artworks_metadata: unknown;
  social_twitter: string | null;
  social_discord: string | null;
  social_website: string | null;
  chain?: string;
}

// Support all chain types
export function useLaunchpadData(selectedChain: SupportedChain = "solana") {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftCollection | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get chain filters based on selected chain
  const chainFilters = useMemo(() => getDbChainValues(selectedChain), [selectedChain]);

  // Get current user
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Query for collections
  const collectionsQuery = useQuery({
    queryKey: ["launchpad-collections", selectedChain],
    queryFn: async () => {
      // Determine chain filters
      let query = supabase
        .from("collections")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      // Apply chain filter
      query = query.in("chain", chainFilters);

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching collections:", error);
        throw error;
      }
      return data || [];
    },
    staleTime: 30 * 1000,
  });

  // Realtime subscription
  useRealtimeSubscription({
    table: "collections",
    event: "*",
    onUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ["launchpad-collections"] });
    },
  });

  // Draft management
  const loadDraft = useCallback(() => {
    const savedDraft = localStorage.getItem("collection-draft");
    if (savedDraft) {
      try {
        setDraft(JSON.parse(savedDraft));
      } catch (e) {
        console.error("Error loading draft:", e);
        setDraft(null);
      }
    } else {
      setDraft(null);
    }
  }, []);

  const deleteDraft = useCallback(() => {
    localStorage.removeItem("collection-draft");
    setDraft(null);
    toast.success("Draft deleted");
  }, []);

  // Load draft on mount
  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  // Delete collection mutation
  const deleteCollectionMutation = useMutation({
    mutationFn: async (collectionId: string) => {
      const scheduledDeleteAt = addDays(new Date(), 7);

      const { error } = await supabase
        .from("collections")
        .update({
          deleted_at: new Date().toISOString(),
          scheduled_permanent_delete_at: scheduledDeleteAt.toISOString(),
        })
        .eq("id", collectionId);

      if (error) throw error;
      return collectionId;
    },
    onSuccess: (collectionId) => {
      queryClient.invalidateQueries({ queryKey: ["launchpad-collections"] });
      const collection = collectionsQuery.data?.find((c) => c.id === collectionId);
      toast.success(`"${collection?.name || "Collection"}" moved to trash`, {
        description: "Will be permanently deleted in 7 days",
      });
    },
    onError: (error: any) => {
      console.error("Error deleting collection:", error);
      toast.error(error.message || "Failed to delete collection");
    },
  });

  // Restore collection mutation
  const restoreCollectionMutation = useMutation({
    mutationFn: async (collectionId: string) => {
      const { error } = await supabase
        .from("collections")
        .update({
          deleted_at: null,
          scheduled_permanent_delete_at: null,
        })
        .eq("id", collectionId);

      if (error) throw error;
      return collectionId;
    },
    onSuccess: (collectionId) => {
      queryClient.invalidateQueries({ queryKey: ["launchpad-collections"] });
      // We need to fetch the name again or find it, but restoring works
      toast.success("Collection restored");
    },
    onError: () => {
      toast.error("Failed to restore collection");
    },
  });

  // Filter collections by status
  const getFilteredCollections = useCallback(
    (activeTab: string) => {
      const collections = collectionsQuery.data || [];
      if (activeTab === "all") return collections;
      if (activeTab === "drafts") return collections.filter((c) => c.status === "upcoming" || c.status === "draft" || c.status === "deploy_failed");
      if (activeTab === "live") return collections.filter((c) => c.status === "live" || c.status === "active" || c.status === "minted");
      return collections.filter((c) => c.status === activeTab);
    },
    [collectionsQuery.data]
  );

  return {
    collections: collectionsQuery.data ?? [],
    isLoading: collectionsQuery.isLoading,
    isError: collectionsQuery.isError,
    error: collectionsQuery.error,
    refetch: collectionsQuery.refetch,
    draft,
    loadDraft,
    deleteDraft,
    currentUserId,
    deleteCollection: deleteCollectionMutation.mutate,
    isDeleting: deleteCollectionMutation.isPending,
    restoreCollection: restoreCollectionMutation.mutate,
    getFilteredCollections,
  };
}

// Helper to get price from phases
export function getCollectionPrice(collection: Collection): string {
  const phases = Array.isArray(collection.phases) ? (collection.phases as any[]) : [];
  if (phases.length === 0) return "TBA";
  const publicPhase = phases.find((p) => p.id === "public") || phases[0];
  if (!publicPhase?.price) return "Free";
  // Determine symbol from chain field
  const chainSymbol = collection.chain?.startsWith("monad") ? "MON" : "SOL";
  return `${publicPhase.price} ${chainSymbol}`;
}

// Helper to get phase names
export function getPhaseNames(collection: Collection): string[] {
  const phases = Array.isArray(collection.phases) ? (collection.phases as any[]) : [];
  if (phases.length === 0) return ["public"];
  return phases.map((p) => p.id || p.name?.toLowerCase() || "public");
}

// Helper to check if collection has artwork
export function hasArtwork(collection: Collection): boolean {
  const type = collection.collection_type || "generative";
  if (type === "generative") {
    const layers = Array.isArray(collection.layers_metadata) ? (collection.layers_metadata as any[]) : null;
    return layers && layers.length > 0 && layers.some((l) => l.traits && Array.isArray(l.traits) && l.traits.length > 0);
  } else {
    const artworks = Array.isArray(collection.artworks_metadata) ? (collection.artworks_metadata as any[]) : null;
    return artworks && artworks.length > 0;
  }
}

// Helper to check if collection has valid phases
export function hasValidPhases(collection: Collection): boolean {
  const phases = Array.isArray(collection.phases) ? (collection.phases as any[]) : [];
  return phases.length > 0 && phases.some((p) =>
    typeof p.price === 'number' &&
    typeof p.maxPerWallet === 'number' &&
    p.maxPerWallet > 0
  );
}

// Helper to get collection progress
export function getCollectionProgress(collection: Collection) {
  const steps = [
    { name: "Basic Info", complete: !!(collection.name && collection.total_supply > 0) },
    { name: "Cover Image", complete: !!collection.image_url },
    { name: "Artwork/Layers", complete: hasArtwork(collection) },
    { name: "Mint Phases", complete: hasValidPhases(collection) },
    { name: "Deploy Contract", complete: !!collection.contract_address },
  ];

  const completedSteps = steps.filter((s) => s.complete).length;
  const percentage = Math.round((completedSteps / steps.length) * 100);
  const nextStep = steps.find((s) => !s.complete);

  return { steps, completedSteps, percentage, nextStep };
}

// Helper to get health status
export function getHealthStatus(collection: Collection) {
  const progress = getCollectionProgress(collection);
  const isDeployed = !!collection.contract_address;

  if (isDeployed && collection.status === "live") {
    return { status: "healthy", label: "Live & Active", color: "text-green-500" };
  }
  if (isDeployed) {
    return { status: "deployed", label: "Deployed", color: "text-blue-500" };
  }
  if (progress.percentage >= 80) {
    return { status: "ready", label: "Ready to Deploy", color: "text-primary" };
  }
  if (progress.percentage >= 40) {
    return { status: "in-progress", label: "Setup In Progress", color: "text-yellow-500" };
  }
  return { status: "needs-setup", label: "Needs Setup", color: "text-orange-500" };
}

// Helper to get step label
export function getStepLabel(step: number): string {
  const steps = ["Basic Info", "Mint Phases", "Layer Setup", "Trait Rules", "Review"];
  return steps[step] || "Unknown";
}

// Helper to get draft progress
export function getDraftProgress(step: number): number {
  return Math.round(((step + 1) / 5) * 100);
}
