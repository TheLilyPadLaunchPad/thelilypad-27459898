import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast, toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { addDays } from "date-fns";
import { useSEO } from "@/hooks/useSEO";
import { useDashboardAnalytics } from "@/hooks/useDashboardAnalytics";
import {
  BarChart3,
  Users,
  DollarSign,
  Eye,
  TrendingUp,
  Clock,
  Video,
  Heart,
  ArrowUpRight,
  Shield,
  ArrowDownRight,
  Calendar,
  Radio,
  Palette,
  Rocket,
  FileEdit,
  Trash2,
  Sticker,
  Plus,
  Loader2,
  Lock,
  AlertCircle,
  Image as ImageIcon
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ShopItemsList } from "@/components/shop/ShopItemsList";
import { StreamKeyManager } from "@/components/StreamKeyManager";
import { CreateShopItemModal } from "@/components/shop/CreateShopItemModal";
import { CreatorNotifications } from "@/components/CreatorNotifications";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar
} from "recharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DraftCollection {
  id: string;
  name: string;
  symbol: string;
  description: string | null;
  image_url: string | null;
  total_supply: number;
  status: string;
  created_at: string;
  updated_at: string;
  contract_address: string | null;
}


export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalViews: 0,
    totalFollowers: 0,
    totalEarnings: 0,
    totalStreams: 0,
  });
  const [draftCollections, setDraftCollections] = useState<DraftCollection[]>([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(true);
  const [showCreateShopItem, setShowCreateShopItem] = useState(false);
  const [shopItemRefreshTrigger, setShopItemRefreshTrigger] = useState(0);
  const [deleteCollectionId, setDeleteCollectionId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Real-time analytics data
  const { viewerData, earningsData, recentStreams, recentDonations, isLoading: isAnalyticsLoading } = useDashboardAnalytics(user?.id);

  useSEO({
    title: "Creator Dashboard | The Lily Pad",
    description: "Track your stream performance, manage NFT collections, view earnings and analytics. Your complete creator dashboard on The Lily Pad."
  });

  // User is already guaranteed by ProtectedRoute — just fetch the current session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
      fetchDraftCollections();
    }
  }, [user]);

  const fetchDraftCollections = async () => {
    setIsLoadingCollections(true);
    try {
      const { data, error } = await supabase
        .from("collections")
        .select("*")
        .eq("creator_id", user.id)
        .in("status", ["draft", "upcoming"])
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching collections:", error);
      } else {
        setDraftCollections(data || []);
      }
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setIsLoadingCollections(false);
    }
  };

  const handleDeleteDraft = async (collectionId: string) => {
    setIsDeleting(true);
    const collectionToDelete = draftCollections.find(c => c.id === collectionId);
    const collectionName = collectionToDelete?.name || "Collection";

    try {
      const scheduledDeleteAt = addDays(new Date(), 7);

      const { error } = await supabase
        .from("collections")
        .update({
          deleted_at: new Date().toISOString(),
          scheduled_permanent_delete_at: scheduledDeleteAt.toISOString()
        })
        .eq("id", collectionId)
        .eq("creator_id", user.id);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to delete collection",
          variant: "destructive",
        });
      } else {
        setDeleteCollectionId(null);
        fetchDraftCollections();

        toast({
          title: `"${collectionName}" moved to trash`,
          description: "Will be permanently deleted in 7 days",
          action: (
            <ToastAction altText="Undo" onClick={() => handleUndoDelete(collectionId, collectionName)}>
              Undo
            </ToastAction>
          ),
        });
      }
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUndoDelete = async (collectionId: string, collectionName: string) => {
    try {
      const { error } = await supabase
        .from("collections")
        .update({
          deleted_at: null,
          scheduled_permanent_delete_at: null
        })
        .eq("id", collectionId)
        .eq("creator_id", user.id);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to restore collection",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Collection restored",
          description: `"${collectionName}" has been restored`,
        });
        fetchDraftCollections();
      }
    } catch (err) {
      console.error("Error restoring collection:", err);
    }
  };

  const fetchDashboardData = async () => {
    setIsLoading(true);

    try {
      // Fetch streams count
      const { count: streamsCount } = await supabase
        .from("streams")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      // Fetch followers count
      const { count: followersCount } = await supabase
        .from("followers")
        .select("*", { count: "exact", head: true })
        .eq("streamer_id", user.id);

      // Fetch total earnings
      const { data: earningsData } = await supabase
        .from("earnings")
        .select("amount")
        .eq("user_id", user.id);

      const totalEarnings = earningsData?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

      // Fetch total views from streams
      const { data: streamsData } = await supabase
        .from("streams")
        .select("total_views")
        .eq("user_id", user.id);

      const totalViews = streamsData?.reduce((sum, s) => sum + (s.total_views || 0), 0) || 0;

      setStats({
        totalViews,
        totalFollowers: followersCount || 0,
        totalEarnings,
        totalStreams: streamsCount || 0,
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }

    setIsLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-3 sm:px-4 pt-20 sm:pt-24 pb-8 sm:pb-12">
        {/* Header */}
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">Creator Dashboard</h1>
            <p className="text-muted-foreground">Track your stream performance and earnings</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => navigate("/launchpad")} className="w-full sm:w-auto">
              <Palette className="w-4 h-4 mr-2" />
              NFT Launchpad
            </Button>
            <Button variant="outline" onClick={() => navigate("/moderation")} className="w-full sm:w-auto">
              <Shield className="w-4 h-4 mr-2" />
              Moderation
            </Button>
            <Button onClick={() => navigate("/go-live")} className="w-full sm:w-auto">
              <Radio className="w-4 h-4 mr-2" />
              Go Live
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Card className="glass-card border-border/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <Eye className="w-5 h-5 text-muted-foreground" />
                <Badge variant="secondary" className="text-xs">
                  <ArrowUpRight className="w-3 h-3 mr-1" />
                  12%
                </Badge>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl sm:text-3xl font-bold">{formatNumber(stats.totalViews)}</div>
              )}
              <p className="text-xs sm:text-sm text-muted-foreground">Total Views</p>
            </CardContent>
          </Card>

          <Card className="glass-card border-border/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                <Badge variant="secondary" className="text-xs">
                  <ArrowUpRight className="w-3 h-3 mr-1" />
                  8%
                </Badge>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl sm:text-3xl font-bold">{formatNumber(stats.totalFollowers)}</div>
              )}
              <p className="text-xs sm:text-sm text-muted-foreground">Followers</p>
            </CardContent>
          </Card>

          <Card className="glass-card border-border/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-5 h-5 text-muted-foreground" />
                <Badge variant="secondary" className="text-xs">
                  <ArrowUpRight className="w-3 h-3 mr-1" />
                  24%
                </Badge>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl sm:text-3xl font-bold">{formatCurrency(stats.totalEarnings)}</div>
              )}
              <p className="text-xs sm:text-sm text-muted-foreground">Total Earnings</p>
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-4 h-8 text-xs text-primary hover:text-primary hover:bg-primary/10"
                onClick={() => navigate("/earnings")}
              >
                View Details <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </CardContent>
          </Card>

          <Card className="glass-card border-border/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <Video className="w-5 h-5 text-muted-foreground" />
                <Badge variant="secondary" className="text-xs">
                  <ArrowUpRight className="w-3 h-3 mr-1" />
                  5%
                </Badge>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl sm:text-3xl font-bold">{stats.totalStreams}</div>
              )}
              <p className="text-xs sm:text-sm text-muted-foreground">Total Streams</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="glass-card border-border/50">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Viewer Analytics
              </CardTitle>
              <CardDescription>Daily average concurrent viewers</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="h-[200px] sm:h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={viewerData}>
                    <defs>
                      <linearGradient id="viewerGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="viewers"
                      stroke="hsl(var(--primary))"
                      fill="url(#viewerGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-border/50">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Earnings Overview
              </CardTitle>
              <CardDescription>Monthly earnings breakdown</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="h-[200px] sm:h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={earningsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                      formatter={(value) => [`$${value}`, "Earnings"]}
                    />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notifications Section */}
        <div className="mb-6 sm:mb-8">
          <CreatorNotifications />
        </div>

        {/* Shop Items Section */}
        <Card className="glass-card border-border/50 mb-6 sm:mb-8">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Sticker className="w-5 h-5" />
                  Your Shop Items
                </CardTitle>
                <CardDescription>Sticker and emoji packs you're selling</CardDescription>
              </div>
              <Button onClick={() => setShowCreateShopItem(true)} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Create Pack
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <ShopItemsList
              userId={user.id}
              onEdit={(id) => console.log("Edit item:", id)}
              onCreateNew={() => setShowCreateShopItem(true)}
              refreshTrigger={shopItemRefreshTrigger}
            />
          </CardContent>
        </Card>

        {/* NFT Collection Drafts Section */}
        <Card className="glass-card border-border/50 mb-6 sm:mb-8">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Your NFT Collections
                </CardTitle>
                <CardDescription>Draft and upcoming collections you've created</CardDescription>
              </div>
              <Button onClick={() => navigate("/launchpad")} size="sm">
                <Rocket className="w-4 h-4 mr-2" />
                Create New
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            {isLoadingCollections ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : draftCollections.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {draftCollections.map((collection) => (
                  <div
                    key={collection.id}
                    className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shrink-0 overflow-hidden">
                      {collection.image_url ? (
                        <img
                          src={collection.image_url}
                          alt={collection.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Palette className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm sm:text-base truncate">{collection.name}</h3>
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                        <Badge
                          variant="secondary"
                          className={`text-xs ${collection.status === "draft"
                            ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"
                            : collection.status === "upcoming"
                              ? "bg-blue-500/20 text-blue-500 border-blue-500/30"
                              : "bg-green-500/20 text-green-500 border-green-500/30"
                            }`}
                        >
                          {collection.status.charAt(0).toUpperCase() + collection.status.slice(1)}
                        </Badge>
                        <span className="hidden sm:inline">•</span>
                        <span className="hidden sm:inline">{collection.symbol}</span>
                        <span className="hidden sm:inline">•</span>
                        <span className="hidden sm:inline">{collection.total_supply.toLocaleString()} supply</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {collection.contract_address && (
                        <Badge
                          variant="outline"
                          className="bg-green-500/20 text-green-400 border-green-500/30 text-xs"
                        >
                          <Lock className="w-3 h-3 mr-1" />
                          Deployed
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/launchpad/${collection.id}`)}
                      >
                        <FileEdit className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">View</span>
                      </Button>
                      {!collection.contract_address && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteCollectionId(collection.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Palette className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No NFT collections yet</p>
                <Button variant="link" onClick={() => navigate("/launchpad")}>
                  Create your first collection
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Shop Item Modal */}
        <CreateShopItemModal
          open={showCreateShopItem}
          onOpenChange={setShowCreateShopItem}
          userId={user.id}
          onSuccess={() => setShopItemRefreshTrigger((t) => t + 1)}
        />

        {/* Stream Dashboard Widgets */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 sm:mb-8">
          <StreamKeyManager userId={user.id} />
          <Card className="glass-card border-border/50 h-full flex flex-col justify-center items-center p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <DollarSign className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="mb-2">Earnings & Payouts</CardTitle>
            <CardDescription className="mb-6 max-w-sm">
              Manage your channel revenue, view your total earnings, and withdraw funds directly to your wallet.
            </CardDescription>
            <Button onClick={() => navigate("/earnings")} className="w-full sm:w-auto" size="lg">
              Manage Earnings
            </Button>
          </Card>
        </div>

        {/* Recent Activity */}
        <Tabs defaultValue="streams" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 sm:mb-6">
            <TabsTrigger value="streams" className="text-xs sm:text-sm">
              <Video className="w-4 h-4 mr-1 sm:mr-2" />
              Recent Streams
            </TabsTrigger>
            <TabsTrigger value="donations" className="text-xs sm:text-sm">
              <Heart className="w-4 h-4 mr-1 sm:mr-2" />
              Recent Donations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="streams">
            <Card className="glass-card border-border/50">
              <CardContent className="p-4 sm:p-6">
                {recentStreams.length > 0 ? (
                  <div className="space-y-3 sm:space-y-4">
                    {recentStreams.map((stream) => (
                      <div
                        key={stream.id}
                        className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shrink-0">
                          <Video className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm sm:text-base truncate">{stream.title}</h3>
                          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                            <Badge variant="secondary" className="text-xs">{stream.category}</Badge>
                            <span className="hidden sm:inline">•</span>
                            <span className="hidden sm:inline">{stream.date}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Eye className="w-3.5 h-3.5" />
                            {stream.viewers}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {stream.duration}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Video className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No streams yet</p>
                    <Button variant="link" onClick={() => navigate("/go-live")}>
                      Start your first stream
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="donations">
            <Card className="glass-card border-border/50">
              <CardContent className="p-4 sm:p-6">
                {recentDonations.length > 0 ? (
                  <div className="space-y-3 sm:space-y-4">
                    {recentDonations.map((donation) => (
                      <div
                        key={donation.id}
                        className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shrink-0">
                          <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm sm:text-base">{donation.from}</h3>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate">
                            {donation.message}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm sm:text-base font-bold text-primary">
                            {formatCurrency(donation.amount)}
                          </div>
                          <div className="text-xs text-muted-foreground">{donation.date}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Heart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No donations yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete Collection Confirmation */}
      <AlertDialog open={!!deleteCollectionId} onOpenChange={(open) => !open && setDeleteCollectionId(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Delete Collection?
            </AlertDialogTitle>
          </AlertDialogHeader>

          {/* Collection Preview Card */}
          {(() => {
            const collectionToDelete = draftCollections.find(c => c.id === deleteCollectionId);
            if (!collectionToDelete) return null;
            return (
              <div className="flex gap-4 p-4 bg-muted/50 rounded-lg border">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                  {collectionToDelete.image_url ? (
                    <img
                      src={collectionToDelete.image_url}
                      alt={collectionToDelete.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{collectionToDelete.name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className="text-xs">{collectionToDelete.status}</Badge>
                    <span>•</span>
                    <span>{collectionToDelete.total_supply} items</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Created {formatDistanceToNow(new Date(collectionToDelete.created_at))} ago
                  </p>
                </div>
              </div>
            );
          })()}

          <AlertDialogDescription className="text-sm">
            This collection will be moved to trash and <strong>permanently deleted in 7 days</strong>. You can undo this action immediately after deletion.
            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
              <li>All collection metadata and settings</li>
              <li>All layers and trait configurations</li>
              <li>All artwork uploads</li>
              <li>Allowlist entries</li>
            </ul>
          </AlertDialogDescription>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCollectionId && handleDeleteDraft(deleteCollectionId)}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Move to Trash
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
