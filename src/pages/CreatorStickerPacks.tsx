import { authUrl } from "@/lib/guestEntry";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Sticker,
  Plus,
  Loader2,
  Lock,
  Users,
  Sparkles,
  Edit,
  Trash2,
  Image as ImageIcon,
  Eye,
  EyeOff
} from "lucide-react";
import { LilyPadLogo } from "@/components/LilyPadLogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSEO } from "@/hooks/useSEO";
import { CreateStickerPackModal } from "@/components/stickers/CreateStickerPackModal";
import { ManageStickerPackModal } from "@/components/stickers/ManageStickerPackModal";
import { useFeatureUnlock } from "@/hooks/useFeatureLocks";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/providers/WalletProvider";
import { useUserProfile } from "@/hooks/useUserProfile";

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

export default function CreatorStickerPacks() {
  const navigate = useNavigate();
  const [followerCount, setFollowerCount] = useState<number>(0);
  const [stickerPacks, setStickerPacks] = useState<ShopItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedPack, setSelectedPack] = useState<ShopItem | null>(null);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const {
    isUnlocked,
    isLoading: featureLockLoading,
    requiredFollowers,
    isFeatureEnabled,
    progress
  } = useFeatureUnlock("sticker_packs", followerCount);

  useSEO({
    title: "My Sticker Packs | The Lily Pad",
    description: "Create and manage your sticker packs on The Lily Pad."
  });

  const { isConnected } = useWallet();
  const { profile, loading: profileLoading } = useUserProfile();

  useEffect(() => {
    if (!isConnected) {
      toast.error("Please connect your wallet to access this page");
      navigate(authUrl());
      return;
    }

    if (!profileLoading && profile) {
      setUserId(profile.id);
    }
  }, [isConnected, profile, profileLoading, navigate]);

  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch follower count
        const { count, error: followerError } = await supabase
          .from("followers")
          .select("*", { count: "exact", head: true })
          .eq("streamer_id", userId);

        if (followerError) {
          console.error("Error fetching followers:", followerError);
        } else {
          setFollowerCount(count || 0);
        }

        // Fetch user's sticker packs
        const { data: packs, error: packsError } = await supabase
          .from("shop_items")
          .select("*")
          .eq("creator_id", userId)
          .eq("category", "sticker_pack")
          .order("created_at", { ascending: false });

        if (packsError) {
          console.error("Error fetching packs:", packsError);
        } else {
          setStickerPacks(packs || []);
        }
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  const handleToggleActive = async (pack: ShopItem) => {
    try {
      const { error } = await supabase
        .from("shop_items")
        .update({ is_active: !pack.is_active })
        .eq("id", pack.id);

      if (error) throw error;

      setStickerPacks(prev =>
        prev.map(p => p.id === pack.id ? { ...p, is_active: !p.is_active } : p)
      );
      toast.success(pack.is_active ? "Pack hidden from marketplace" : "Pack visible in marketplace");
    } catch (err) {
      console.error("Error toggling pack:", err);
      toast.error("Failed to update pack");
    }
  };

  const handleDeletePack = async (packId: string) => {
    if (!confirm("Are you sure you want to delete this sticker pack? This cannot be undone.")) {
      return;
    }

    try {
      // Delete stickers first
      const { error: stickersError } = await supabase
        .from("shop_item_contents")
        .delete()
        .eq("item_id", packId);

      if (stickersError) throw stickersError;

      // Delete the pack
      const { error } = await supabase
        .from("shop_items")
        .delete()
        .eq("id", packId);

      if (error) throw error;

      setStickerPacks(prev => prev.filter(p => p.id !== packId));
      toast.success("Sticker pack deleted");
    } catch (err) {
      console.error("Error deleting pack:", err);
      toast.error("Failed to delete pack");
    }
  };

  const handleManagePack = (pack: ShopItem) => {
    setSelectedPack(pack);
    setIsManageModalOpen(true);
  };

  const refreshPacks = async () => {
    if (!userId) return;

    const { data: packs } = await supabase
      .from("shop_items")
      .select("*")
      .eq("creator_id", userId)
      .eq("category", "sticker_pack")
      .order("created_at", { ascending: false });

    if (packs) {
      setStickerPacks(packs);
    }
  };

  const tierColors: Record<string, string> = {
    basic: "bg-muted text-muted-foreground border-border",
    premium: "bg-primary/20 text-primary border-primary/30",
    exclusive: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  };

  if (isLoading || featureLockLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="flex items-center gap-4 mb-8">
            <Skeleton className="w-14 h-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-32 w-full mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 pt-24 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <LilyPadLogo size={56} />
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">My Sticker Packs</h1>
              <p className="text-muted-foreground">
                Create and manage your sticker packs
              </p>
            </div>
          </div>
          {isUnlocked && (
            <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2">
              <Plus className="w-5 h-5" />
              Create Pack
            </Button>
          )}
        </div>

        {/* Unlock Progress */}
        {!isUnlocked && isFeatureEnabled && (
          <Card className="mb-8 border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-full bg-amber-500/20">
                  <Lock className="w-6 h-6 text-amber-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">Feature Locked</h3>
                  <p className="text-muted-foreground mb-4">
                    You need {requiredFollowers} subscribers to unlock sticker pack creation.
                    Keep growing your channel!
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        {followerCount} / {requiredFollowers} subscribers
                      </span>
                      <span className="font-medium">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Unlocked Stats */}
        {isUnlocked && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stickerPacks.length}</div>
                <p className="text-sm text-muted-foreground">Total Packs</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {stickerPacks.filter(p => p.is_active).length}
                </div>
                <p className="text-sm text-muted-foreground">Active Packs</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {stickerPacks.reduce((sum, p) => sum + p.total_sales, 0)}
                </div>
                <p className="text-sm text-muted-foreground">Total Sales</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <span className="text-2xl font-bold">{followerCount}</span>
                </div>
                <p className="text-sm text-muted-foreground">Subscribers</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Sticker Packs Grid */}
        {isUnlocked && (
          <>
            {stickerPacks.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {stickerPacks.map((pack) => (
                  <Card
                    key={pack.id}
                    className={`overflow-hidden transition-colors ${!pack.is_active ? 'opacity-60' : ''}`}
                  >
                    <div className="aspect-square relative overflow-hidden bg-muted">
                      {pack.image_url ? (
                        <img
                          src={pack.image_url}
                          alt={pack.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                          <Sticker className="w-12 h-12 text-primary" />
                        </div>
                      )}
                      <div className="absolute top-3 right-3 flex gap-2">
                        <Badge
                          variant="outline"
                          className={tierColors[pack.tier] || tierColors.basic}
                        >
                          <Sparkles className="w-3 h-3 mr-1" />
                          {pack.tier}
                        </Badge>
                      </div>
                      {!pack.is_active && (
                        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                          <Badge variant="secondary" className="gap-1">
                            <EyeOff className="w-3 h-3" />
                            Hidden
                          </Badge>
                        </div>
                      )}
                    </div>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg truncate">{pack.name}</CardTitle>
                      {pack.description && (
                        <CardDescription className="line-clamp-2">{pack.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm mb-3">
                        <span className="text-muted-foreground">Price</span>
                        <span className="font-medium">
                          {pack.price_mon > 0 ? `${pack.price_mon} USDC` : "Free"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm mb-4">
                        <span className="text-muted-foreground">Sales</span>
                        <span className="font-medium">{pack.total_sales}</span>
                      </div>
                      <Separator className="mb-4" />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleManagePack(pack)}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Manage
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(pack)}
                          title={pack.is_active ? "Hide from marketplace" : "Show in marketplace"}
                        >
                          {pack.is_active ? (
                            <Eye className="w-4 h-4" />
                          ) : (
                            <EyeOff className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeletePack(pack.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border border-dashed rounded-lg">
                <Sticker className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No sticker packs yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first sticker pack to sell to your fans!
                </p>
                <Button onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Pack
                </Button>
              </div>
            )}
          </>
        )}

        {/* Locked State - Show preview */}
        {!isUnlocked && isFeatureEnabled && (
          <div className="text-center py-12 border border-dashed rounded-lg bg-muted/20">
            <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Sticker Pack Creation Locked</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Reach {requiredFollowers} subscribers to unlock the ability to create and sell your own sticker packs.
              Share your stream and grow your community!
            </p>
          </div>
        )}
      </main>

      {/* Create Modal */}
      <CreateStickerPackModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        userId={userId}
        onSuccess={refreshPacks}
      />

      {/* Manage Modal */}
      {selectedPack && (
        <ManageStickerPackModal
          open={isManageModalOpen}
          onOpenChange={setIsManageModalOpen}
          pack={selectedPack}
          onUpdate={refreshPacks}
        />
      )}
    </div>
  );
}