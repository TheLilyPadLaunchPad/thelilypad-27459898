import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadShopItemFile, getShopItemUrl } from "@/lib/shopItemsUpload";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Sticker,
  Smile,
  Upload,
  X,
  GripVertical,
  Image,
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Star,
  Lock,
} from "lucide-react";

interface Collection {
  id: string;
  name: string;
  symbol: string;
}

interface ContentFile {
  id: string;
  file: File;
  preview: string;
  name: string;
}

interface CreateShopItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  editItemId?: string | null;
  onSuccess: () => void;
}

const STEPS = ["Basic Info", "Upload Content", "Pricing", "Review"];

export const CreateShopItemModal: React.FC<CreateShopItemModalProps> = ({
  open,
  onOpenChange,
  userId,
  editItemId,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"sticker_pack" | "emoji_pack">("sticker_pack");
  const [tier, setTier] = useState<"free" | "basic" | "premium" | "exclusive">("basic");
  const [priceMon, setPriceMon] = useState("0");
  const [requiredCollectionId, setRequiredCollectionId] = useState<string>("");
  const [linkedCollectionId, setLinkedCollectionId] = useState<string>("");

  const [isActive, setIsActive] = useState(true);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>("");
  const [contentFiles, setContentFiles] = useState<ContentFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch user's collections for holder exclusivity
  useEffect(() => {
    const fetchCollections = async () => {
      const { data } = await supabase
        .from("collections")
        .select("id, name, symbol")
        .eq("creator_id", userId)
        .order("name");

      setCollections(data || []);
    };

    if (open && userId) {
      fetchCollections();
    }
  }, [open, userId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setStep(0);
      setName("");
      setDescription("");
      setCategory("sticker_pack");
      setTier("basic");
      setPriceMon("0");
      setRequiredCollectionId("");
      setIsActive(true);
      setCoverImage(null);
      setCoverPreview("");
      setContentFiles([]);
      setUploadProgress(0);
    }
  }, [open]);

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverImage(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleContentFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles: ContentFile[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      name: file.name.replace(/\.[^/.]+$/, ""),
    }));
    setContentFiles((prev) => [...prev, ...newFiles]);
  };

  const removeContentFile = (id: string) => {
    setContentFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateContentFileName = (id: string, newName: string) => {
    setContentFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, name: newName } : f))
    );
  };

  const canProceed = () => {
    switch (step) {
      case 0:
        return name.trim().length > 0;
      case 1:
        return contentFiles.length > 0;
      case 2:
        return tier === "free" || (priceMon && Number(priceMon) > 0);
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    if (!userId) return;
    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      // Upload cover image via signed upload URL
      let coverUrl = "";
      if (coverImage) {
        const coverPath = `${userId}/${crypto.randomUUID()}-cover.${coverImage.name.split(".").pop()}`;
        const storedPath = await uploadShopItemFile(coverPath, coverImage);
        coverUrl = getShopItemUrl(storedPath);
      }


      setUploadProgress(20);

      // Create shop item
      const { data: itemData, error: itemError } = await supabase
        .from("shop_items")
        .insert({
          creator_id: userId,
          name: name.trim(),
          description: description.trim() || null,
          image_url: coverUrl || null,
          category,
          tier,
          price_mon: tier === "free" ? 0 : Number(priceMon),
          required_collection_id: requiredCollectionId || null,
          collection_id: linkedCollectionId || null,

          is_active: isActive,
        })
        .select()
        .single();

      if (itemError) throw itemError;

      setUploadProgress(40);

      // Upload content files
      const totalFiles = contentFiles.length;
      for (let i = 0; i < contentFiles.length; i++) {
        const contentFile = contentFiles[i];
        const filePath = `${userId}/${itemData.id}/${crypto.randomUUID()}.${contentFile.file.name.split(".").pop()}`;

        const storedPath = await uploadShopItemFile(filePath, contentFile.file);

        // Insert content record
        const { error: contentError } = await supabase
          .from("shop_item_contents")
          .insert({
            item_id: itemData.id,
            file_url: getShopItemUrl(storedPath),

            name: contentFile.name,
            display_order: i,
          });

        if (contentError) throw contentError;

        setUploadProgress(40 + ((i + 1) / totalFiles) * 60);
      }

      toast({
        title: "Success!",
        description: `Your ${category === "emoji_pack" ? "emoji pack" : "sticker pack"} has been created.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating shop item:", error);
      toast({
        title: "Error",
        description: "Failed to create shop item. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {category === "emoji_pack" ? (
              <Smile className="w-5 h-5" />
            ) : (
              <Sticker className="w-5 h-5" />
            )}
            Create {category === "emoji_pack" ? "Emoji Pack" : "Sticker Pack"}
          </DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-6">
          {STEPS.map((stepName, i) => (
            <div key={stepName} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "bg-primary/20 text-primary border-2 border-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
              >
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-12 sm:w-20 h-0.5 mx-1 ${i < step ? "bg-primary" : "bg-muted"
                    }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mb-6">
          {STEPS.map((stepName) => (
            <span key={stepName} className="text-center w-16 sm:w-auto">
              {stepName}
            </span>
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[300px]">
          {/* Step 1: Basic Info */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Pack Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Froggy Vibes"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your pack..."
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div>
                <Label>Category</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setCategory("sticker_pack")}
                    className={`p-4 rounded-lg border-2 transition-colors ${category === "sticker_pack"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                      }`}
                  >
                    <Sticker className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <p className="font-medium">Sticker Pack</p>
                    <p className="text-xs text-muted-foreground">Static or animated stickers</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategory("emoji_pack")}
                    className={`p-4 rounded-lg border-2 transition-colors ${category === "emoji_pack"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                      }`}
                  >
                    <Smile className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <p className="font-medium">Emoji Pack</p>
                    <p className="text-xs text-muted-foreground">Custom chat emojis</p>
                  </button>
                </div>
              </div>

              <div>
                <Label>Cover Image</Label>
                <div className="mt-2">
                  {coverPreview ? (
                    <div className="relative w-32 h-32">
                      <img
                        src={coverPreview}
                        alt="Cover"
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCoverImage(null);
                          setCoverPreview("");
                        }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                      <Image className="w-8 h-8 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground mt-1">Upload</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCoverChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Upload Content */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label>Upload {category === "emoji_pack" ? "Emojis" : "Stickers"} *</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Upload PNG, GIF, or WebP files. You can upload multiple files at once.
                </p>

                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground mt-2">
                    Click to upload or drag and drop
                  </span>
                  <span className="text-xs text-muted-foreground">PNG, GIF, WebP</span>
                  <input
                    type="file"
                    accept="image/png,image/gif,image/webp"
                    multiple
                    onChange={handleContentFilesChange}
                    className="hidden"
                  />
                </label>
              </div>

              {contentFiles.length > 0 && (
                <div className="space-y-2">
                  <Label>{contentFiles.length} files uploaded</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto p-2">
                    {contentFiles.map((file, index) => (
                      <div
                        key={file.id}
                        className="relative group bg-muted/50 rounded-lg p-2"
                      >
                        <img
                          src={file.preview}
                          alt={file.name}
                          className="w-full aspect-square object-contain rounded"
                        />
                        <Input
                          value={file.name}
                          onChange={(e) => updateContentFileName(file.id, e.target.value)}
                          className="mt-2 text-xs h-7"
                          placeholder="Name"
                        />
                        <button
                          type="button"
                          onClick={() => removeContentFile(file.id)}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Pricing */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <Label>Tier</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {[
                    { value: "free", label: "Free", icon: Star, desc: "Available to everyone" },
                    { value: "basic", label: "Basic", icon: Star, desc: "Standard pricing" },
                    { value: "premium", label: "Premium", icon: Crown, desc: "Higher value pack" },
                    { value: "exclusive", label: "Exclusive", icon: Crown, desc: "Limited availability" },
                  ].map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTier(t.value as any)}
                      className={`p-3 rounded-lg border-2 transition-colors text-left ${tier === t.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <t.icon className="w-4 h-4 text-primary" />
                        <span className="font-medium">{t.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {tier !== "free" && (
                <div>
                  <Label htmlFor="price">Price in $SOL *</Label>
                  <div className="relative mt-1">
                    <Input
                      id="price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceMon}
                      onChange={(e) => setPriceMon(e.target.value)}
                      className="pr-16"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      SOL
                    </span>
                  </div>
                </div>
              )}

              <div>
                <Label>Holder Exclusive (Optional)</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Restrict this pack to holders of one of your NFT collections.
                </p>
                <Select
                  value={requiredCollectionId || "__none__"}
                  onValueChange={(v) => setRequiredCollectionId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No restriction (public)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No restriction (public)</SelectItem>
                    {collections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <div className="flex items-center gap-2">
                          <Lock className="w-3 h-3" />
                          {c.name} ({c.symbol})
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Active</Label>
                  <p className="text-sm text-muted-foreground">Make this pack available for purchase</p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex gap-4">
                  {coverPreview ? (
                    <img
                      src={coverPreview}
                      alt="Cover"
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center">
                      {category === "emoji_pack" ? (
                        <Smile className="w-8 h-8 text-muted-foreground" />
                      ) : (
                        <Sticker className="w-8 h-8 text-muted-foreground" />
                      )}
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{name || "Untitled Pack"}</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      {description || "No description"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {category === "emoji_pack" ? "Emoji Pack" : "Sticker Pack"}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {tier}
                      </Badge>
                      {requiredCollectionId && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
                          <Lock className="w-3 h-3 mr-1" />
                          Holder Only
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-muted-foreground">Price</p>
                  <p className="font-bold text-lg">
                    {tier === "free" ? "Free" : `${priceMon} SOL`}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-muted-foreground">Contents</p>
                  <p className="font-bold text-lg">
                    {contentFiles.length} {category === "emoji_pack" ? "emojis" : "stickers"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {contentFiles.slice(0, 12).map((file) => (
                  <img
                    key={file.id}
                    src={file.preview}
                    alt={file.name}
                    className="w-full aspect-square object-contain rounded bg-muted/50"
                  />
                ))}
                {contentFiles.length > 12 && (
                  <div className="w-full aspect-square rounded bg-muted/50 flex items-center justify-center text-sm text-muted-foreground">
                    +{contentFiles.length - 12} more
                  </div>
                )}
              </div>

              {isSubmitting && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} />
                  <p className="text-sm text-center text-muted-foreground">
                    Uploading... {Math.round(uploadProgress)}%
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || isSubmitting}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Pack"}
              <Check className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
