import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Plus, Trash2, Edit, Sparkles, Search, Eye, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { FeaturedCollectionsSlideshow } from "@/components/sections/FeaturedCollectionsSlideshow";
import { CuratedCategoryRail } from "@/components/sections/CuratedCategoryRail";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ALL_RAILS, CURATION_CATEGORIES, MONTHLY_RAIL } from "@/config/curation";
import { cn } from "@/lib/utils";

const MAX_MONTHLY_FEATURED = 1;

interface Collection {
  id: string;
  name: string;
  symbol: string;
  image_url: string | null;
  status: string;
  chain: string | null;
}

interface FeaturedCollection {
  id: string;
  collection_id: string;
  feature_type: string;
  start_date: string;
  end_date: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  collection: Collection | null;
}

export const FeaturedCollectionsManager: React.FC = () => {
  const [featuredCollections, setFeaturedCollections] = useState<FeaturedCollection[]>([]);
  const [availableCollections, setAvailableCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collectionSearchTerm, setCollectionSearchTerm] = useState("");

  // Form state
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [featureType, setFeatureType] = useState<string>("featured_nft");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchFeaturedCollections(), fetchAvailableCollections()]);
    setLoading(false);
  };

  const fetchFeaturedCollections = async () => {
    try {
      const { data, error } = await supabase
        .from("featured_collections")
        .select(`
          *,
          collection:collections (
            id,
            name,
            symbol,
            image_url,
            status,
            chain
          )
        `)
        .order("feature_type", { ascending: true })
        .order("display_order", { ascending: true });

      if (error) throw error;
      setFeaturedCollections((data || []) as unknown as FeaturedCollection[]);
    } catch (error) {
      console.error("Error fetching featured collections:", error);
      toast({
        title: "Error",
        description: "Failed to load featured collections",
        variant: "destructive",
      });
    }
  };

  const fetchAvailableCollections = async () => {
    try {
      const { data, error } = await supabase
        .from("collections")
        .select("id, name, symbol, image_url, status, chain")
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (error) throw error;
      setAvailableCollections((data || []) as unknown as Collection[]);
    } catch (error) {
      console.error("Error fetching collections:", error);
    }
  };

  const resetForm = () => {
    setSelectedCollectionId("");
    setFeatureType("featured_nft");
    setStartDate("");
    setEndDate("");
    setDisplayOrder(0);
    setIsActive(true);
    setEditingId(null);
  };

  const openAddModal = (presetType?: string) => {
    resetForm();
    if (presetType) setFeatureType(presetType);
    const today = new Date();
    setStartDate(today.toISOString().split("T")[0]);
    const end =
      presetType === "monthly"
        ? new Date(today.getFullYear(), today.getMonth() + 1, 0)
        : new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    setEndDate(end.toISOString().split("T")[0]);
    setModalOpen(true);
  };

  const openEditModal = (featured: FeaturedCollection) => {
    setEditingId(featured.id);
    setSelectedCollectionId(featured.collection_id);
    setFeatureType(featured.feature_type);
    setStartDate(featured.start_date);
    setEndDate(featured.end_date);
    setDisplayOrder(featured.display_order);
    setIsActive(featured.is_active);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedCollectionId || !startDate || !endDate) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      toast({
        title: "Validation Error",
        description: "End date must be after start date",
        variant: "destructive",
      });
      return;
    }

    try {
      const payload = {
        collection_id: selectedCollectionId,
        feature_type: featureType,
        start_date: startDate,
        end_date: endDate,
        display_order: displayOrder,
        is_active: isActive,
      };

      if (editingId) {
        const { error } = await supabase
          .from("featured_collections")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;
        toast({ title: "Success", description: "Curated pick updated" });
      } else {
        const { error } = await supabase.from("featured_collections").insert(payload);

        if (error) throw error;
        toast({ title: "Success", description: "Collection added to the rail" });
      }

      setModalOpen(false);
      resetForm();
      fetchFeaturedCollections();
    } catch (error: any) {
      console.error("Error saving featured collection:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this collection from the rail?")) return;

    try {
      const { error } = await supabase.from("featured_collections").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Success", description: "Collection removed" });
      fetchFeaturedCollections();
    } catch (error) {
      console.error("Error deleting featured collection:", error);
      toast({
        title: "Error",
        description: "Failed to remove collection",
        variant: "destructive",
      });
    }
  };

  const toggleActive = async (featured: FeaturedCollection) => {
    try {
      const { error } = await supabase
        .from("featured_collections")
        .update({ is_active: !featured.is_active })
        .eq("id", featured.id);

      if (error) throw error;
      fetchFeaturedCollections();
    } catch (error) {
      console.error("Error toggling active status:", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const filteredFeatured = featuredCollections.filter(
    (f) =>
      !collectionSearchTerm ||
      f.collection?.name.toLowerCase().includes(collectionSearchTerm.toLowerCase()) ||
      f.collection?.symbol?.toLowerCase().includes(collectionSearchTerm.toLowerCase())
  );

  const byRail = (railId: string) => filteredFeatured.filter((f) => f.feature_type === railId);

  const activeMonthly = featuredCollections.filter(
    (f) => f.feature_type === "monthly" && f.is_active
  ).length;

  const filteredAvailableCollections = availableCollections.filter(
    (c) =>
      !collectionSearchTerm ||
      c.name.toLowerCase().includes(collectionSearchTerm.toLowerCase()) ||
      c.symbol?.toLowerCase().includes(collectionSearchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const renderRailTable = (railId: string) => {
    const rows = byRail(railId);
    if (rows.length === 0) {
      return <p className="text-muted-foreground text-sm">No collections in this rail yet</p>;
    }
    return (
      <ScrollArea className="h-[220px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Collection</TableHead>
              <TableHead>Chain</TableHead>
              <TableHead>Date Range</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((featured) => (
              <TableRow key={featured.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {featured.collection?.image_url ? (
                      <img
                        src={featured.collection.image_url}
                        alt={featured.collection.name}
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-xs font-bold">
                        {featured.collection?.symbol?.slice(0, 2) || "?"}
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{featured.collection?.name || "Deleted"}</p>
                      <p className="text-xs text-muted-foreground">{featured.collection?.symbol}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="capitalize text-sm">
                  {(featured.collection?.chain || "solana").split("-")[0]}
                </TableCell>
                <TableCell>
                  <span className="text-sm">
                    {format(new Date(featured.start_date), "MMM d")} -{" "}
                    {format(new Date(featured.end_date), "MMM d, yyyy")}
                  </span>
                </TableCell>
                <TableCell>{featured.display_order}</TableCell>
                <TableCell>
                  <Badge
                    variant={featured.is_active ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleActive(featured)}
                  >
                    {featured.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEditModal(featured)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(featured.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Curated Launches
              </CardTitle>
              <CardDescription>
                Hand-pick the collections shown on the homepage and marketplace rails
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-2">
                <Eye className="w-4 h-4" />
                Preview
              </Button>
              <Button onClick={() => openAddModal()} className="gap-2">
                <Plus className="w-4 h-4" />
                Add Pick
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search curated collections..."
              value={collectionSearchTerm}
              onChange={(e) => setCollectionSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Collection of the Month */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-500" />
                {MONTHLY_RAIL.label} ({activeMonthly}/{MAX_MONTHLY_FEATURED} active)
              </h3>
              <Button variant="outline" size="sm" onClick={() => openAddModal("monthly")}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
            {activeMonthly > MAX_MONTHLY_FEATURED && (
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  More than one active monthly pick — only the first will read as the hero.
                </AlertDescription>
              </Alert>
            )}
            {renderRailTable("monthly")}
          </div>

          {/* Category rails */}
          {CURATION_CATEGORIES.map((meta) => {
            const Icon = meta.icon;
            return (
              <div key={meta.id}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Icon className={cn("w-5 h-5", meta.accent)} />
                    {meta.label} ({byRail(meta.id).length})
                  </h3>
                  <Button variant="outline" size="sm" onClick={() => openAddModal(meta.id)}>
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>
                {renderRailTable(meta.id)}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Curated Pick" : "Add Curated Pick"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update where and when this collection is showcased"
                : "Select a collection to showcase in a curated rail"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Collection Select */}
            <div className="space-y-2">
              <Label>Collection *</Label>
              <Select value={selectedCollectionId} onValueChange={setSelectedCollectionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a collection" />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-[200px]">
                    {filteredAvailableCollections.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        <div className="flex items-center gap-2">
                          {collection.image_url ? (
                            <img
                              src={collection.image_url}
                              alt={collection.name}
                              className="w-6 h-6 rounded object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs">
                              {collection.symbol?.slice(0, 2)}
                            </div>
                          )}
                          <span>{collection.name}</span>
                          <Badge variant="outline" className="ml-auto text-xs">
                            {collection.status}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>

            {/* Feature Type */}
            <div className="space-y-2">
              <Label>Rail *</Label>
              <Select value={featureType} onValueChange={setFeatureType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_RAILS.map((rail) => {
                    const Icon = rail.icon;
                    return (
                      <SelectItem key={rail.id} value={rail.id}>
                        <div className="flex items-center gap-2">
                          <Icon className={cn("w-4 h-4", rail.accent)} />
                          {rail.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            {/* Display Order */}
            <div className="space-y-2">
              <Label>Display Order</Label>
              <Input
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                placeholder="0 = first"
              />
              <p className="text-xs text-muted-foreground">Lower numbers appear first</p>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Button
                type="button"
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => setIsActive(!isActive)}
              >
                {isActive ? "Active" : "Inactive"}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>{editingId ? "Update" : "Add Pick"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Landing Page Preview
            </DialogTitle>
            <DialogDescription>
              Preview how the curated rails will appear to visitors
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <FeaturedCollectionsSlideshow
              featureType="monthly"
              title="Collection of the Month"
              subtitle="Our top pick for this month"
              icon={<Crown className="w-5 h-5" />}
              gradientFrom="from-amber-500/20"
              gradientTo="to-orange-500/20"
              autoPlayInterval={6000}
            />
            {CURATION_CATEGORIES.map((meta) => (
              <CuratedCategoryRail key={meta.id} meta={meta} showChainFilter={false} />
            ))}
          </div>

          <DialogFooter>
            <Button onClick={() => setPreviewOpen(false)}>Close Preview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
