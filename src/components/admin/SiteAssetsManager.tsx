import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Image as ImageIcon,
  Trash2,
  Upload,
  Copy,
  Search,
  ExternalLink,
  Plus,
  Loader2,
  ImageIcon as LucideImage
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface SiteAsset {
  id: string;
  asset_key: string;
  asset_url: string;
  asset_type: "image" | "video";
  page: "landing" | "footer" | "auth" | "marketplace" | "global" | string;
  description: string | null;
  created_at: string;
}

const STORAGE_BUCKET = "collection-images";

export const SiteAssetsManager: React.FC = () => {
  const [assets, setAssets] = useState<SiteAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Upload State
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [assetKey, setAssetKey] = useState("");
  const [assetPage, setAssetPage] = useState("global");
  const [description, setDescription] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from("site_assets" as any)
        .select("*")
        .order("created_at", { ascending: false })) as { data: SiteAsset[] | null; error: any };

      if (error) throw error;
      setAssets(data || []);
    } catch (error) {
      console.error("Error fetching site assets:", error);
      toast({
        title: "Error",
        description: "Failed to load assets",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);

      // Auto-generate key from filename if empty
      if (!assetKey) {
        const name = file.name.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
        setAssetKey(name);
      }

      // Create preview
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !assetKey) {
      toast({
        title: "Validation Error",
        description: "Please select a file and provide a key",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      // 1. Upload to Storage
      const fileExt = selectedFile.name.split('.').pop();
      const { data: { user: uploader } } = await supabase.auth.getUser();
      if (!uploader) throw new Error('Sign in again to upload');
      const fileName = `${uploader.id}/site-assets/${assetPage}/${assetKey}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, selectedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(fileName);

      // 3. Save to Database
      const { error: dbError } = await (supabase
        .from("site_assets" as any)
        .insert({
          asset_key: assetKey,
          asset_url: publicUrl,
          asset_type: selectedFile.type.startsWith('video/') ? 'video' : 'image',
          page: assetPage,
          description: description || null
        })) as { error: any };

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "Asset uploaded successfully",
      });

      setUploadModalOpen(false);
      resetForm();
      fetchAssets();

    } catch (error: any) {
      console.error("Upload failed:", error);

      let errorMessage = error.message || "Could not upload asset";

      // Specifically handle bucket not found error to guide the user
      if (errorMessage.includes("bucket not found") || errorMessage.includes("not found")) {
        errorMessage = "Storage bucket 'site-assets' not found. Please create it in Supabase.";
      }

      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (asset: SiteAsset) => {
    if (!confirm(`Are you sure you want to delete ${asset.asset_key}? This cannot be undone.`)) return;

    try {
      // 1. Delete from DB
      const { error: dbError } = await (supabase
        .from("site_assets" as any)
        .delete()
        .eq("id", asset.id)) as { error: any };

      if (dbError) throw dbError;

      // 2. Try to delete from storage (optional, best effort)
      try {
        const urlObj = new URL(asset.asset_url);
        // Extract path after bucket name
        // Example: .../site-assets/landing/banner.jpg -> landing/banner.jpg
        const pathParts = urlObj.pathname.split(`/${STORAGE_BUCKET}/`);
        if (pathParts.length > 1) {
          const path = pathParts[1];
          await supabase.storage.from(STORAGE_BUCKET).remove([decodeURIComponent(path)]);
        }
      } catch (e) {
        console.warn("Could not delete file from storage, only DB record removed", e);
      }

      toast({
        title: "Deleted",
        description: "Asset removed successfully"
      });
      fetchAssets();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete asset",
        variant: "destructive"
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "URL copied to clipboard"
    });
  };

  const resetForm = () => {
    setSelectedFile(null);
    setAssetKey("");
    setAssetPage("global");
    setDescription("");
    setPreviewUrl(null);
  };

  const filteredAssets = assets.filter(a =>
    a.asset_key.toLowerCase().includes(search.toLowerCase()) ||
    a.page.toLowerCase().includes(search.toLowerCase()) ||
    (a.description && a.description.toLowerCase().includes(search.toLowerCase()))
  );

  const groupedAssets = {
    all: filteredAssets,
    landing: filteredAssets.filter(a => a.page === "landing"),
    footer: filteredAssets.filter(a => a.page === "footer"),
    marketplace: filteredAssets.filter(a => a.page === "marketplace"),
    global: filteredAssets.filter(a => a.page === "global"),
    auth: filteredAssets.filter(a => a.page === "auth"),
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LucideImage className="w-5 h-5 text-primary" />
              Site Assets & Branding
            </CardTitle>
            <CardDescription>
              Manage images and videos used across the site (Landing page, Footer, Banners)
            </CardDescription>
          </div>
          <Button onClick={() => { resetForm(); setUploadModalOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Upload New Asset
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search assets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="mb-4 flex flex-wrap h-auto gap-2">
              <TabsTrigger value="all">All Assets</TabsTrigger>
              <TabsTrigger value="landing">Landing Page</TabsTrigger>
              <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
              <TabsTrigger value="footer">Footer</TabsTrigger>
              <TabsTrigger value="auth">Auth Pages</TabsTrigger>
              <TabsTrigger value="global">Global</TabsTrigger>
            </TabsList>

            {Object.entries(groupedAssets).map(([key, list]) => (
              <TabsContent key={key} value={key} className="mt-0">
                {list.length === 0 ? (
                  <div className="text-center py-12 border border-dashed rounded-lg bg-muted/50">
                    <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground">No assets found in this category</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {list.map((asset) => (
                      <Card key={asset.id} className="overflow-hidden group border-muted hover:border-primary/50 transition-colors">
                        <div className="aspect-video relative bg-muted flex items-center justify-center overflow-hidden">
                          {asset.asset_type === 'video' ? (
                            <div className="flex flex-col items-center text-muted-foreground">
                              <ExternalLink className="w-8 h-8 mb-2" />
                              <span className="text-xs">Video Asset</span>
                            </div>
                          ) : (
                            <img
                              src={asset.asset_url}
                              alt={asset.asset_key}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://placehold.co/600x400?text=Image+Error';
                              }}
                            />
                          )}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button size="icon" variant="secondary" onClick={() => window.open(asset.asset_url, '_blank')} title="Open Original">
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="secondary" onClick={() => copyToClipboard(asset.asset_url)} title="Copy URL">
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="destructive" onClick={() => handleDelete(asset)} title="Delete Asset">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 w-full">
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-medium truncate text-sm" title={asset.asset_key}>{asset.asset_key}</p>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mb-2" title={asset.description || ''}>
                                {asset.description || 'No description'}
                              </p>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px] px-1 h-5 capitalize">{asset.page}</Badge>
                                <span className="text-[10px] text-muted-foreground ml-auto">
                                  {format(new Date(asset.created_at), 'MMM d, yyyy')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </CardContent>

      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload New Asset</DialogTitle>
            <DialogDescription>
              Upload a branding image or asset to be used on the site.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Asset Key (Unique Name)</Label>
              <Input
                value={assetKey}
                onChange={(e) => setAssetKey(e.target.value)}
                placeholder="e.g., home-hero-banner"
              />
              <p className="text-xs text-muted-foreground">This ID is used to find the image in the code.</p>
            </div>

            <div className="space-y-2">
              <Label>Category / Page</Label>
              <Select value={assetPage} onValueChange={setAssetPage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (All Pages)</SelectItem>
                  <SelectItem value="landing">Landing Page</SelectItem>
                  <SelectItem value="footer">Footer</SelectItem>
                  <SelectItem value="marketplace">Marketplace</SelectItem>
                  <SelectItem value="auth">Auth Pages</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Main hero background image"
              />
            </div>

            <div className="space-y-2">
              <Label>File</Label>
              <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors relative">
                <Input
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleFileSelect}
                  accept="image/*,video/*"
                />

                {previewUrl ? (
                  <div className="relative w-full aspect-video rounded-md overflow-hidden bg-background">
                    <img src={previewUrl} className="w-full h-full object-contain" alt="Preview" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                      <p className="text-white font-medium">Click to change</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Click to select file</p>
                    <p className="text-xs text-muted-foreground">Images or small videos</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Upload Asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
