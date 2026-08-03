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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, Sticker } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CreateStickerPackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  onSuccess: () => void;
}

export const CreateStickerPackModal: React.FC<CreateStickerPackModalProps> = ({
  open,
  onOpenChange,
  userId,
  onSuccess,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState("basic");
  const [price, setPrice] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userId) {
      toast.error("You must be signed in");
      return;
    }

    if (!name.trim()) {
      toast.error("Please enter a name");
      return;
    }

    setIsSubmitting(true);
    try {
      let imageUrl: string | null = null;

      // Upload image via signed upload URL if provided
      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop();
        const fileName = `${userId}/${Date.now()}-pack-cover.${fileExt}`;
        const storedPath = await uploadShopItemFile(fileName, imageFile);
        imageUrl = getShopItemUrl(storedPath);
      }


      // Create the sticker pack
      const { error } = await supabase.from("shop_items").insert({
        creator_id: userId,
        name: name.trim(),
        description: description.trim() || null,
        image_url: imageUrl,
        category: "sticker_pack",
        tier,
        price_mon: parseFloat(price) || 0,
        is_active: true,
      });

      if (error) throw error;

      toast.success("Sticker pack created!");
      onSuccess();
      handleClose();
    } catch (err) {
      console.error("Error creating pack:", err);
      toast.error("Failed to create sticker pack");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setTier("basic");
    setPrice("");
    setImageFile(null);
    setImagePreview(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sticker className="w-5 h-5 text-primary" />
            Create Sticker Pack
          </DialogTitle>
          <DialogDescription>
            Create a new sticker pack to sell to your fans
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cover Image */}
          <div className="space-y-2">
            <Label>Cover Image</Label>
            <div
              className="aspect-video relative overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById("pack-cover-input")?.click()}
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
              id="pack-cover-input"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Pack Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Cute Frogs Pack"
              maxLength={50}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your sticker pack..."
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Tier and Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tier">Tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="exclusive">Exclusive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price (USDC)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0 = Free"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Create Pack
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};