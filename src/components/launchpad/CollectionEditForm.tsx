import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Save,
  X,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  Upload,
  Image as ImageIcon,
  Twitter,
  MessageCircle,
  Globe,
  Send,
  Gem,
  Copy,
  Shuffle,
  Layers,
  FileText,
  Clock,
  Palette,
  Info,
  Sparkles,
  Database,
  Cloud
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { LayerManager, Layer } from "./LayerManager";
import { TraitRulesManager, TraitRule } from "./TraitRulesManager";
import { GenerationPreview } from "./GenerationPreview";
import { ArtworkUploader, ArtworkItem } from "./ArtworkUploader";
import { uploadToArweave } from "@/integrations/irys/client";
import { useWallet } from "@/providers/WalletProvider";

interface Phase {
  id: string;
  name: string;
  price: string;
  maxPerWallet: number;
  supply: number;
  minted?: number;
  isActive?: boolean;
  startTime: string | null;
  endTime: string | null;
  requiresAllowlist: boolean;
}

type CollectionType = "generative" | "one_of_one" | "editions";

interface Collection {
  id: string;
  name: string;
  symbol: string;
  description: string | null;
  image_url: string | null;
  banner_url: string | null;
  unrevealed_image_url: string | null;
  is_revealed: boolean;
  creator_address: string;
  creator_id: string;
  total_supply: number;
  minted: number;
  royalty_percent: number;
  status: string;
  phases: unknown;
  contract_address: string | null;
  created_at: string;
  social_twitter: string | null;
  social_discord: string | null;
  social_website: string | null;
  social_telegram: string | null;
  ipfs_base_cid?: string | null;
  collection_type?: string;
  layers_metadata?: unknown;
  trait_rules?: unknown;
  artworks_metadata?: unknown;
  chain?: string;
}

interface CollectionEditFormProps {
  collection: Collection;
  onSave: () => void;
  onCancel: () => void;
}

const collectionSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  symbol: z.string().trim().min(1, "Symbol is required").max(10, "Symbol must be 10 characters or less").toUpperCase(),
  description: z.string().max(1000, "Description must be less than 1000 characters").optional(),
  image_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  total_supply: z.number().min(1, "Supply must be at least 1").max(100000, "Supply cannot exceed 100,000"),
  royalty_percent: z.number().min(0, "Royalty cannot be negative").max(15, "Royalty cannot exceed 15%"),
  status: z.enum(["draft", "upcoming", "live", "ended"]),
});

export function CollectionEditForm({ collection, onSave, onCancel }: CollectionEditFormProps) {
  const navigate = useNavigate();
  const { network, getSolanaProvider } = useWallet();
  const [isInitialized, setIsInitialized] = useState(false);

  // Derive chain symbol from collection's chain
  const chainSymbol = collection.chain === 'monad' ? 'MON' : 'SOL';
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isDraggingBanner, setIsDraggingBanner] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  // Form state
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [unrevealedUrl, setUnrevealedUrl] = useState("");
  const [unrevealedFile, setUnrevealedFile] = useState<File | null>(null);
  const [unrevealedPreview, setUnrevealedPreview] = useState<string | null>(null);
  const [isDraggingUnrevealed, setIsDraggingUnrevealed] = useState(false);
  const [totalSupply, setTotalSupply] = useState(0);
  const [royaltyPercent, setRoyaltyPercent] = useState(0);
  const [status, setStatus] = useState("upcoming");
  const [ipfsBaseCid, setIpfsBaseCid] = useState("");

  // Social links
  const [socialTwitter, setSocialTwitter] = useState("");
  const [socialDiscord, setSocialDiscord] = useState("");
  const [socialWebsite, setSocialWebsite] = useState("");
  const [socialTelegram, setSocialTelegram] = useState("");

  // Collection type
  const [collectionType, setCollectionType] = useState<CollectionType>("generative");

  // Layers and traits for generative collections
  const [layers, setLayers] = useState<Layer[]>([]);
  const [traitRules, setTraitRules] = useState<TraitRule[]>([]);

  // Artwork for 1-of-1 and editions
  const [artworks, setArtworks] = useState<ArtworkItem[]>([]);

  // Phases
  const [phases, setPhases] = useState<Phase[]>([]);

  // Initialize form state from collection data
  useEffect(() => {
    if (!collection) return;

    // Use requestAnimationFrame to defer heavy parsing to next frame
    const initializeForm = () => {
      // Basic fields
      setName(collection.name);
      setSymbol(collection.symbol);
      setDescription(collection.description || "");
      setImageUrl(collection.image_url || "");
      setImagePreview(collection.image_url);
      setBannerUrl(collection.banner_url || "");
      setBannerPreview(collection.banner_url);
      setUnrevealedUrl(collection.unrevealed_image_url || "");
      setUnrevealedPreview(collection.unrevealed_image_url);
      setTotalSupply(collection.total_supply);
      setRoyaltyPercent(collection.royalty_percent);
      setStatus(collection.status);
      setIpfsBaseCid(collection.ipfs_base_cid || "");

      // Social links
      setSocialTwitter(collection.social_twitter || "");
      setSocialDiscord(collection.social_discord || "");
      setSocialWebsite(collection.social_website || "");
      setSocialTelegram(collection.social_telegram || "");

      // Collection type
      setCollectionType((collection.collection_type as CollectionType) || "generative");

      // Parse layers
      try {
        const parsedLayers = collection.layers_metadata as unknown as Layer[];
        setLayers(Array.isArray(parsedLayers) ? parsedLayers : []);
      } catch {
        setLayers([]);
      }

      // Parse trait rules
      try {
        const parsedRules = collection.trait_rules as unknown as TraitRule[];
        setTraitRules(Array.isArray(parsedRules) ? parsedRules : []);
      } catch {
        setTraitRules([]);
      }

      // Parse artworks
      try {
        const parsedArtworks = collection.artworks_metadata as unknown as ArtworkItem[];
        setArtworks(Array.isArray(parsedArtworks) ? parsedArtworks : []);
      } catch {
        setArtworks([]);
      }

      // Parse phases
      try {
        const parsedPhases = collection.phases as unknown as Phase[];
        setPhases(Array.isArray(parsedPhases) ? parsedPhases : []);
      } catch {
        setPhases([]);
      }

      setIsInitialized(true);
    };

    // Use setTimeout to ensure DOM is ready and prevent blocking
    const timeoutId = setTimeout(initializeForm, 0);
    return () => clearTimeout(timeoutId);
  }, [collection]);

  const canEditSupply = collection.minted === 0;
  const isLive = collection.status === "live";
  const isDeployed = !!collection.contract_address;

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setImageFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const processBannerFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Banner must be less than 5MB");
      return;
    }

    setBannerFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setBannerPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processBannerFile(file);
  };

  const handleImageDrag = (e: React.DragEvent, isDragging: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(isDragging);
  };

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  const handleBannerDrag = (e: React.DragEvent, isDragging: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingBanner(isDragging);
  };

  const handleBannerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingBanner(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processBannerFile(file);
  };

  const uploadImageToStorage = async (): Promise<string | null> => {
    if (!imageFile) return imageUrl || null;

    setIsUploadingImage(true);
    try {
      const wallet = { address: collection.creator_id, chainType: collection.chain || 'solana', network: network || 'devnet' };
      const arweaveUrl = await uploadToArweave(imageFile, wallet, false, undefined, undefined, undefined, false, getSolanaProvider());
      return arweaveUrl;
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload image to Arweave");
      return null;
    } finally {
      setIsUploadingImage(false);
    }
  };

  const uploadBannerToStorage = async (): Promise<string | null> => {
    if (!bannerFile) return bannerUrl || null;

    try {
      const wallet = { address: collection.creator_id, chainType: collection.chain || 'solana', network: network || 'devnet' };
      const arweaveUrl = await uploadToArweave(bannerFile, wallet, false, undefined, undefined, undefined, false, getSolanaProvider());
      return arweaveUrl;
    } catch (err) {
      console.error("Banner upload error:", err);
      toast.error("Failed to upload banner to Arweave");
      return null;
    }
  };

  const processUnrevealedFile = (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.includes('gif')) {
      toast.error("Please upload an image or GIF file");
      return;
    }

    setUnrevealedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setUnrevealedPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUnrevealedUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processUnrevealedFile(file);
  };

  const handleUnrevealedDrag = (e: React.DragEvent, isDragging: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingUnrevealed(isDragging);
  };

  const handleUnrevealedDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingUnrevealed(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processUnrevealedFile(file);
  };

  const uploadUnrevealedToStorage = async (): Promise<string | null> => {
    if (!unrevealedFile) return unrevealedUrl || null;

    try {
      const wallet = { address: collection.creator_id, chainType: collection.chain || 'solana', network: network || 'devnet' };
      const arweaveUrl = await uploadToArweave(unrevealedFile, wallet, false, undefined, undefined, undefined, false, getSolanaProvider());
      return arweaveUrl;
    } catch (err) {
      console.error("Unrevealed upload error:", err);
      toast.error("Failed to upload unrevealed image to Arweave");
      return null;
    }
  };

  const validateForm = () => {
    try {
      collectionSchema.parse({
        name,
        symbol,
        description: description || undefined,
        image_url: imageUrl || undefined,
        total_supply: totalSupply,
        royalty_percent: royaltyPercent,
        status,
      });
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        err.errors.forEach((e) => {
          if (e.path[0]) {
            newErrors[e.path[0] as string] = e.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleAddPhase = () => {
    const newPhase: Phase = {
      id: `phase-${Date.now()}`,
      name: `Phase ${phases.length + 1}`,
      price: "0",
      maxPerWallet: 5,
      supply: Math.floor(totalSupply / 2),
      minted: 0,
      isActive: false,
      startTime: null,
      endTime: null,
      requiresAllowlist: false,
    };
    setPhases([...phases, newPhase]);
  };

  const handleRemovePhase = (phaseId: string) => {
    if (phases.length <= 1) {
      toast.error("Must have at least one phase");
      return;
    }
    setPhases(phases.filter((p) => p.id !== phaseId));
  };

  const handlePhaseChange = (phaseId: string, field: keyof Phase, value: unknown) => {
    setPhases(
      phases.map((p) =>
        p.id === phaseId ? { ...p, [field]: value } : p
      )
    );
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.error("Please fix the errors before saving");
      return;
    }

    // Validate phases
    const totalPhaseSupply = phases.reduce((sum, p) => sum + p.supply, 0);
    if (totalPhaseSupply > totalSupply) {
      toast.error("Total phase supply cannot exceed collection supply");
      return;
    }

    setIsSaving(true);
    toast.loading("Saving collection changes...", { id: "save-collection" });
    try {
      // Upload image if there's a new file
      let finalImageUrl = imageUrl;
      if (imageFile) {
        toast.loading("Uploading collection image...", { id: "save-collection" });
        const uploadedUrl = await uploadImageToStorage();
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl;
        }
      }

      // Upload banner if there's a new file
      let finalBannerUrl = bannerUrl;
      if (bannerFile) {
        toast.loading("Uploading banner image...", { id: "save-collection" });
        const uploadedBannerUrl = await uploadBannerToStorage();
        if (uploadedBannerUrl) {
          finalBannerUrl = uploadedBannerUrl;
        }
      }

      // Upload unrevealed image if there's a new file
      let finalUnrevealedUrl = unrevealedUrl;
      if (unrevealedFile) {
        toast.loading("Uploading unrevealed image...", { id: "save-collection" });
        const uploadedUnrevealedUrl = await uploadUnrevealedToStorage();
        if (uploadedUnrevealedUrl) {
          finalUnrevealedUrl = uploadedUnrevealedUrl;
        }
      }

      toast.loading("Updating collection record...", { id: "save-collection" });

      // Convert phases to JSON-compatible format
      const phasesJson = phases.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        maxPerWallet: p.maxPerWallet,
        supply: p.supply,
        minted: p.minted || 0,
        isActive: p.isActive || false,
        startTime: p.startTime,
        endTime: p.endTime,
        requiresAllowlist: p.requiresAllowlist,
      }));

      const { error } = await supabase
        .from("collections")
        .update({
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          description: description.trim() || null,
          image_url: finalImageUrl?.trim() || null,
          banner_url: finalBannerUrl?.trim() || null,
          unrevealed_image_url: finalUnrevealedUrl?.trim() || null,
          total_supply: totalSupply,
          royalty_percent: royaltyPercent,
          status,
          collection_type: collectionType,
          phases: phasesJson as unknown as undefined,
          layers_metadata: collectionType === "generative" ? (layers as unknown as undefined) : null,
          trait_rules: collectionType === "generative" ? (traitRules as unknown as undefined) : null,
          artworks_metadata: (collectionType === "one_of_one" || collectionType === "editions") ? (artworks.map(a => ({
            id: a.id,
            name: a.name,
            imageUrl: a.imageUrl,
            description: a.description || ""
          })) as unknown as undefined) : null,
          social_twitter: socialTwitter.trim() || null,
          social_discord: socialDiscord.trim() || null,
          social_website: socialWebsite.trim() || null,
          social_telegram: socialTelegram.trim() || null,
          ipfs_base_cid: ipfsBaseCid.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", collection.id);

      if (error) {
        console.error("Error updating collection:", error);
        toast.error("Failed to save changes", { id: "save-collection" });
      } else {
        toast.success("Collection updated successfully!", { id: "save-collection" });
        onSave();
      }
    } catch (err) {
      console.error("Error saving collection:", err);
      toast.error(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`, { id: "save-collection" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isDeployed) {
      toast.error("Cannot delete a deployed collection");
      return;
    }

    setIsDeleting(true);
    try {
      // Delete related allowlist entries first
      await supabase
        .from("allowlist_entries")
        .delete()
        .eq("collection_id", collection.id);

      // Note: Assets are stored on Arweave (immutable / permanent storage).
      // No storage cleanup needed — Arweave data is permanent by design.

      // Delete the collection
      const { error } = await supabase
        .from("collections")
        .delete()
        .eq("id", collection.id);

      if (error) {
        console.error("Error deleting collection:", error);
        toast.error("Failed to delete collection");
      } else {
        toast.success("Collection deleted successfully");
        navigate("/launchpad");
      }
    } catch (err) {
      console.error("Error:", err);
      toast.error("Failed to delete collection");
    } finally {
      setIsDeleting(false);
    }
  };

  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-72 bg-muted animate-pulse rounded mt-2" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-24 bg-muted animate-pulse rounded" />
            <div className="h-10 w-32 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="h-12 w-full bg-muted animate-pulse rounded" />
        <Card>
          <CardHeader>
            <div className="h-6 w-40 bg-muted animate-pulse rounded" />
            <div className="h-4 w-60 bg-muted animate-pulse rounded mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="h-10 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-24 bg-muted animate-pulse rounded" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-10 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-muted animate-pulse rounded" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Edit Collection</h2>
          <p className="text-muted-foreground">Update your collection details, artwork, and mint phases</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Delete button - only show if not deployed */}
          {!isDeployed && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:bg-destructive/10" disabled={isSaving || isDeleting}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Collection</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{collection.name}"? This action cannot be undone.
                    All artwork, allowlist entries, and collection data will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Delete Collection
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <Button variant="outline" onClick={onCancel} disabled={isSaving || isDeleting}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isDeleting}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {isLive && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-500">Collection is Live</p>
            <p className="text-sm text-amber-500/80">
              Some fields cannot be modified while the collection is live. You can still update description and phase details.
            </p>
          </div>
        </div>
      )}

      {isDeployed && (
        <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg flex items-start gap-3">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-primary">Contract Deployed</p>
            <p className="text-sm text-primary/80">
              Artwork and layers cannot be modified after contract deployment. You can still update details and phases.
            </p>
          </div>
        </div>
      )}

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="details" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="artwork" className="flex items-center gap-2" disabled={isDeployed}>
            <Palette className="w-4 h-4" />
            {collectionType === "generative" ? "Layers & Traits" : "Artwork"}
            {isDeployed && <Badge variant="outline" className="ml-1 text-xs">Locked</Badge>}
          </TabsTrigger>
          <TabsTrigger value="phases" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Mint Phases
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Core details about your collection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Collection Type Selector */}
              <div className="space-y-3">
                <Label>Collection Type</Label>
                <div className="grid grid-cols-3 gap-3">
                  <Card
                    className={`cursor-pointer transition-all hover:border-primary/50 ${collectionType === "generative"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border"
                      } ${isLive ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={() => !isLive && setCollectionType("generative")}
                  >
                    <CardContent className="p-3 text-center">
                      <Shuffle className="w-6 h-6 mx-auto mb-1 text-primary" />
                      <h4 className="font-semibold text-xs">Generative</h4>
                    </CardContent>
                  </Card>

                  <Card
                    className={`cursor-pointer transition-all hover:border-primary/50 ${collectionType === "one_of_one"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border"
                      } ${isLive ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={() => !isLive && setCollectionType("one_of_one")}
                  >
                    <CardContent className="p-3 text-center">
                      <Gem className="w-6 h-6 mx-auto mb-1 text-amber-500" />
                      <h4 className="font-semibold text-xs">1 of 1s</h4>
                    </CardContent>
                  </Card>

                  <Card
                    className={`cursor-pointer transition-all hover:border-primary/50 ${collectionType === "editions"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border"
                      } ${isLive ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={() => !isLive && setCollectionType("editions")}
                  >
                    <CardContent className="p-3 text-center">
                      <Copy className="w-6 h-6 mx-auto mb-1 text-emerald-500" />
                      <h4 className="font-semibold text-xs">Editions</h4>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Collection Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Awesome Collection"
                    disabled={isLive}
                    maxLength={100}
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="symbol">Symbol *</Label>
                  <Input
                    id="symbol"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="MAC"
                    disabled={isLive}
                    maxLength={10}
                  />
                  {errors.symbol && <p className="text-xs text-destructive">{errors.symbol}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your collection..."
                  rows={4}
                  maxLength={1000}
                />
                <p className="text-xs text-muted-foreground">{description.length}/1000 characters</p>
                {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
              </div>

              <div className="space-y-2">
                <Label>Collection Image</Label>
                <div
                  className={`flex gap-4 items-start p-3 rounded-lg border-2 border-dashed transition-colors ${isDraggingImage
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent'
                    }`}
                  onDragEnter={(e) => handleImageDrag(e, true)}
                  onDragOver={(e) => handleImageDrag(e, true)}
                  onDragLeave={(e) => handleImageDrag(e, false)}
                  onDrop={handleImageDrop}
                >
                  {/* Image Preview */}
                  <div
                    className={`w-24 h-24 rounded-lg border-2 border-dashed overflow-hidden cursor-pointer transition-colors flex items-center justify-center bg-muted ${isDraggingImage ? 'border-primary' : 'border-border hover:border-primary/50'
                      }`}
                    onClick={() => document.getElementById("edit-image-upload")?.click()}
                  >
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById("edit-image-upload")?.click()}
                        disabled={isUploadingImage}
                      >
                        {isUploadingImage ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        Upload Image
                      </Button>
                      {imageFile && (
                        <Badge variant="secondary" className="text-xs">
                          New image selected
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Drag & drop or enter an image URL below
                    </p>
                    <Input
                      id="imageUrl"
                      value={imageUrl}
                      onChange={(e) => {
                        setImageUrl(e.target.value);
                        setImagePreview(e.target.value || null);
                        setImageFile(null);
                      }}
                      placeholder="https://example.com/image.png"
                      type="url"
                      className="text-sm"
                    />
                    <input
                      id="edit-image-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </div>
                </div>
                {errors.image_url && <p className="text-xs text-destructive">{errors.image_url}</p>}
              </div>

              {/* Banner Upload */}
              <div className="space-y-2">
                <Label>Collection Banner</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Recommended size: 1500x500px. This will be displayed on your collection page.
                </p>
                <div
                  className={`space-y-3 p-3 rounded-lg border-2 border-dashed transition-colors ${isDraggingBanner
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent'
                    }`}
                  onDragEnter={(e) => handleBannerDrag(e, true)}
                  onDragOver={(e) => handleBannerDrag(e, true)}
                  onDragLeave={(e) => handleBannerDrag(e, false)}
                  onDrop={handleBannerDrop}
                >
                  {bannerPreview ? (
                    <div className="relative w-full aspect-[3/1] rounded-lg overflow-hidden border border-border">
                      <img
                        src={bannerPreview}
                        alt="Banner Preview"
                        className="w-full h-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={() => {
                          setBannerPreview(null);
                          setBannerFile(null);
                          setBannerUrl("");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      {bannerFile && (
                        <Badge variant="secondary" className="absolute bottom-2 left-2 text-xs">
                          New banner selected
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`w-full aspect-[3/1] rounded-lg border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center bg-muted gap-2 ${isDraggingBanner ? 'border-primary' : 'border-border hover:border-primary/50'
                        }`}
                      onClick={() => document.getElementById("edit-banner-upload")?.click()}
                    >
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Drag & drop or click to upload banner</span>
                      <span className="text-xs text-muted-foreground">PNG, JPG up to 5MB</span>
                    </div>
                  )}
                  <input
                    id="edit-banner-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleBannerUpload}
                  />
                  {bannerPreview && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById("edit-banner-upload")?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Change Banner
                    </Button>
                  )}
                </div>
              </div>

              {/* Unrevealed Image Upload */}
              <div className="space-y-2">
                <Label>Unrevealed Image (Optional)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  This image/GIF will be shown before your NFTs are revealed. Perfect for building suspense!
                </p>
                <div
                  className={`space-y-3 p-3 rounded-lg border-2 border-dashed transition-colors ${isDraggingUnrevealed
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent'
                    }`}
                  onDragEnter={(e) => handleUnrevealedDrag(e, true)}
                  onDragOver={(e) => handleUnrevealedDrag(e, true)}
                  onDragLeave={(e) => handleUnrevealedDrag(e, false)}
                  onDrop={handleUnrevealedDrop}
                >
                  {unrevealedPreview ? (
                    <div className="relative w-40 h-40 rounded-lg overflow-hidden border border-border mx-auto">
                      <img
                        src={unrevealedPreview}
                        alt="Unrevealed Preview"
                        className="w-full h-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={() => {
                          setUnrevealedPreview(null);
                          setUnrevealedFile(null);
                          setUnrevealedUrl("");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      {unrevealedFile && (
                        <Badge variant="secondary" className="absolute bottom-2 left-2 text-xs">
                          New file selected
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`w-40 h-40 mx-auto rounded-lg border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center bg-muted gap-2 ${isDraggingUnrevealed ? 'border-primary' : 'border-border hover:border-primary/50'
                        }`}
                      onClick={() => document.getElementById("edit-unrevealed-upload")?.click()}
                    >
                      <Sparkles className="w-8 h-8 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground text-center px-2">Drag & drop or click to upload</span>
                      <span className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</span>
                    </div>
                  )}
                  <input
                    id="edit-unrevealed-upload"
                    type="file"
                    accept="image/*,.gif"
                    className="hidden"
                    onChange={handleUnrevealedUpload}
                  />
                  {unrevealedPreview && (
                    <div className="flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById("edit-unrevealed-upload")?.click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Change Image
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Advanced Storage Section */}
              <Separator className="my-6" />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Database className="w-4 h-4 text-primary" />
                    Advanced Storage
                  </h4>
                  <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                    Arweave / IPFS Native
                  </Badge>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ipfs-cid" className="text-xs text-muted-foreground">
                    IPFS Base CID (Override)
                  </Label>
                  <Input
                    id="ipfs-cid"
                    value={ipfsBaseCid}
                    onChange={(e) => setIpfsBaseCid(e.target.value)}
                    placeholder="Qm... or bafy..."
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    If provided, metadata resolution will use <strong>ipfs://{ipfsBaseCid || 'CID'}/[id].json</strong> instead of Supabase.
                    This is for collections manually pinned to IPFS (e.g. via Pinata).
                  </p>
                </div>
              </div>

              {/* Social Links */}
              <Separator className="my-6" />
              <div className="space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Social Links
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="socialTwitter" className="flex items-center gap-2 text-sm">
                      <Twitter className="w-4 h-4 text-[#1DA1F2]" />
                      Twitter / X
                    </Label>
                    <Input
                      id="socialTwitter"
                      value={socialTwitter}
                      onChange={(e) => setSocialTwitter(e.target.value)}
                      placeholder="https://twitter.com/..."
                      type="url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="socialDiscord" className="flex items-center gap-2 text-sm">
                      <MessageCircle className="w-4 h-4 text-[#5865F2]" />
                      Discord
                    </Label>
                    <Input
                      id="socialDiscord"
                      value={socialDiscord}
                      onChange={(e) => setSocialDiscord(e.target.value)}
                      placeholder="https://discord.gg/..."
                      type="url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="socialWebsite" className="flex items-center gap-2 text-sm">
                      <Globe className="w-4 h-4 text-emerald-500" />
                      Website
                    </Label>
                    <Input
                      id="socialWebsite"
                      value={socialWebsite}
                      onChange={(e) => setSocialWebsite(e.target.value)}
                      placeholder="https://..."
                      type="url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="socialTelegram" className="flex items-center gap-2 text-sm">
                      <Send className="w-4 h-4 text-[#0088cc]" />
                      Telegram
                    </Label>
                    <Input
                      id="socialTelegram"
                      value={socialTelegram}
                      onChange={(e) => setSocialTelegram(e.target.value)}
                      placeholder="https://t.me/..."
                      type="url"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Supply & Royalties */}
          <Card>
            <CardHeader>
              <CardTitle>Supply & Royalties</CardTitle>
              <CardDescription>Configure your collection economics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="totalSupply">Total Supply *</Label>
                  <Input
                    id="totalSupply"
                    type="number"
                    value={totalSupply}
                    onChange={(e) => setTotalSupply(parseInt(e.target.value) || 0)}
                    min={1}
                    max={100000}
                    disabled={!canEditSupply}
                  />
                  {!canEditSupply && (
                    <p className="text-xs text-muted-foreground">Cannot change after minting starts</p>
                  )}
                  {errors.total_supply && <p className="text-xs text-destructive">{errors.total_supply}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="royalty">Royalty %</Label>
                  <Input
                    id="royalty"
                    type="number"
                    value={royaltyPercent}
                    onChange={(e) => setRoyaltyPercent(parseFloat(e.target.value) || 0)}
                    min={0}
                    max={15}
                    step={0.5}
                    disabled={isLive}
                  />
                  {errors.royalty_percent && <p className="text-xs text-destructive">{errors.royalty_percent}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={status} onValueChange={setStatus} disabled={isLive}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="upcoming">Upcoming</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="ended">Ended</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.status && <p className="text-xs text-destructive">{errors.status}</p>}
                </div>
              </div>

              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Minted</span>
                  <span className="font-medium">{collection.minted} / {totalSupply}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Artwork / Layers Tab */}
        <TabsContent value="artwork" className="space-y-6 mt-6">
          {collectionType === "generative" ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    Layers & Traits
                  </CardTitle>
                  <CardDescription>
                    Define your layers and upload trait images. Each layer represents a component of your NFT (e.g., Background, Body, Eyes, Accessories).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LayerManager
                    layers={layers}
                    onLayersChange={setLayers}
                  />
                </CardContent>
              </Card>

              {layers.length > 0 && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Trait Rules</CardTitle>
                      <CardDescription>
                        Define compatibility rules between traits (optional)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <TraitRulesManager
                        layers={layers}
                        rules={traitRules}
                        onRulesChange={setTraitRules}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Generation Preview</CardTitle>
                      <CardDescription>
                        Preview how your generative NFTs will look
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <GenerationPreview
                        layers={layers}
                        rules={traitRules}
                        totalSupply={totalSupply.toString()}
                      />
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {collectionType === "one_of_one" ? (
                    <Gem className="w-5 h-5 text-amber-500" />
                  ) : (
                    <Copy className="w-5 h-5 text-emerald-500" />
                  )}
                  {collectionType === "one_of_one" ? "1 of 1 Artwork" : "Edition Artwork"}
                </CardTitle>
                <CardDescription>
                  {collectionType === "one_of_one"
                    ? "Upload unique artwork for each NFT in your collection. Each image becomes a unique NFT."
                    : "Upload artwork for your editions collection. You can have multiple editions of the same artwork."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ArtworkUploader
                  artworks={artworks}
                  onArtworksChange={setArtworks}
                  collectionType={collectionType as "one_of_one" | "editions"}
                  creatorId={collection.creator_id}
                  maxItems={collectionType === "one_of_one" ? totalSupply : 100}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Mint Phases Tab */}
        <TabsContent value="phases" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Mint Phases</CardTitle>
                  <CardDescription>Configure your mint schedule and pricing</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleAddPhase}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Phase
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {phases.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No phases configured</p>
                  <Button variant="link" onClick={handleAddPhase}>
                    Add your first phase
                  </Button>
                </div>
              ) : (
                phases.map((phase, index) => (
                  <div
                    key={phase.id}
                    className="p-4 border rounded-lg space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Phase {index + 1}</Badge>
                        <Input
                          value={phase.name}
                          onChange={(e) => handlePhaseChange(phase.id, "name", e.target.value)}
                          className="w-40 h-8"
                          placeholder="Phase name"
                          maxLength={50}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemovePhase(phase.id)}
                        disabled={phases.length <= 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Price ({chainSymbol})</Label>
                        <Input
                          type="number"
                          value={phase.price}
                          onChange={(e) => handlePhaseChange(phase.id, "price", e.target.value)}
                          min={0}
                          step={0.01}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Supply</Label>
                        <Input
                          type="number"
                          value={phase.supply}
                          onChange={(e) => handlePhaseChange(phase.id, "supply", parseInt(e.target.value) || 0)}
                          min={1}
                          max={totalSupply}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max/Wallet</Label>
                        <Input
                          type="number"
                          value={phase.maxPerWallet}
                          onChange={(e) => handlePhaseChange(phase.id, "maxPerWallet", parseInt(e.target.value) || 1)}
                          min={1}
                          max={100}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Requires Allowlist</Label>
                        <div className="flex items-center h-10">
                          <Switch
                            checked={phase.requiresAllowlist}
                            onCheckedChange={(checked) => handlePhaseChange(phase.id, "requiresAllowlist", checked)}
                          />
                        </div>
                      </div>
                    </div>

                    {phase.minted !== undefined && phase.minted > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {phase.minted} already minted in this phase
                      </p>
                    )}
                  </div>
                ))
              )}

              {phases.length > 0 && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Phase Supply</span>
                    <span className={`font-medium ${phases.reduce((sum, p) => sum + p.supply, 0) > totalSupply ? "text-destructive" : ""}`}>
                      {phases.reduce((sum, p) => sum + p.supply, 0).toLocaleString()} / {totalSupply.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}