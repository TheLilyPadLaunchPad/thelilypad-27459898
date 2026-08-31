import React, { useState, useEffect, useCallback } from "react";
import { uploadShopItemFile, getShopItemUrl } from "@/lib/shopItemsUpload";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, Upload, Sticker, Plus, Trash2, X, GripVertical, Globe, HardDrive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useShopMint } from "@/hooks/useShopMint";

interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_mon: number;
  category: string;
  tier: string;
  total_sales: number;
  creator_id: string;
  is_active: boolean;
  created_at: string;
}

interface StickerContent {
  id: string;
  item_id: string;
  name: string;
  file_url: string;
  arweave_uri?: string | null;
  metadata_uri?: string | null;
  display_order: number;
  created_at: string;
}

interface ManageStickerPackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pack: ShopItem;
  onUpdate: () => void;
}

export const ManageStickerPackModal: React.FC<ManageStickerPackModalProps> = ({
  open,
  onOpenChange,
  pack,
  onUpdate,
}) => {
  const [stickers, setStickers] = useState<StickerContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [newStickerName, setNewStickerName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploadToChain, setUploadToChain] = useState(true);
  const { uploadStickerToArweave } = useShopMint();

  const fetchStickers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("shop_item_contents")
        .select("*")
        .eq("item_id", pack.id)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setStickers(data || []);
    } catch (err) {
      console.error("Error fetching stickers:", err);
      toast.error("Failed to load stickers");
    } finally {
      setIsLoading(false);
    }
  }, [pack.id]);

  useEffect(() => {
    if (open) {
      fetchStickers();
    }
  }, [open, fetchStickers]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      // Auto-fill name from filename if empty
      if (!newStickerName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setNewStickerName(nameWithoutExt);
      }
    }
  };

  const handleUploadSticker = async () => {
    if (!selectedFile) {
      toast.error("Please select a sticker image");
      return;
    }

    if (!newStickerName.trim()) {
      toast.error("Please enter a sticker name");
      return;
    }

    setIsUploading(true);
    try {
      // Upload via signed upload URL (fallback / preview URL)
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${pack.creator_id}/${pack.id}/${Date.now()}-sticker.${fileExt}`;

      const storedPath = await uploadShopItemFile(fileName, selectedFile);
      const publicUrl = getShopItemUrl(storedPath);


      // Optionally upload to Arweave for on-chain cNFT backing
      let arweaveUri: string | null = null;
      let metadataUri: string | null = null;

      if (uploadToChain) {
        try {
          toast.loading("Uploading to Arweave (permanent)…", { id: "arweave-sticker" });
          const result = await uploadStickerToArweave(
            selectedFile,
            newStickerName.trim(),
            pack.name,
            pack.category,
          );
          arweaveUri = result.arweaveUri;
          metadataUri = result.metadataUri;
          toast.dismiss("arweave-sticker");
        } catch (arweaveErr) {
          console.warn("Arweave upload failed, continuing with Supabase URL:", arweaveErr);
          toast.dismiss("arweave-sticker");
          toast.warning("Arweave upload failed — saved with Supabase URL only");
        }
      }

      // Add to database
      const { error } = await supabase.from("shop_item_contents").insert({
        item_id: pack.id,
        name: newStickerName.trim(),
        file_url: arweaveUri || publicUrl,
        display_order: stickers.length,
        arweave_uri: arweaveUri,
        metadata_uri: metadataUri,
      });

      if (error) throw error;

      toast.success(arweaveUri ? "Sticker added (on-chain ready)!" : "Sticker added!");
      setNewStickerName("");
      setSelectedFile(null);
      setFilePreview(null);
      fetchStickers();
      onUpdate();
    } catch (err) {
      console.error("Error uploading sticker:", err);
      toast.error("Failed to upload sticker");
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Backfill: take a sticker that was stored off-chain only and push its
   * artwork + metadata to Arweave so it can be minted as a cNFT on purchase.
   */
  const handleMakeOnChain = async (sticker: StickerContent) => {
    setPreparingId(sticker.id);
    try {
      toast.loading(`Preparing ${sticker.name} for on-chain…`, { id: "prep-sticker" });
      const res = await fetch(sticker.file_url);
      if (!res.ok) throw new Error("Could not read sticker image");
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const file = new File([blob], `${sticker.name}.${ext}`, { type: blob.type });

      const { arweaveUri, metadataUri } = await uploadStickerToArweave(
        file,
        sticker.name,
        pack.name,
        pack.category,
      );

      const { error } = await supabase
        .from("shop_item_contents")
        .update({ arweave_uri: arweaveUri, metadata_uri: metadataUri })
        .eq("id", sticker.id);
      if (error) throw error;

      setStickers((prev) =>
        prev.map((s) =>
          s.id === sticker.id ? { ...s, arweave_uri: arweaveUri, metadata_uri: metadataUri } : s,
        ),
      );
      toast.success(`${sticker.name} is now on-chain ready`, { id: "prep-sticker" });
      onUpdate();
    } catch (err) {
      console.error("Make on-chain failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to prepare sticker", {
        id: "prep-sticker",
      });
    } finally {
      setPreparingId(null);
    }
  };

  const handlePrepareAll = async () => {
    const pending = stickers.filter((s) => !s.metadata_uri);
    for (const s of pending) {
      // sequential: each upload needs its own wallet-funded Irys transaction
      await handleMakeOnChain(s);
    }
  };

  const handleDeleteSticker = async (sticker: StickerContent) => {
    if (!confirm("Delete this sticker?")) return;


    try {
      const { error } = await supabase
        .from("shop_item_contents")
        .delete()
        .eq("id", sticker.id);

      if (error) throw error;

      setStickers(prev => prev.filter(s => s.id !== sticker.id));
      toast.success("Sticker deleted");
      onUpdate();
    } catch (err) {
      console.error("Error deleting sticker:", err);
      toast.error("Failed to delete sticker");
    }
  };

  const clearFileSelection = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setNewStickerName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sticker className="w-5 h-5 text-primary" />
            Manage: {pack.name}
          </DialogTitle>
          <DialogDescription>
            Add or remove stickers from this pack
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Add Sticker Section */}
          <Card>
            <CardContent className="pt-4">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add New Sticker
              </h4>
              
              <div className="flex gap-4">
                {/* File Preview */}
                <div 
                  className="w-24 h-24 flex-shrink-0 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors cursor-pointer relative overflow-hidden"
                  onClick={() => document.getElementById("sticker-upload")?.click()}
                >
                  {filePreview ? (
                    <>
                      <img
                        src={filePreview}
                        alt="Preview"
                        className="w-full h-full object-contain p-2"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clearFileSelection();
                        }}
                        className="absolute top-1 right-1 p-1 rounded-full bg-background/80 hover:bg-background"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <Upload className="w-6 h-6 mb-1" />
                      <span className="text-xs">Upload</span>
                    </div>
                  )}
                </div>
                <input
                  id="sticker-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {/* Name and Upload */}
                <div className="flex-1 space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="sticker-name" className="text-xs">Sticker Name</Label>
                    <Input
                      id="sticker-name"
                      value={newStickerName}
                      onChange={(e) => setNewStickerName(e.target.value)}
                      placeholder="e.g., Happy Frog"
                      maxLength={50}
                    />
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <Button
                      type="button"
                      variant={uploadToChain ? "default" : "outline"}
                      size="sm"
                      className="flex-1 gap-1 text-xs h-7"
                      onClick={() => setUploadToChain(true)}
                    >
                      <Globe className="w-3 h-3" />
                      On-Chain (Arweave)
                    </Button>
                    <Button
                      type="button"
                      variant={!uploadToChain ? "default" : "outline"}
                      size="sm"
                      className="flex-1 gap-1 text-xs h-7"
                      onClick={() => setUploadToChain(false)}
                    >
                      <HardDrive className="w-3 h-3" />
                      Off-Chain Only
                    </Button>
                  </div>
                  <Button
                    onClick={handleUploadSticker}
                    disabled={isUploading || !selectedFile}
                    size="sm"
                    className="w-full"
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Add Sticker
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Stickers List */}
          <div className="flex-1 overflow-hidden">
            <h4 className="font-medium mb-3">
              Stickers ({stickers.length})
            </h4>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : stickers.length > 0 ? (
              <ScrollArea className="h-[300px]">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 pr-4">
                  {stickers.map((sticker) => (
                    <div
                      key={sticker.id}
                      className="relative group rounded-lg border bg-muted/30 overflow-hidden"
                    >
                      <div className="aspect-square p-2">
                        <img
                          src={sticker.file_url}
                          alt={sticker.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="p-2 pt-0">
                        <p className="text-xs font-medium truncate text-center">
                          {sticker.name}
                        </p>
                        {sticker.arweave_uri && (
                          <Badge variant="outline" className="w-full justify-center text-[9px] mt-1 gap-1 text-green-500 border-green-500/30">
                            <Globe className="w-2.5 h-2.5" />
                            On-Chain
                          </Badge>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteSticker(sticker)}
                        className="absolute top-1 right-1 p-1.5 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Sticker className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No stickers yet. Add your first one above!</p>
              </div>
            )}
          </div>
        </div>

        {/* Close Button */}
        <div className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};