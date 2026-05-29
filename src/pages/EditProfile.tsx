import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/providers/WalletProvider";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import {
  User, ArrowLeft, Save, Plus, Trash2,
  Twitter, Youtube, MessageCircle, Instagram, Music2, Calendar, Tag, X, Upload, ImageIcon, Wallet, CheckCircle
} from "lucide-react";
import { StreamerPlaylistSelector } from "@/components/streaming/StreamerPlaylistSelector";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ImageCropModal } from "@/components/ImageCropModal";
import { LinkedWalletsManager } from "@/components/profile/LinkedWalletsManager";
import { PrivacyToggle } from "@/components/profile/PrivacyToggle";

interface ScheduleItem {
  day: string;
  time: string;
  timezone?: string;
}

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const availableCategories = [
  'Gaming', 'Just Chatting', 'Music', 'Art', 'Cooking',
  'Sports', 'Education', 'Technology', 'Fitness', 'Travel',
  'Comedy', 'News', 'Crypto', 'DeFi', 'NFTs'
];

const EditProfile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { address, isConnected } = useWallet();
  const { profile, loading: profileLoading, saveProfile } = useUserProfile();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isBannerDragging, setIsBannerDragging] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [cropType, setCropType] = useState<'avatar' | 'banner'>('avatar');

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [socialTwitter, setSocialTwitter] = useState("");
  const [socialYoutube, setSocialYoutube] = useState("");
  const [socialDiscord, setSocialDiscord] = useState("");
  const [socialInstagram, setSocialInstagram] = useState("");
  const [socialTiktok, setSocialTiktok] = useState("");
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [payoutWalletAddress, setPayoutWalletAddress] = useState("");
  const [playlistIds, setPlaylistIds] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);

  useSEO({
    title: "Edit Profile | The Lily Pad",
    description: "Customize your profile. Add bio, social links, and profile images."
  });

  useEffect(() => {
    // Check wallet connection
    if (!isConnected || !address) {
      navigate('/auth');
      return;
    }

    if (!profileLoading && profile) {
      setDisplayName(profile.display_name || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
      setBannerUrl(profile.banner_url || "");
      setSocialTwitter(profile.social_twitter || "");
      setSocialYoutube(profile.social_youtube || "");
      setSocialDiscord(profile.social_discord || "");
      setSocialInstagram(profile.social_instagram || "");
      setSocialTiktok(profile.social_tiktok || "");

      // Parse schedule
      try {
        const rawSchedule = profile.schedule as unknown;
        const parsedSchedule = Array.isArray(rawSchedule)
          ? (rawSchedule as ScheduleItem[])
          : [];
        setSchedule(parsedSchedule);
      } catch {
        setSchedule([]);
      }

      // Parse categories
      setCategories(Array.isArray(profile.categories) ? profile.categories : []);

      // Load payout wallet from owner-only table
      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: payout } = await (supabase as any)
              .from('user_payout_wallets')
              .select('payout_wallet_address')
              .eq('user_id', user.id)
              .maybeSingle();
            setPayoutWalletAddress(payout?.payout_wallet_address || "");
          }
        } catch (e) {
          console.warn("Failed to load payout wallet", e);
        }
      })();

      // Set playlist IDs
      setPlaylistIds(Array.isArray((profile as any).playlist_ids) ? (profile as any).playlist_ids : []);
      setIsPrivate((profile as any).is_private ?? false);
    }
    setLoading(profileLoading);
  }, [profile, profileLoading, isConnected, address, navigate]);

  const handleSave = async () => {
    if (!address) return;

    setSaving(true);

    try {
      // Use saveProfile which does upsert - creates profile if doesn't exist.
      // Note: payout_wallet_address is now stored in user_payout_wallets (owner-only RLS).
      const savedProfile = await saveProfile({
        display_name: displayName || null,
        bio: bio || null,
        avatar_url: avatarUrl || null,
        banner_url: bannerUrl || null,
        social_twitter: socialTwitter || null,
        social_youtube: socialYoutube || null,
        social_discord: socialDiscord || null,
        social_instagram: socialInstagram || null,
        social_tiktok: socialTiktok || null,
        schedule: JSON.parse(JSON.stringify(schedule)),
        categories: categories,
        playlist_ids: playlistIds,
        is_private: isPrivate,
        // Preserve existing role flags or default to collector
        is_collector: profile?.is_collector ?? true,
        is_creator: profile?.is_creator ?? false,
        is_streamer: profile?.is_streamer ?? false,
      });

      // Persist payout wallet to the owner-only table
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await (supabase as any)
            .from('user_payout_wallets')
            .upsert(
              { user_id: user.id, payout_wallet_address: payoutWalletAddress || null },
              { onConflict: 'user_id' }
            );
        }
      } catch (e) {
        console.warn("Failed to save payout wallet", e);
      }

      toast({
        title: "Profile saved!",
        description: displayName
          ? "Your profile has been updated."
          : "Profile saved! Add a display name to hide your wallet address."
      });

      // Navigate based on profile type
      if (savedProfile?.is_streamer) {
        navigate(`/streamer/${savedProfile.user_id || address}`);
      } else {
        navigate('/');
      }
    } catch (error: any) {
      toast({
        title: "Error saving profile",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const addScheduleItem = () => {
    setSchedule([...schedule, { day: 'Monday', time: '8:00 PM', timezone: 'EST' }]);
  };

  const removeScheduleItem = (index: number) => {
    setSchedule(schedule.filter((_, i) => i !== index));
  };

  const updateScheduleItem = (index: number, field: keyof ScheduleItem, value: string) => {
    const updated = [...schedule];
    updated[index] = { ...updated[index], [field]: value };
    setSchedule(updated);
  };

  const toggleCategory = (category: string) => {
    if (categories.includes(category)) {
      setCategories(categories.filter(c => c !== category));
    } else {
      setCategories([...categories, category]);
    }
  };

  const openCropModal = (file: File, type: 'avatar' | 'banner' = 'avatar') => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file.",
        variant: "destructive"
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImageSrc(reader.result as string);
      setCropType(type);
      setCropModalOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCroppedImage = async (croppedBlob: Blob) => {
    if (!address) return;

    setCropModalOpen(false);
    setSelectedImageSrc(null);
    setUploading(true);

    try {
      const fileName = cropType === 'avatar'
        ? `${address}/avatar.jpg`
        : `${address}/banner.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, croppedBlob, {
          upsert: true,
          contentType: 'image/jpeg'
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Add timestamp to bust cache
      const urlWithCache = `${publicUrl}?t=${Date.now()}`;

      if (cropType === 'avatar') {
        setAvatarUrl(urlWithCache);
        toast({
          title: "Avatar uploaded!",
          description: "Your profile picture has been updated."
        });
      } else {
        setBannerUrl(urlWithCache);
        toast({
          title: "Banner uploaded!",
          description: "Your cover image has been updated."
        });
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload image.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) openCropModal(file);
    // Reset input so same file can be selected again
    event.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) openCropModal(file, 'avatar');
  };

  const handleBannerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsBannerDragging(true);
  };

  const handleBannerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsBannerDragging(false);
  };

  const handleBannerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsBannerDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) openCropModal(file, 'banner');
  };

  const handleBannerUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) openCropModal(file, 'banner');
    event.target.value = '';
  };

  const handleRemoveBanner = async () => {
    if (!address) return;

    setUploading(true);
    try {
      await supabase.storage.from('avatars').remove([`${address}/banner.jpg`]);
      setBannerUrl('');
      toast({
        title: "Banner removed",
        description: "Your cover image has been removed."
      });
    } catch (error: any) {
      console.error('Remove banner error:', error);
      toast({
        title: "Failed to remove banner",
        description: error.message || "Please try again.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!address) return;

    setUploading(true);
    try {
      // Try to delete existing avatar files
      const { data: files } = await supabase.storage
        .from('avatars')
        .list(address);

      if (files && files.length > 0) {
        const filesToDelete = files.map(f => `${address}/${f.name}`);
        await supabase.storage.from('avatars').remove(filesToDelete);
      }

      setAvatarUrl('');
      toast({
        title: "Avatar removed",
        description: "Your profile picture has been removed."
      });
    } catch (error: any) {
      console.error('Remove avatar error:', error);
      toast({
        title: "Failed to remove avatar",
        description: error.message || "Please try again.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="max-w-2xl mx-auto space-y-6">
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => navigate(-1)}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Profile'}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-medium text-primary">Decentralized Profile Sync Active</span>
              </div>
              <div className="flex items-center gap-1.5 grayscale opacity-70">
                <img src="https://gateway.irys.xyz/K-BvY7_Z18p7V1z4P-C8_XlP0A6C9oY_4C4jQyv_S40" alt="Irys" className="h-3.5" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-tighter">Powered by Arweave</span>
              </div>
            </div>
          </div>

          {/* Basic Info */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="displayName">Display Name</Label>
                  {!displayName && (
                    <span className="text-xs text-amber-500 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Recommended to hide wallet address
                    </span>
                  )}
                </div>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Choose a display name to hide your wallet"
                />
                <p className="text-xs text-muted-foreground">
                  Setting a display name will hide your wallet address from public view.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell viewers about yourself..."
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Profile Picture</Label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative flex items-center gap-4 p-4 rounded-lg border-2 border-dashed transition-colors ${isDragging
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                    }`}
                >
                  <Avatar className="h-20 w-20 border-2 border-border shrink-0">
                    <AvatarImage src={avatarUrl} alt="Avatar preview" />
                    <AvatarFallback className="bg-muted">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <label htmlFor="avatar-upload">
                        <input
                          id="avatar-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                          className="hidden"
                          disabled={uploading}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="gap-2 cursor-pointer"
                          disabled={uploading}
                          onClick={() => document.getElementById('avatar-upload')?.click()}
                        >
                          <Upload className="h-4 w-4" />
                          {uploading ? 'Uploading...' : 'Upload Image'}
                        </Button>
                      </label>
                      {avatarUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={uploading}
                          onClick={handleRemoveAvatar}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isDragging ? 'Drop your image here!' : 'Drag & drop or click to upload. JPG, PNG or GIF. Max 5MB.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Banner Upload */}
              <div className="space-y-2">
                <Label>Cover/Banner Image</Label>
                <div
                  onDragOver={handleBannerDragOver}
                  onDragLeave={handleBannerDragLeave}
                  onDrop={handleBannerDrop}
                  className={`relative rounded-lg border-2 border-dashed transition-colors overflow-hidden ${isBannerDragging
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                    }`}
                >
                  {bannerUrl ? (
                    <div className="relative aspect-[3/1] w-full">
                      <img
                        src={bannerUrl}
                        alt="Banner preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label htmlFor="banner-upload">
                          <input
                            id="banner-upload"
                            type="file"
                            accept="image/*"
                            onChange={handleBannerUpload}
                            className="hidden"
                            disabled={uploading}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="gap-2"
                            disabled={uploading}
                            onClick={() => document.getElementById('banner-upload')?.click()}
                          >
                            <Upload className="h-4 w-4" />
                            Change
                          </Button>
                        </label>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="gap-2"
                          disabled={uploading}
                          onClick={handleRemoveBanner}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-[3/1] w-full flex flex-col items-center justify-center gap-3 p-6">
                      <div className="p-3 rounded-full bg-muted">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-sm text-muted-foreground">
                          {isBannerDragging ? 'Drop your image here!' : 'Drag & drop a banner image'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Recommended: 1500 x 500 pixels (3:1 ratio)
                        </p>
                      </div>
                      <label htmlFor="banner-upload-empty">
                        <input
                          id="banner-upload-empty"
                          type="file"
                          accept="image/*"
                          onChange={handleBannerUpload}
                          className="hidden"
                          disabled={uploading}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          disabled={uploading}
                          onClick={() => document.getElementById('banner-upload-empty')?.click()}
                        >
                          <Upload className="h-4 w-4" />
                          {uploading ? 'Uploading...' : 'Upload Banner'}
                        </Button>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Categories - Only for Streamers */}
          {profile?.is_streamer && (
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-primary" />
                  Categories / Genres
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Select categories that describe your content (click to toggle):
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableCategories.map((category) => (
                    <Badge
                      key={category}
                      variant={categories.includes(category) ? "default" : "outline"}
                      className={`cursor-pointer transition-all ${categories.includes(category)
                        ? "bg-primary hover:bg-primary/80"
                        : "hover:bg-primary/20"
                        }`}
                      onClick={() => toggleCategory(category)}
                    >
                      {category}
                      {categories.includes(category) && (
                        <X className="h-3 w-3 ml-1" />
                      )}
                    </Badge>
                  ))}
                </div>
                {categories.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {categories.join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Social Links */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Social Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <Twitter className="h-5 w-5 text-muted-foreground" />
                  <Input
                    value={socialTwitter}
                    onChange={(e) => setSocialTwitter(e.target.value)}
                    placeholder="https://twitter.com/username"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Youtube className="h-5 w-5 text-muted-foreground" />
                  <Input
                    value={socialYoutube}
                    onChange={(e) => setSocialYoutube(e.target.value)}
                    placeholder="https://youtube.com/@channel"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <MessageCircle className="h-5 w-5 text-muted-foreground" />
                  <Input
                    value={socialDiscord}
                    onChange={(e) => setSocialDiscord(e.target.value)}
                    placeholder="https://discord.gg/invite"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Instagram className="h-5 w-5 text-muted-foreground" />
                  <Input
                    value={socialInstagram}
                    onChange={(e) => setSocialInstagram(e.target.value)}
                    placeholder="https://instagram.com/username"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Music2 className="h-5 w-5 text-muted-foreground" />
                  <Input
                    value={socialTiktok}
                    onChange={(e) => setSocialTiktok(e.target.value)}
                    placeholder="https://tiktok.com/@username"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payout Wallet */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Payout Wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Set a specific wallet address to receive your earnings from donations, NFT sales, and shop sales.
                Leave empty to use your currently connected wallet.
              </p>
              <div className="space-y-2">
                <Label htmlFor="payoutWallet">Wallet Address</Label>
                <Input
                  id="payoutWallet"
                  value={payoutWalletAddress}
                  onChange={(e) => setPayoutWalletAddress(e.target.value)}
                  placeholder="0x... (leave empty to use connected wallet)"
                  className="font-mono text-sm"
                />
              </div>
              {payoutWalletAddress && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <p className="text-sm text-green-500">
                    Earnings will be sent to: {payoutWalletAddress.slice(0, 6)}...{payoutWalletAddress.slice(-4)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Linked Wallets */}
          <LinkedWalletsManager />

          {/* Privacy */}
          <PrivacyToggle isPrivate={isPrivate} onChange={setIsPrivate} />

          {/* Music Playlists - Only for Streamers */}
          {profile?.is_streamer && (address || profile?.user_id) && (
            <StreamerPlaylistSelector
              userId={profile?.user_id || address || ""}
              selectedPlaylistIds={playlistIds}
              onSelectionChange={setPlaylistIds}
            />
          )}

          {/* Schedule - Only for Streamers */}
          {profile?.is_streamer && (
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Streaming Schedule
                </CardTitle>
                <Button variant="outline" size="sm" onClick={addScheduleItem} className="gap-1">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {schedule.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No schedule items. Click "Add" to create your streaming schedule.
                  </p>
                ) : (
                  schedule.map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                      <Select
                        value={item.day}
                        onValueChange={(value) => updateScheduleItem(index, 'day', value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {days.map((day) => (
                            <SelectItem key={day} value={day}>{day}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={item.time}
                        onChange={(e) => updateScheduleItem(index, 'time', e.target.value)}
                        placeholder="8:00 PM"
                        className="flex-1"
                      />
                      <Input
                        value={item.timezone || ''}
                        onChange={(e) => updateScheduleItem(index, 'timezone', e.target.value)}
                        placeholder="EST"
                        className="w-20"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeScheduleItem(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Image Crop Modal */}
      {selectedImageSrc && (
        <ImageCropModal
          isOpen={cropModalOpen}
          onClose={() => {
            setCropModalOpen(false);
            setSelectedImageSrc(null);
          }}
          imageSrc={selectedImageSrc}
          onCropComplete={handleCroppedImage}
          aspect={cropType === 'banner' ? 3 : 1}
        />
      )}
    </div>
  );
};

export default EditProfile;
