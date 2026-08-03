import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, Sticker, Plus, Trash2, Smile, Sparkles, Leaf, Settings, Globe, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useShopMint } from "@/hooks/useShopMint";
import { format } from "date-fns";
import { ManageStickerPackModal } from "@/components/stickers/ManageStickerPackModal";

type PackType = "sticker_pack" | "emote_pack" | "emoji_pack";
type PackBrand = "lilypad" | "frognad" | "custom";

interface OfficialPack {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string;
  tier: string;
  price_mon: number;
  creator_type: string;
  creator_id: string;
  is_active: boolean;
  created_at: string;
  total_sales: number;
  max_editions?: number | null;
  collection_address?: string | null;
  tree_address?: string | null;
}

const packTypeLabels: Record<PackType, { label: string; icon: React.ReactNode }> = {
  sticker_pack: { label: "Sticker Pack", icon: <Sticker className="w-4 h-4" /> },
  emote_pack: { label: "Emote Pack", icon: <Smile className="w-4 h-4" /> },
  emoji_pack: { label: "Emoji Pack", icon: <Sparkles className="w-4 h-4" /> },
};

const brandLabels: Record<PackBrand, { label: string; color: string }> = {
  lilypad: { label: "Lily Pad Official", color: "bg-primary text-primary-foreground" },
  frognad: { label: "Frognad Special", color: "bg-green-500 text-white" },
  custom: { label: "Custom", color: "bg-muted text-muted-foreground" },
};

export const AdminStickerPackManager: React.FC = () => {
  const queryClient = useQueryClient();
  const { deployPackOnChain, isDeploying } = useShopMint();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [selectedPack, setSelectedPack] = useState<OfficialPack | null>(null);
  const [packType, setPackType] = useState<PackType>("sticker_pack");
  const [brand, setBrand] = useState<PackBrand>("lilypad");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState("exclusive");
  const [price, setPrice] = useState("0");
  const [maxEditions, setMaxEditions] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch official packs
  const { data: officialPacks, isLoading } = useQuery({
    queryKey: ['admin-official-packs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shop_items')
        .select('*')
        .eq('creator_type', 'platform')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as OfficialPack[];
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Please enter a name");
      return;
    }

    setIsSubmitting(true);
    try {
      // Get creator ID (auth user or profile id for wallet-only)
      const { data: { user } } = await supabase.auth.getUser();
      const creatorId = user?.id;

      if (!creatorId) {
        throw new Error("You must be signed in to create official packs.");
      }

      let imageUrl: string | null = null;

      // Upload image via signed upload URL (platform folder, admin-only)
      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop();
        const fileName = `platform/${Date.now()}-${brand}-cover.${fileExt}`;
        const storedPath = await uploadShopItemFile(fileName, imageFile);
        imageUrl = getShopItemUrl(storedPath);
      }


      // Create the pack with platform creator_type
      const packName = brand === "lilypad"
        ? `🪷 ${name}`
        : brand === "frognad"
          ? `🐸 ${name}`
          : name;

      const editions = tier === "1of1" ? 1 : (maxEditions ? parseInt(maxEditions) : null);

      const { error } = await supabase.from("shop_items").insert({
        creator_id: creatorId,
        creator_type: "platform",
        name: packName,
        description: description.trim() || null,
        image_url: imageUrl,
        category: packType,
        tier,
        price_mon: parseFloat(price) || 0,
        max_editions: editions,
        is_active: true,
      });

      if (error) throw error;

      toast.success(`${packTypeLabels[packType].label} created!`);
      queryClient.invalidateQueries({ queryKey: ['admin-official-packs'] });
      handleCloseModal();
    } catch (err) {
      console.error("Error creating pack:", err);
      toast.error("Failed to create pack");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this pack?")) return;

    try {
      const { error } = await supabase
        .from('shop_items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success("Pack deleted");
      queryClient.invalidateQueries({ queryKey: ['admin-official-packs'] });
    } catch (err) {
      console.error("Error deleting pack:", err);
      toast.error("Failed to delete pack");
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('shop_items')
        .update({ is_active: !currentActive })
        .eq('id', id);

      if (error) throw error;

      toast.success(currentActive ? "Pack deactivated" : "Pack activated");
      queryClient.invalidateQueries({ queryKey: ['admin-official-packs'] });
    } catch (err) {
      console.error("Error updating pack:", err);
      toast.error("Failed to update pack");
    }
  };

  const handleCloseModal = () => {
    setName("");
    setDescription("");
    setTier("exclusive");
    setPrice("0");
    setMaxEditions("");
    setPackType("sticker_pack");
    setBrand("lilypad");
    setImageFile(null);
    setImagePreview(null);
    setCreateModalOpen(false);
  };

  const handleOpenManage = (pack: OfficialPack) => {
    setSelectedPack(pack);
    setManageModalOpen(true);
  };

  const handleManageUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-official-packs'] });
  };

  const getCategoryBadge = (category: string) => {
    const config = packTypeLabels[category as PackType];
    if (!config) return <Badge variant="outline">{category}</Badge>;
    return (
      <Badge variant="secondary" className="gap-1">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Leaf className="w-5 h-5 text-primary" />
              Official Packs
            </CardTitle>
            <CardDescription>
              Create and manage Lily Pad & Frognad official sticker, emote, and emoji packs
            </CardDescription>
          </div>
          <Button onClick={() => setCreateModalOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Pack
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : officialPacks && officialPacks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pack</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {officialPacks.map((pack) => (
                  <TableRow key={pack.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {pack.image_url ? (
                          <img
                            src={pack.image_url}
                            alt={pack.name}
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <Sticker className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{pack.name}</p>
                          {pack.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {pack.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getCategoryBadge(pack.category)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {pack.tier}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {pack.price_mon > 0 ? `${pack.price_mon} USDC` : 'Free'}
                    </TableCell>
                    <TableCell>
                      {pack.total_sales} {pack.max_editions ? `/ ${pack.max_editions}` : ''}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={pack.is_active ? "default" : "secondary"}>
                          {pack.is_active ? "Active" : "Inactive"}
                        </Badge>
                        {pack.collection_address && (
                          <Badge variant="outline" className="gap-1 text-green-500 border-green-500/30 text-[10px]">
                            <Link2 className="w-3 h-3" />
                            On-Chain
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {format(new Date(pack.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {!pack.collection_address && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                const result = await deployPackOnChain(pack);
                                if (result) {
                                  queryClient.invalidateQueries({ queryKey: ['admin-official-packs'] });
                                }
                              } catch (err) {
                                console.error('Failed to deploy pack on-chain:', err);
                              }
                            }}
                            disabled={isDeploying}
                            className="gap-1 text-green-600 hover:text-green-700"
                          >
                            {isDeploying ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Globe className="w-4 h-4" />
                            )}
                            Deploy On-Chain
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenManage(pack)}
                          className="gap-1"
                        >
                          <Settings className="w-4 h-4" />
                          Manage
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(pack.id, pack.is_active)}
                        >
                          {pack.is_active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(pack.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Leaf className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No official packs created yet</p>
              <p className="text-sm">Create your first Lily Pad or Frognad pack</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Create Modal */}
      <Dialog open={createModalOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Leaf className="w-5 h-5 text-primary" />
              Create Official Pack
            </DialogTitle>
            <DialogDescription>
              Create a new Lily Pad or Frognad official pack
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            {/* Brand Selection */}
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(brandLabels) as PackBrand[]).map((b) => (
                <Button
                  key={b}
                  type="button"
                  variant={brand === b ? "default" : "outline"}
                  className={`gap-2 ${brand === b ? brandLabels[b].color : ''}`}
                  onClick={() => setBrand(b)}
                >
                  {b === "lilypad" && "🪷"}
                  {b === "frognad" && "🐸"}
                  {b === "custom" && "✨"}
                  {brandLabels[b].label.split(' ')[0]}
                </Button>
              ))}
            </div>

            {/* Pack Type */}
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(packTypeLabels) as PackType[]).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={packType === type ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setPackType(type)}
                >
                  {packTypeLabels[type].icon}
                  {packTypeLabels[type].label.split(' ')[0]}
                </Button>
              ))}
            </div>

            {/* Cover Image */}
            <div className="space-y-2">
              <Label>Cover Image</Label>
              <div
                className="aspect-video relative overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => document.getElementById("admin-pack-cover-input")?.click()}
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                    <Upload className="w-8 h-8 mb-2" />
                    <span className="text-sm">Click to upload cover image</span>
                  </div>
                )}
              </div>
              <input
                id="admin-pack-cover-input"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="admin-pack-name">Pack Name *</Label>
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {brand === "lilypad" ? "🪷" : brand === "frognad" ? "🐸" : ""}
                </span>
                <Input
                  id="admin-pack-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Summer Collection"
                  maxLength={50}
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="admin-pack-description">Description</Label>
              <Textarea
                id="admin-pack-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your pack..."
                rows={3}
                maxLength={500}
              />
            </div>

            {/* Tier and Price */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="admin-pack-tier">Tier</Label>
                <Select value={tier} onValueChange={(val) => {
                  setTier(val);
                  if (val === "1of1") setMaxEditions("1");
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="exclusive">Exclusive</SelectItem>
                    <SelectItem value="legendary">Legendary</SelectItem>
                    <SelectItem value="1of1">1of1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-pack-price">Price (USDC)</Label>
                <Input
                  id="admin-pack-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0 = Free"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-pack-editions">Max Editions</Label>
                <Input
                  id="admin-pack-editions"
                  type="number"
                  min="1"
                  step="1"
                  value={tier === "1of1" ? "1" : maxEditions}
                  onChange={(e) => setMaxEditions(e.target.value)}
                  placeholder="Unlimited"
                  disabled={tier === "1of1"}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={handleCloseModal} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Create {packTypeLabels[packType].label}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage Pack Modal */}
      {selectedPack && (
        <ManageStickerPackModal
          open={manageModalOpen}
          onOpenChange={setManageModalOpen}
          pack={selectedPack}
          onUpdate={handleManageUpdate}
        />
      )}
    </Card>
  );
};
