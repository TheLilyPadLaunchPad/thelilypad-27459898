import React, { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  X,
  Trash2,
  Image as ImageIcon,
  Loader2,
  Plus,
  FileImage,
  Edit2,
  Check,
  CheckSquare,
  Square,
  Pencil,
  Hash,
  Type,
  FileText,
  GripVertical,
  Eye,
  LayoutGrid,
  ShoppingCart,
  Tag,
  Sparkles,
  ChevronDown,
  BarChart3,
  Gem
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface TraitAttribute {
  trait_type: string;
  value: string;
  rarity?: "common" | "uncommon" | "rare" | "epic" | "legendary";
}

export interface ArtworkItem {
  id: string;
  name: string;
  imageUrl: string;
  description?: string;
  attributes?: TraitAttribute[];
  file?: File;
  isUploading?: boolean;
}

interface ArtworkUploaderProps {
  artworks: ArtworkItem[];
  onArtworksChange: (artworks: ArtworkItem[]) => void;
  collectionType: "one_of_one" | "editions";
  creatorId: string;
  maxItems?: number;
  chainSymbol?: string;
}

type NamingPattern = "prefix" | "suffix" | "replace" | "numbered";

export function ArtworkUploader({
  artworks,
  onArtworksChange,
  collectionType,
  creatorId,
  maxItems = 100,
  chainSymbol = 'SOL'
}: ArtworkUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Selection mode for batch editing
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Batch edit modal
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [namingPattern, setNamingPattern] = useState<NamingPattern>("prefix");
  const [batchNameValue, setBatchNameValue] = useState("");
  const [batchDescription, setBatchDescription] = useState("");
  const [applyDescription, setApplyDescription] = useState(false);
  const [startNumber, setStartNumber] = useState(1);

  // Batch trait editing
  const [applyTraits, setApplyTraits] = useState(false);
  const [traitMode, setTraitMode] = useState<"append" | "replace" | "remove">("append");
  const [batchTraits, setBatchTraits] = useState<TraitAttribute[]>([]);

  // Drag-and-drop reordering
  const [reorderDragIndex, setReorderDragIndex] = useState<number | null>(null);
  const [reorderDropIndex, setReorderDropIndex] = useState<number | null>(null);

  // Preview mode
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Stats panel
  const [isStatsOpen, setIsStatsOpen] = useState(false);

  // Compute trait statistics
  const traitStats = useMemo(() => {
    const allTraits = artworks.flatMap(a => a.attributes || []);
    const totalTraits = allTraits.length;
    const artworksWithTraits = artworks.filter(a => a.attributes && a.attributes.length > 0).length;

    // Rarity distribution
    const rarityCount: Record<string, number> = {
      legendary: 0,
      epic: 0,
      rare: 0,
      uncommon: 0,
      common: 0
    };

    // Trait type distribution
    const traitTypeCount: Record<string, { count: number; values: Record<string, number> }> = {};

    allTraits.forEach(trait => {
      // Count rarity
      const rarity = trait.rarity || "common";
      rarityCount[rarity] = (rarityCount[rarity] || 0) + 1;

      // Count trait types and values
      const type = trait.trait_type.toLowerCase().trim();
      if (type) {
        if (!traitTypeCount[type]) {
          traitTypeCount[type] = { count: 0, values: {} };
        }
        traitTypeCount[type].count++;
        const value = trait.value.toLowerCase().trim();
        if (value) {
          traitTypeCount[type].values[value] = (traitTypeCount[type].values[value] || 0) + 1;
        }
      }
    });

    // Sort trait types by count
    const sortedTraitTypes = Object.entries(traitTypeCount)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    return {
      totalTraits,
      artworksWithTraits,
      rarityCount,
      traitTypes: sortedTraitTypes,
      uniqueTraitTypes: Object.keys(traitTypeCount).length
    };
  }, [artworks]);

  const handleDrag = useCallback((e: React.DragEvent, isDragging: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(isDragging);
  }, []);

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      toast.error("Please upload image files only");
      return;
    }

    if (artworks.length + imageFiles.length > maxItems) {
      toast.error(`Cannot add more than ${maxItems} items`);
      return;
    }

    setIsUploading(true);

    try {
      const newArtworks: ArtworkItem[] = [];

      for (const file of imageFiles) {
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 100MB)`);
          continue;
        }

        const id = `artwork-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const name = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

        try {
          // Use a local blob URL for preview instead of uploading to Supabase
          newArtworks.push({
            id,
            name,
            imageUrl: URL.createObjectURL(file), // Local preview
            file, // Keep the file explicitly for the final Arweave deployment!
            description: ""
          });
        } catch (err) {
          console.error("Error creating local preview:", err);
          toast.error(`Failed to process ${file.name}`);
        }
      }

      if (newArtworks.length > 0) {
        onArtworksChange([...artworks, ...newArtworks]);
        toast.success(`Added ${newArtworks.length} artwork${newArtworks.length > 1 ? 's' : ''}`);
      }
    } catch (err) {
      console.error("Unexpected error during upload:", err);
      toast.error("Upload failed unexpectedly");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  }, [artworks, onArtworksChange, creatorId, maxItems]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const removeArtwork = async (id: string) => {
    const artwork = artworks.find(a => a.id === id);
    // Cleanup local object URL if it exists
    if (artwork?.imageUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(artwork.imageUrl);
    }
    onArtworksChange(artworks.filter(a => a.id !== id));
    selectedIds.delete(id);
    setSelectedIds(new Set(selectedIds));
  };

  const updateArtwork = (id: string, updates: Partial<ArtworkItem>) => {
    onArtworksChange(artworks.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  // Selection helpers
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    setSelectedIds(new Set(artworks.map(a => a.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const deleteSelected = async () => {
    const selectedArtworks = artworks.filter(a => selectedIds.has(a.id));

    for (const artwork of selectedArtworks) {
      if (artwork.imageUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(artwork.imageUrl);
      }
    }

    onArtworksChange(artworks.filter(a => !selectedIds.has(a.id)));
    setSelectedIds(new Set());
    setIsSelectionMode(false);
    toast.success(`Deleted ${selectedArtworks.length} artwork${selectedArtworks.length > 1 ? 's' : ''}`);
  };

  // Batch edit logic
  const applyBatchEdit = () => {
    const selectedArtworksList = artworks.filter(a => selectedIds.has(a.id));

    if (selectedArtworksList.length === 0) {
      toast.error("No artworks selected");
      return;
    }

    const updatedArtworks = artworks.map((artwork, globalIndex) => {
      if (!selectedIds.has(artwork.id)) return artwork;

      const selectedIndex = selectedArtworksList.findIndex(a => a.id === artwork.id);
      let newName = artwork.name;

      switch (namingPattern) {
        case "prefix":
          if (batchNameValue) {
            newName = `${batchNameValue} ${artwork.name}`;
          }
          break;
        case "suffix":
          if (batchNameValue) {
            newName = `${artwork.name} ${batchNameValue}`;
          }
          break;
        case "replace":
          if (batchNameValue) {
            newName = batchNameValue;
          }
          break;
        case "numbered":
          if (batchNameValue) {
            newName = `${batchNameValue} #${startNumber + selectedIndex}`;
          } else {
            newName = `#${startNumber + selectedIndex}`;
          }
          break;
      }
      // Handle traits
      let newAttributes = artwork.attributes || [];
      if (applyTraits && batchTraits.length > 0) {
        switch (traitMode) {
          case "replace":
            newAttributes = [...batchTraits];
            break;
          case "append":
            // Add new traits, avoiding duplicates by trait_type
            const existingTypes = new Set(newAttributes.map(a => a.trait_type.toLowerCase()));
            const traitsToAdd = batchTraits.filter(t => !existingTypes.has(t.trait_type.toLowerCase()));
            newAttributes = [...newAttributes, ...traitsToAdd];
            break;
          case "remove":
            // Remove traits that match the trait_type
            const typesToRemove = new Set(batchTraits.map(t => t.trait_type.toLowerCase()));
            newAttributes = newAttributes.filter(a => !typesToRemove.has(a.trait_type.toLowerCase()));
            break;
        }
      }

      return {
        ...artwork,
        name: newName,
        description: applyDescription ? batchDescription : artwork.description,
        attributes: newAttributes
      };
    });

    onArtworksChange(updatedArtworks);
    setIsBatchEditOpen(false);
    setBatchNameValue("");
    setBatchDescription("");
    setApplyDescription(false);
    setApplyTraits(false);
    setBatchTraits([]);
    toast.success(`Updated ${selectedArtworksList.length} artwork${selectedArtworksList.length > 1 ? 's' : ''}`);
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const addBatchTrait = () => {
    setBatchTraits([...batchTraits, { trait_type: "", value: "", rarity: "common" }]);
  };

  const updateBatchTrait = (index: number, updates: Partial<TraitAttribute>) => {
    const newTraits = [...batchTraits];
    newTraits[index] = { ...newTraits[index], ...updates };
    setBatchTraits(newTraits);
  };

  const removeBatchTrait = (index: number) => {
    setBatchTraits(batchTraits.filter((_, i) => i !== index));
  };

  // Drag-and-drop reordering handlers
  const handleReorderDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    setReorderDragIndex(index);
  };

  const handleReorderDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (reorderDragIndex !== null && index !== reorderDragIndex) {
      setReorderDropIndex(index);
    }
  };

  const handleReorderDragLeave = () => {
    setReorderDropIndex(null);
  };

  const handleReorderDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (reorderDragIndex === null || reorderDragIndex === dropIndex) {
      setReorderDragIndex(null);
      setReorderDropIndex(null);
      return;
    }

    const newArtworks = [...artworks];
    const [draggedItem] = newArtworks.splice(reorderDragIndex, 1);
    newArtworks.splice(dropIndex, 0, draggedItem);

    onArtworksChange(newArtworks);
    setReorderDragIndex(null);
    setReorderDropIndex(null);
    toast.success("Artwork reordered");
  };

  const handleReorderDragEnd = () => {
    setReorderDragIndex(null);
    setReorderDropIndex(null);
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 transition-colors ${isDragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
          }`}
        onDragEnter={(e) => handleDrag(e, true)}
        onDragOver={(e) => handleDrag(e, true)}
        onDragLeave={(e) => handleDrag(e, false)}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          {isUploading ? (
            <>
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Uploading artwork...</p>
            </>
          ) : (
            <>
              <div className="p-3 rounded-full bg-primary/10">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="font-medium">
                  Drop {collectionType === "one_of_one" ? "your unique artwork" : "edition artwork"} here
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  PNG, JPG, GIF, WEBP up to 100MB each
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  <Badge variant="outline" className="text-[9px] bg-muted opacity-80 font-normal">300-500px Small</Badge>
                  <Badge variant="outline" className="text-[9px] bg-muted/50 opacity-80 font-normal">1000px Standard</Badge>
                  <Badge variant="outline" className="text-[9px] bg-primary/10 border-primary/20 font-medium">2000px High Quality</Badge>
                  <Badge variant="outline" className="text-[9px] bg-primary/20 border-primary/30 text-primary font-bold">4000px+ Pro/Gallery</Badge>
                </div>
                <p className="text-[9px] text-primary/70 mt-1 italic">Supports any aspect ratio & resolution (300px to 4000px+)</p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('artwork-upload')?.click()}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Select Files
                </Button>
              </div>
            </>
          )}
        </div>
        <input
          id="artwork-upload"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Stats & Actions Bar */}
      {artworks.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <FileImage className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {artworks.length} artwork{artworks.length !== 1 ? 's' : ''} uploaded
            </span>
            <Badge variant="outline">
              {maxItems - artworks.length} slots remaining
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {isSelectionMode ? (
              <>
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} selected
                </span>
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  Deselect
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setIsBatchEditOpen(true)}
                  disabled={selectedIds.size === 0}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Batch Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={deleteSelected}
                  disabled={selectedIds.size === 0}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={exitSelectionMode}>
                  <X className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant={isPreviewMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsPreviewMode(!isPreviewMode)}
                >
                  {isPreviewMode ? (
                    <>
                      <LayoutGrid className="w-4 h-4 mr-2" />
                      Edit Mode
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      Preview NFTs
                    </>
                  )}
                </Button>
                {!isPreviewMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsSelectionMode(true)}
                  >
                    <CheckSquare className="w-4 h-4 mr-2" />
                    Batch Edit
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trait Statistics */}
      {artworks.length > 0 && traitStats.totalTraits > 0 && (
        <Collapsible open={isStatsOpen} onOpenChange={setIsStatsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Trait Statistics
                <Badge variant="secondary" className="ml-2">
                  {traitStats.totalTraits} traits
                </Badge>
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${isStatsOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Overview Stats */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Artworks with traits</span>
                    <span className="font-medium">{traitStats.artworksWithTraits} / {artworks.length}</span>
                  </div>
                  <Progress value={(traitStats.artworksWithTraits / artworks.length) * 100} className="h-2" />
                  <div className="flex justify-between text-sm pt-2">
                    <span className="text-muted-foreground">Unique trait types</span>
                    <span className="font-medium">{traitStats.uniqueTraitTypes}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total traits</span>
                    <span className="font-medium">{traitStats.totalTraits}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Avg traits per artwork</span>
                    <span className="font-medium">
                      {traitStats.artworksWithTraits > 0
                        ? (traitStats.totalTraits / traitStats.artworksWithTraits).toFixed(1)
                        : 0}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Rarity Distribution */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Gem className="w-4 h-4" />
                    Rarity Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { key: "legendary", label: "Legendary", color: "bg-yellow-500" },
                    { key: "epic", label: "Epic", color: "bg-purple-500" },
                    { key: "rare", label: "Rare", color: "bg-blue-500" },
                    { key: "uncommon", label: "Uncommon", color: "bg-green-500" },
                    { key: "common", label: "Common", color: "bg-muted-foreground" }
                  ].map(({ key, label, color }) => {
                    const count = traitStats.rarityCount[key as keyof typeof traitStats.rarityCount] || 0;
                    const percentage = traitStats.totalTraits > 0
                      ? (count / traitStats.totalTraits) * 100
                      : 0;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className={`${key === "legendary" ? "text-yellow-600" :
                            key === "epic" ? "text-purple-600" :
                              key === "rare" ? "text-blue-600" :
                                key === "uncommon" ? "text-green-600" :
                                  "text-muted-foreground"
                            }`}>{label}</span>
                          <span className="text-muted-foreground">{count} ({percentage.toFixed(1)}%)</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${color} transition-all`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Top Trait Types */}
              {traitStats.traitTypes.length > 0 && (
                <Card className="md:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      Top Trait Types
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                      {traitStats.traitTypes.map(([type, data]) => (
                        <div
                          key={type}
                          className="p-2 rounded-lg border border-border bg-muted/30"
                        >
                          <p className="text-xs font-medium capitalize truncate">{type}</p>
                          <p className="text-lg font-bold">{data.count}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {Object.keys(data.values).length} unique values
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Artwork Grid + Expanded Edit Panel */}
      {artworks.length > 0 && !isPreviewMode && (
        <div className={`flex gap-4 items-start ${editingId ? 'flex-col md:flex-row' : ''}`}>
          {/* Left: thumbnail grid */}
          <div className={editingId ? 'md:w-[272px] shrink-0 w-full' : 'w-full'}>
            <ScrollArea className="h-[420px] pr-2">
              <div className={`gap-3 grid ${editingId ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
                {artworks.map((artwork, index) => (
                  <Card
                    key={artwork.id}
                    draggable={!isSelectionMode && editingId !== artwork.id}
                    onDragStart={(e) => handleReorderDragStart(e, index)}
                    onDragOver={(e) => handleReorderDragOver(e, index)}
                    onDragLeave={handleReorderDragLeave}
                    onDrop={(e) => handleReorderDrop(e, index)}
                    onDragEnd={handleReorderDragEnd}
                    className={`group relative overflow-hidden transition-all ${editingId === artwork.id ? 'ring-2 ring-primary' : ''
                      } ${selectedIds.has(artwork.id) ? 'ring-2 ring-primary bg-primary/5' : ''}
                ${reorderDragIndex === index ? 'opacity-50 scale-95' : ''}
                ${reorderDropIndex === index ? 'ring-2 ring-primary ring-offset-2' : ''}
                ${!isSelectionMode && editingId !== artwork.id ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                    onClick={() => isSelectionMode && toggleSelection(artwork.id)}
                  >
                    {/* Drag Handle */}
                    {!isSelectionMode && (
                      <div className="absolute top-2 left-2 z-20 p-1 rounded bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}

                    <div className="aspect-square relative">
                      {artwork.imageUrl ? (
                        <img
                          src={artwork.imageUrl}
                          alt={artwork.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <ImageIcon className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}

                      {/* Selection Checkbox */}
                      {isSelectionMode && (
                        <div className="absolute top-2 right-2 z-10">
                          <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${selectedIds.has(artwork.id)
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'bg-background/80 border-border'
                            }`}>
                            {selectedIds.has(artwork.id) && <Check className="w-4 h-4" />}
                          </div>
                        </div>
                      )}

                      {/* Overlay Controls (hidden in selection mode) */}
                      {!isSelectionMode && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(editingId === artwork.id ? null : artwork.id);
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeArtwork(artwork.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}

                      {/* Index Badge */}
                      <Badge
                        variant="secondary"
                        className="absolute bottom-2 left-2 text-xs"
                      >
                        #{index + 1}
                      </Badge>
                    </div>

                    <CardContent className="p-3 space-y-2">
                      {editingId === artwork.id && !isSelectionMode ? (
                        <>
                          <Input
                            value={artwork.name}
                            onChange={(e) => updateArtwork(artwork.id, { name: e.target.value })}
                            placeholder="Artwork name"
                            className="h-8 text-sm"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Textarea
                            value={artwork.description || ""}
                            onChange={(e) => updateArtwork(artwork.id, { description: e.target.value })}
                            placeholder="Description (optional)"
                            className="text-sm min-h-[60px]"
                            rows={2}
                            onClick={(e) => e.stopPropagation()}
                          />

                          {/* Trait Attributes */}
                          <div className="space-y-2 pt-2 border-t border-border">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                Traits
                              </Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newAttribute: TraitAttribute = { trait_type: "", value: "" };
                                  updateArtwork(artwork.id, {
                                    attributes: [...(artwork.attributes || []), newAttribute]
                                  });
                                }}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Add
                              </Button>
                            </div>

                            {(artwork.attributes || []).map((attr, attrIndex) => (
                              <div key={attrIndex} className="flex gap-1 items-start">
                                <div className="flex-1 space-y-1">
                                  <Input
                                    value={attr.trait_type}
                                    onChange={(e) => {
                                      const newAttrs = [...(artwork.attributes || [])];
                                      newAttrs[attrIndex] = { ...attr, trait_type: e.target.value };
                                      updateArtwork(artwork.id, { attributes: newAttrs });
                                    }}
                                    placeholder="Trait type"
                                    className="h-7 text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <Input
                                    value={attr.value}
                                    onChange={(e) => {
                                      const newAttrs = [...(artwork.attributes || [])];
                                      newAttrs[attrIndex] = { ...attr, value: e.target.value };
                                      updateArtwork(artwork.id, { attributes: newAttrs });
                                    }}
                                    placeholder="Value"
                                    className="h-7 text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Select
                                    value={attr.rarity || "common"}
                                    onValueChange={(v) => {
                                      const newAttrs = [...(artwork.attributes || [])];
                                      newAttrs[attrIndex] = { ...attr, rarity: v as TraitAttribute["rarity"] };
                                      updateArtwork(artwork.id, { attributes: newAttrs });
                                    }}
                                  >
                                    <SelectTrigger className="h-7 w-20 text-xs" onClick={(e) => e.stopPropagation()}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="common">Common</SelectItem>
                                      <SelectItem value="uncommon">Uncommon</SelectItem>
                                      <SelectItem value="rare">Rare</SelectItem>
                                      <SelectItem value="epic">Epic</SelectItem>
                                      <SelectItem value="legendary">Legendary</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newAttrs = (artwork.attributes || []).filter((_, i) => i !== attrIndex);
                                      updateArtwork(artwork.id, { attributes: newAttrs });
                                    }}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}

                            {(!artwork.attributes || artwork.attributes.length === 0) && (
                              <p className="text-xs text-muted-foreground text-center py-1">
                                No traits added yet
                              </p>
                            )}
                          </div>

                          <Button
                            size="sm"
                            className="w-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(null);
                            }}
                          >
                            <Check className="w-4 h-4 mr-2" />
                            Done
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-sm truncate">{artwork.name}</p>
                          {artwork.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {artwork.description}
                            </p>
                          )}
                          {artwork.attributes && artwork.attributes.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {artwork.attributes.slice(0, 3).map((attr, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 ${attr.rarity === "legendary" ? "border-yellow-500 text-yellow-600" :
                                    attr.rarity === "epic" ? "border-purple-500 text-purple-600" :
                                      attr.rarity === "rare" ? "border-blue-500 text-blue-600" :
                                        attr.rarity === "uncommon" ? "border-green-500 text-green-600" :
                                          ""
                                    }`}
                                >
                                  {attr.trait_type}: {attr.value}
                                </Badge>
                              ))}
                              {artwork.attributes.length > 3 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  +{artwork.attributes.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Expanded Edit Panel */}
          {editingId && (() => {
            const art = artworks.find(a => a.id === editingId);
            if (!art) return null;
            const idx = artworks.findIndex(a => a.id === editingId);
            return (
              <div className="flex-1 min-w-0 rounded-xl border border-primary/40 bg-card/60 shadow-xl overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-muted/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                    <span className="text-sm font-bold truncate">Editing: {art.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{idx + 1} / {artworks.length}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" className="h-7 text-xs px-2" disabled={idx === 0} onClick={() => setEditingId(artworks[idx - 1].id)}>&#8592; Prev</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs px-2" disabled={idx === artworks.length - 1} onClick={() => setEditingId(artworks[idx + 1].id)}>Next &#8594;</Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                  </div>
                </div>
                <div className="flex gap-4 p-4 flex-1 overflow-auto">
                  <div className="w-[160px] shrink-0">
                    <div className="aspect-square rounded-xl overflow-hidden border-2 border-primary/30 bg-muted/20">
                      {art.imageUrl ? <img src={art.imageUrl} alt={art.name} className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-8 h-8 text-muted-foreground" /></div>}
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center mt-1">#{idx + 1} of {artworks.length}</p>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input value={art.name} onChange={e => updateArtwork(art.id, { name: e.target.value })} placeholder="Artwork name" className="h-8 text-sm" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Description</Label><Textarea value={art.description || ''} onChange={e => updateArtwork(art.id, { description: e.target.value })} placeholder="Description (optional)" className="text-sm min-h-[60px]" rows={2} /></div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs flex items-center gap-1"><Tag className="w-3 h-3" />Trait Attributes</Label>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => updateArtwork(art.id, { attributes: [...(art.attributes || []), { trait_type: '', value: '' }] })}>
                          <Plus className="w-3 h-3 mr-1" />
                          Add
                        </Button>
                      </div>
                      {(art.attributes || []).map((attr, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <Input value={attr.trait_type} onChange={e => { const a = [...(art.attributes || [])]; a[i] = { ...attr, trait_type: e.target.value }; updateArtwork(art.id, { attributes: a }); }} placeholder="Trait type" className="h-7 text-xs" />
                          <Input value={attr.value} onChange={e => { const a = [...(art.attributes || [])]; a[i] = { ...attr, value: e.target.value }; updateArtwork(art.id, { attributes: a }); }} placeholder="Value" className="h-7 text-xs" />
                          <Select value={attr.rarity || 'common'} onValueChange={v => { const a = [...(art.attributes || [])]; a[i] = { ...attr, rarity: v as TraitAttribute['rarity'] }; updateArtwork(art.id, { attributes: a }); }}>
                            <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="common">Common</SelectItem><SelectItem value="uncommon">Uncommon</SelectItem><SelectItem value="rare">Rare</SelectItem><SelectItem value="epic">Epic</SelectItem><SelectItem value="legendary">Legendary</SelectItem></SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { const a = (art.attributes || []).filter((_, j) => j !== i); updateArtwork(art.id, { attributes: a }); }}><X className="w-4 h-4" /></Button>
                        </div>
                      ))}
                      {(!art.attributes || art.attributes.length === 0) && <p className="text-xs text-muted-foreground text-center py-2 border border-dashed border-border/50 rounded-lg">No traits added yet</p>}
                    </div>
                    <Button size="sm" className="w-full" onClick={() => setEditingId(null)}><Check className="w-4 h-4 mr-2" />Done Editing</Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* NFT Card Preview Mode */}
      {artworks.length > 0 && isPreviewMode && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <Eye className="w-4 h-4 text-primary" />
            <span className="text-sm">
              Preview Mode: This is how your NFTs will appear in the marketplace
            </span>
          </div>

          <ScrollArea className="h-[500px] pr-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {artworks.map((artwork, index) => (
                <Card
                  key={artwork.id}
                  className="group overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1 cursor-pointer"
                >
                  {/* NFT Image */}
                  <div className="aspect-square relative overflow-hidden">
                    {artwork.imageUrl ? (
                      <img
                        src={artwork.imageUrl}
                        alt={artwork.name}
                        className="w-full h-full object-contain transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <ImageIcon className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}

                    {/* Verified Badge Placeholder */}
                    <div className="absolute top-3 left-3">
                      <Badge className="bg-primary/90 hover:bg-primary text-primary-foreground text-xs">
                        LilyPad
                      </Badge>
                    </div>
                  </div>

                  {/* NFT Info */}
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="text-base truncate">
                      {artwork.name || `Token #${index + 1}`}
                    </CardTitle>
                    <CardDescription className="text-xs truncate">
                      {collectionType === "one_of_one" ? "1 of 1" : "Edition"}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pb-3">
                    {artwork.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {artwork.description}
                      </p>
                    )}

                    {/* Traits Display */}
                    {artwork.attributes && artwork.attributes.length > 0 && (
                      <div className="mb-3 space-y-1">
                        <p className="text-xs font-medium flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Traits
                        </p>
                        <div className="grid grid-cols-2 gap-1">
                          {artwork.attributes.slice(0, 4).map((attr, i) => (
                            <div
                              key={i}
                              className={`p-1.5 rounded text-center border ${attr.rarity === "legendary" ? "bg-yellow-500/10 border-yellow-500/30" :
                                attr.rarity === "epic" ? "bg-purple-500/10 border-purple-500/30" :
                                  attr.rarity === "rare" ? "bg-blue-500/10 border-blue-500/30" :
                                    attr.rarity === "uncommon" ? "bg-green-500/10 border-green-500/30" :
                                      "bg-muted/50 border-border"
                                }`}
                            >
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wide truncate">
                                {attr.trait_type}
                              </p>
                              <p className={`text-[10px] font-medium truncate ${attr.rarity === "legendary" ? "text-yellow-600" :
                                attr.rarity === "epic" ? "text-purple-600" :
                                  attr.rarity === "rare" ? "text-blue-600" :
                                    attr.rarity === "uncommon" ? "text-green-600" :
                                      ""
                                }`}>
                                {attr.value}
                              </p>
                            </div>
                          ))}
                        </div>
                        {artwork.attributes.length > 4 && (
                          <p className="text-[10px] text-muted-foreground text-center">
                            +{artwork.attributes.length - 4} more traits
                          </p>
                        )}
                      </div>
                    )}

                    {/* Mock Price Display */}
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Price</span>
                      <span className="font-bold">-- {chainSymbol}</span>
                    </div>

                    {/* Mock Buy Button */}
                    <Button className="w-full" size="sm" variant="outline" disabled>
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Buy Now
                    </Button>

                    {/* Token ID indicator */}
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground text-center">
                        Token ID: #{index + 1}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Empty State */}
      {artworks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            No artwork uploaded yet.
            {collectionType === "one_of_one"
              ? " Upload unique images for each NFT in your collection."
              : " Upload your edition artwork."}
          </p>
        </div>
      )}

      {/* Batch Edit Modal */}
      <Dialog open={isBatchEditOpen} onOpenChange={setIsBatchEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Batch Edit {selectedIds.size} Artwork{selectedIds.size !== 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              Apply naming patterns and descriptions to multiple artworks at once.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Naming Pattern */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Type className="w-4 h-4" />
                Naming Pattern
              </Label>
              <Select value={namingPattern} onValueChange={(v) => setNamingPattern(v as NamingPattern)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prefix">Add Prefix</SelectItem>
                  <SelectItem value="suffix">Add Suffix</SelectItem>
                  <SelectItem value="replace">Replace Name</SelectItem>
                  <SelectItem value="numbered">Numbered Sequence</SelectItem>
                </SelectContent>
              </Select>

              <Input
                value={batchNameValue}
                onChange={(e) => setBatchNameValue(e.target.value)}
                placeholder={
                  namingPattern === "prefix" ? "Prefix text..." :
                    namingPattern === "suffix" ? "Suffix text..." :
                      namingPattern === "replace" ? "New name..." :
                        "Base name (e.g., 'Cosmic Frog')"
                }
              />

              {namingPattern === "numbered" && (
                <div className="flex items-center gap-2">
                  <Label className="flex items-center gap-2 whitespace-nowrap">
                    <Hash className="w-4 h-4" />
                    Start at:
                  </Label>
                  <Input
                    type="number"
                    value={startNumber}
                    onChange={(e) => setStartNumber(parseInt(e.target.value) || 1)}
                    className="w-24"
                    min={1}
                  />
                </div>
              )}

              {/* Preview */}
              {batchNameValue && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                  <p className="text-sm font-medium">
                    {namingPattern === "prefix" && `${batchNameValue} [original name]`}
                    {namingPattern === "suffix" && `[original name] ${batchNameValue}`}
                    {namingPattern === "replace" && batchNameValue}
                    {namingPattern === "numbered" && `${batchNameValue} #${startNumber}`}
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="applyDescription"
                  checked={applyDescription}
                  onCheckedChange={(checked) => setApplyDescription(checked === true)}
                />
                <Label htmlFor="applyDescription" className="flex items-center gap-2 cursor-pointer">
                  <FileText className="w-4 h-4" />
                  Update Description
                </Label>
              </div>

              {applyDescription && (
                <Textarea
                  value={batchDescription}
                  onChange={(e) => setBatchDescription(e.target.value)}
                  placeholder="Enter description for all selected artworks..."
                  rows={3}
                />
              )}
            </div>

            {/* Bulk Traits */}
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="applyTraits"
                  checked={applyTraits}
                  onCheckedChange={(checked) => setApplyTraits(checked === true)}
                />
                <Label htmlFor="applyTraits" className="flex items-center gap-2 cursor-pointer">
                  <Tag className="w-4 h-4" />
                  Update Traits
                </Label>
              </div>

              {applyTraits && (
                <div className="space-y-3">
                  <Select value={traitMode} onValueChange={(v) => setTraitMode(v as typeof traitMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="append">Append (add new traits)</SelectItem>
                      <SelectItem value="replace">Replace (overwrite all traits)</SelectItem>
                      <SelectItem value="remove">Remove (delete matching traits)</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="space-y-2">
                    {batchTraits.map((trait, index) => (
                      <div key={index} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-1">
                          <Input
                            value={trait.trait_type}
                            onChange={(e) => updateBatchTrait(index, { trait_type: e.target.value })}
                            placeholder="Trait type (e.g., Background)"
                            className="h-8 text-sm"
                          />
                          {traitMode !== "remove" && (
                            <Input
                              value={trait.value}
                              onChange={(e) => updateBatchTrait(index, { value: e.target.value })}
                              placeholder="Value (e.g., Blue)"
                              className="h-8 text-sm"
                            />
                          )}
                        </div>
                        {traitMode !== "remove" && (
                          <Select
                            value={trait.rarity || "common"}
                            onValueChange={(v) => updateBatchTrait(index, { rarity: v as TraitAttribute["rarity"] })}
                          >
                            <SelectTrigger className="w-24 h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="common">Common</SelectItem>
                              <SelectItem value="uncommon">Uncommon</SelectItem>
                              <SelectItem value="rare">Rare</SelectItem>
                              <SelectItem value="epic">Epic</SelectItem>
                              <SelectItem value="legendary">Legendary</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeBatchTrait(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={addBatchTrait}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Trait
                    </Button>

                    {batchTraits.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center">
                        {traitMode === "remove"
                          ? "Add trait types to remove from selected artworks"
                          : "Add traits to apply to selected artworks"}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBatchEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyBatchEdit}>
              <Check className="w-4 h-4 mr-2" />
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
