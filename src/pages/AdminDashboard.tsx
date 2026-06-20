import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { supabase } from '@/integrations/supabase/client';
import { useSEO } from '@/hooks/useSEO';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import FrogLoader from '@/components/FrogLoader';
import { toast } from '@/hooks/use-toast';
import {
  Users,
  Layers,
  ShieldCheck,
  Video,
  Search,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Ban,
  UserCog,
  Crown,
  Sparkles,
  TrendingUp,
  Sticker,
  Package,
  Ticket,
  Gift,
  Lock,
  Layers3,
  ImageIcon,
  Twitter
} from 'lucide-react';
import { format } from 'date-fns';
import { FeaturedCollectionsManager } from '@/components/admin/FeaturedCollectionsManager';
import { BuybackProgramManager } from '@/components/admin/BuybackProgramManager';
import { AdminStickerPackManager } from '@/components/admin/AdminStickerPackManager';
import { AdminBundleManager } from '@/components/admin/AdminBundleManager';
import { RewardsAllocationManager } from '@/components/admin/RewardsAllocationManager';
import { RewardDistributionHistory } from '@/components/admin/RewardDistributionHistory';
import RaffleManager from '@/components/admin/RaffleManager';
import BlindBoxManager from '@/components/admin/BlindBoxManager';
import { FeatureLocksManager } from '@/components/admin/FeatureLocksManager';
import { CardStackManager } from '@/components/admin/CardStackManager';
import { SiteAssetsManager } from '@/components/admin/SiteAssetsManager';
import { TestimonialsManager } from '@/components/admin/TestimonialsManager';
import { ErrorLogManager } from '@/components/admin/ErrorLogManager';

import { FeatureSectionManager } from '@/components/admin/FeatureSectionManager';
import { CreatorApplicationsManager } from '@/components/admin/CreatorApplicationsManager';
import { MarketplaceApplicationsManager } from '@/components/admin/MarketplaceApplicationsManager';
import { AdminDirectCollectionModal } from '@/components/admin/AdminDirectCollectionModal';
import { Star, Trophy, Store } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  role: string | null;
  is_banned: boolean;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
}

interface Collection {
  id: string;
  name: string;
  symbol: string;
  creator_address: string;
  status: string;
  total_supply: number;
  minted: number;
  created_at: string;
}

interface Stream {
  id: string;
  title: string;
  user_id: string;
  is_live: boolean;
  total_views: number;
  created_at: string;
}

interface ModerationItem {
  id: string;
  content_type: string;
  content_text: string | null;
  status: string;
  ai_score: number | null;
  created_at: string;
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [moderationQueue, setModerationQueue] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCollections: 0,
    totalStreams: 0,
    pendingModeration: 0
  });

  // Modal states
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('user');

  useSEO({
    title: 'Admin Dashboard | The Lily Pad',
    description: 'Admin dashboard for managing users, collections, and content'
  });

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to access this page.',
        variant: 'destructive'
      });
      navigate('/');
    }
  }, [isAdmin, adminLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchAllData();
    }
  }, [isAdmin]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchUsers(),
        fetchCollections(),
        fetchStreams(),
        fetchModerationQueue(),
        fetchStats()
      ]);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('admin-users', {
        body: { action: 'list' }
      });

      if (response.error) {
        console.error('Error fetching users:', response.error);
        return;
      }

      setUsers(response.data.users || []);
      setStats(prev => ({ ...prev, totalUsers: response.data.users?.length || 0 }));
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchCollections = async () => {
    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching collections:', error);
    } else {
      setCollections(data || []);
    }
  };

  const fetchStreams = async () => {
    const { data, error } = await supabase
      .from('streams')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching streams:', error);
    } else {
      setStreams(data || []);
    }
  };

  const fetchModerationQueue = async () => {
    const { data, error } = await supabase
      .from('moderation_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching moderation queue:', error);
    } else {
      setModerationQueue(data || []);
    }
  };

  const fetchStats = async () => {
    const [collectionsCount, streamsCount, moderationCount] = await Promise.all([
      supabase.from('collections').select('id', { count: 'exact', head: true }),
      supabase.from('streams').select('id', { count: 'exact', head: true }),
      supabase.from('moderation_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    ]);

    setStats(prev => ({
      ...prev,
      totalCollections: collectionsCount.count || 0,
      totalStreams: streamsCount.count || 0,
      pendingModeration: moderationCount.count || 0
    }));
  };

  const handleDeleteCollection = async (id: string) => {
    if (!confirm('Permanently delete this collection and ALL related NFTs, listings, mints, allowlists, buyback rows, etc.? This cannot be undone.')) return;

    const { error } = await supabase.rpc('admin_hard_delete_collection', { p_collection_id: id });

    if (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete collection',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Success',
        description: 'Collection permanently deleted'
      });
      fetchCollections();
    }
  };

  const handleModerationAction = async (id: string, action: 'approved' | 'rejected') => {
    const { error } = await supabase
      .from('moderation_queue')
      .update({ status: action, reviewed_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update moderation status',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Success',
        description: `Content ${action} successfully`
      });
      fetchModerationQueue();
    }
  };

  const handleBanUser = async () => {
    if (!selectedUser) return;

    try {
      const response = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'ban',
          userId: selectedUser.id,
          reason: banReason.trim() || null
        }
      });

      if (response.error) throw response.error;

      toast({
        title: 'User Banned',
        description: `${selectedUser.email} has been banned.`
      });

      setBanModalOpen(false);
      setBanReason('');
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error banning user:', error);
      toast({
        title: 'Error',
        description: 'Failed to ban user',
        variant: 'destructive'
      });
    }
  };

  const handleUnbanUser = async (user: AdminUser) => {
    try {
      const response = await supabase.functions.invoke('admin-users', {
        body: { action: 'unban', userId: user.id }
      });

      if (response.error) throw response.error;

      toast({
        title: 'User Unbanned',
        description: `${user.email} has been unbanned.`
      });

      fetchUsers();
    } catch (error) {
      console.error('Error unbanning user:', error);
      toast({
        title: 'Error',
        description: 'Failed to unban user',
        variant: 'destructive'
      });
    }
  };

  const handleToggleVerification = async (user: AdminUser) => {
    try {
      const newStatus = !user.profile?.is_verified;
      const response = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'verify',
          userId: user.id,
          is_verified: newStatus,
        }
      });

      if (response.error) throw response.error;

      toast({
        title: newStatus ? 'User Verified' : 'Verification Removed',
        description: `${user.profile?.display_name || user.email} status updated.`
      });

      setUsers(prev => prev.map(u =>
        u.id === user.id
          ? { ...u, profile: u.profile ? { ...u.profile, is_verified: newStatus } : null }
          : u
      ));
    } catch (error) {
      console.error('Error toggling verification:', error);
      toast({
        title: 'Error',
        description: 'Failed to update verification status',
        variant: 'destructive'
      });
    }
  };

  const handleAssignRole = async () => {
    if (!selectedUser) return;

    try {
      const response = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'assign_role',
          userId: selectedUser.id,
          role: selectedRole
        }
      });

      if (response.error) throw response.error;

      toast({
        title: 'Role Updated',
        description: `${selectedUser.email} is now a ${selectedRole}.`
      });

      setRoleModalOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error assigning role:', error);
      toast({
        title: 'Error',
        description: 'Failed to assign role',
        variant: 'destructive'
      });
    }
  };

  const openBanModal = (user: AdminUser) => {
    setSelectedUser(user);
    setBanModalOpen(true);
  };

  const openRoleModal = (user: AdminUser) => {
    setSelectedUser(user);
    setSelectedRole(user.role || 'user');
    setRoleModalOpen(true);
  };

  if (adminLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <FrogLoader text="Loading admin dashboard..." />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.profile?.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCollections = collections.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredStreams = streams.filter(s =>
    s.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadge = (role: string | null) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-primary"><Crown className="w-3 h-3 mr-1" />Admin</Badge>;
      case 'moderator':
        return <Badge variant="secondary"><ShieldCheck className="w-3 h-3 mr-1" />Moderator</Badge>;
      default:
        return <Badge variant="outline">User</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold">Admin Dashboard</h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage users, collections, streams, and moderation.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Card className="p-3 sm:p-0">
            <CardHeader className="p-0 sm:pb-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-1 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <span className="text-xl sm:text-2xl font-bold">{stats.totalUsers}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="p-3 sm:p-0">
            <CardHeader className="p-0 sm:pb-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                Collections
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-1 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <span className="text-xl sm:text-2xl font-bold">{stats.totalCollections}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="p-3 sm:p-0">
            <CardHeader className="p-0 sm:pb-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-1 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
                <span className="text-xl sm:text-2xl font-bold">{stats.pendingModeration}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="p-3 sm:p-0">
            <CardHeader className="p-0 sm:pb-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                Live
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-1 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xl sm:text-2xl font-bold">
                  {streams.filter(s => s.is_live).length}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative mb-4 sm:mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users" className="space-y-4 sm:space-y-6">
          <div className="w-full overflow-x-auto pb-2">
            <TabsList className="inline-flex h-auto min-w-max gap-1 p-1 bg-muted/50 flex-wrap sm:flex-nowrap">
              <TabsTrigger value="users" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Users</span>
              </TabsTrigger>
              <TabsTrigger value="collections" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Layers className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Collections</span>
              </TabsTrigger>
              <TabsTrigger value="featured" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Featured</span>
              </TabsTrigger>
              <TabsTrigger value="buyback" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Buyback</span>
              </TabsTrigger>
              <TabsTrigger value="raffles" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Ticket className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Raffles</span>
              </TabsTrigger>
              <TabsTrigger value="blindboxes" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Gift className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Boxes</span>
              </TabsTrigger>
              <TabsTrigger value="packs" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Sticker className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Packs</span>
              </TabsTrigger>
              <TabsTrigger value="bundles" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Package className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Bundles</span>
              </TabsTrigger>
              <TabsTrigger value="streams" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Video className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Streams</span>
              </TabsTrigger>
              <TabsTrigger value="moderation" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <ShieldCheck className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Moderation</span>
              </TabsTrigger>
              <TabsTrigger value="feature-locks" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Lock className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Locks</span>
              </TabsTrigger>
              <TabsTrigger value="cardstack" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Layers3 className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>CardStack</span>
              </TabsTrigger>
              <TabsTrigger value="testimonials" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Twitter className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Testimonials</span>
              </TabsTrigger>
              <TabsTrigger value="branding" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <ImageIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Branding</span>
              </TabsTrigger>
              <TabsTrigger value="errors" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Errors</span>
              </TabsTrigger>
              <TabsTrigger value="creator-apps" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Creators</span>
              </TabsTrigger>
              <TabsTrigger value="marketplace-apps" className="gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Store className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Marketplace Apps</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="text-lg sm:text-xl">All Users</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Manage user accounts, roles, and bans
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {/* Mobile Card Layout */}
                <div className="block sm:hidden space-y-3">
                  <ScrollArea className="h-[400px]">
                    {filteredUsers.map((user) => (
                      <div key={user.id} className="border rounded-lg p-3 mb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="w-8 h-8 flex-shrink-0">
                              <AvatarImage src={user.profile?.avatar_url || ''} />
                              <AvatarFallback className="text-xs">
                                {user.email?.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {user.profile?.display_name || 'No name'}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {user.email}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openRoleModal(user)}
                            >
                              <UserCog className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleToggleVerification(user)}
                              title={user.profile?.is_verified ? "Remove Verification" : "Verify User"}
                            >
                              <ShieldCheck className={`w-4 h-4 ${user.profile?.is_verified ? 'text-[#00FFA3]' : 'text-muted-foreground opacity-50'}`} />
                            </Button>
                            {user.is_banned ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleUnbanUser(user)}
                              >
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openBanModal(user)}
                              >
                                <Ban className="w-4 h-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {getRoleBadge(user.role)}
                          {user.is_banned ? (
                            <Badge variant="destructive" className="text-xs">
                              <Ban className="w-3 h-3 mr-1" />
                              Banned
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-green-500 border-green-500">
                              Active
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(user.created_at), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    ))}
                    {filteredUsers.length === 0 && (
                      <p className="text-center text-muted-foreground py-8 text-sm">No users found</p>
                    )}
                  </ScrollArea>
                </div>
                {/* Desktop Table Layout */}
                <div className="hidden sm:block">
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={user.profile?.avatar_url || ''} />
                                  <AvatarFallback>
                                    {user.email?.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">
                                  {user.profile?.display_name || 'No name'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {user.email}
                            </TableCell>
                            <TableCell>
                              {getRoleBadge(user.role)}
                            </TableCell>
                            <TableCell>
                              {user.is_banned ? (
                                <Badge variant="destructive">
                                  <Ban className="w-3 h-3 mr-1" />
                                  Banned
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-green-500 border-green-500">
                                  Active
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {format(new Date(user.created_at), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleVerification(user)}
                                  title={user.profile?.is_verified ? "Remove Verification" : "Verify User"}
                                >
                                  <ShieldCheck className={`w-4 h-4 ${user.profile?.is_verified ? 'text-[#00FFA3]' : 'text-muted-foreground opacity-50'}`} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openRoleModal(user)}
                                  title="Assign Role"
                                >
                                  <UserCog className="w-4 h-4" />
                                </Button>
                                {user.is_banned ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleUnbanUser(user)}
                                    title="Unban User"
                                  >
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openBanModal(user)}
                                    title="Ban User"
                                  >
                                    <Ban className="w-4 h-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredUsers.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              No users found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Branding/Assets Tab */}
          <TabsContent value="branding">
            <SiteAssetsManager />
          </TabsContent>

          {/* Marketplace Apps Tab */}
          <TabsContent value="marketplace-apps">
            <MarketplaceApplicationsManager />
          </TabsContent>

          {/* Collections Tab */}
          <TabsContent value="collections">
            <Card>
              <CardHeader className="px-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg sm:text-xl">All Collections</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Manage NFT collections across the platform
                    </CardDescription>
                  </div>
                  <AdminDirectCollectionModal onSuccess={fetchCollections} />
                </div>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {/* Mobile Card Layout */}
                <div className="block sm:hidden space-y-3">
                  <ScrollArea className="h-[400px]">
                    {filteredCollections.map((collection) => (
                      <div key={collection.id} className="border rounded-lg p-3 mb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{collection.name}</p>
                            <p className="text-xs text-muted-foreground">{collection.symbol}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => navigate(`/launchpad/${collection.id}`)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDeleteCollection(collection.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant={collection.status === 'live' ? 'default' : 'secondary'} className="text-xs">
                            {collection.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {collection.minted}/{collection.total_supply} minted
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(collection.created_at), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    ))}
                    {filteredCollections.length === 0 && (
                      <p className="text-center text-muted-foreground py-8 text-sm">No collections found</p>
                    )}
                  </ScrollArea>
                </div>
                {/* Desktop Table Layout */}
                <div className="hidden sm:block">
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Supply</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCollections.map((collection) => (
                          <TableRow key={collection.id}>
                            <TableCell className="font-medium">{collection.name}</TableCell>
                            <TableCell>{collection.symbol}</TableCell>
                            <TableCell>
                              <Badge variant={collection.status === 'live' ? 'default' : 'secondary'}>
                                {collection.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {collection.minted}/{collection.total_supply}
                            </TableCell>
                            <TableCell>
                              {format(new Date(collection.created_at), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => navigate(`/launchpad/${collection.id}`)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteCollection(collection.id)}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredCollections.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              No collections found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Featured Collections Tab */}
          <TabsContent value="featured">
            <FeaturedCollectionsManager />
          </TabsContent>

          {/* Streams Tab */}
          <TabsContent value="streams">
            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="text-lg sm:text-xl">All Streams</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  View and manage streams across the platform
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {/* Mobile Card Layout */}
                <div className="block sm:hidden space-y-3">
                  <ScrollArea className="h-[400px]">
                    {filteredStreams.map((stream) => (
                      <div key={stream.id} className="border rounded-lg p-3 mb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{stream.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {stream.total_views.toLocaleString()} views
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => navigate(`/streamer/${stream.user_id}`)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {stream.is_live ? (
                            <Badge className="bg-green-500 text-xs">Live</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Offline</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(stream.created_at), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    ))}
                    {filteredStreams.length === 0 && (
                      <p className="text-center text-muted-foreground py-8 text-sm">No streams found</p>
                    )}
                  </ScrollArea>
                </div>
                {/* Desktop Table Layout */}
                <div className="hidden sm:block">
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Views</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStreams.map((stream) => (
                          <TableRow key={stream.id}>
                            <TableCell className="font-medium">{stream.title}</TableCell>
                            <TableCell>
                              {stream.is_live ? (
                                <Badge className="bg-green-500">Live</Badge>
                              ) : (
                                <Badge variant="secondary">Offline</Badge>
                              )}
                            </TableCell>
                            <TableCell>{stream.total_views.toLocaleString()}</TableCell>
                            <TableCell>
                              {format(new Date(stream.created_at), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate(`/streamer/${stream.user_id}`)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredStreams.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              No streams found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Buyback Program Tab */}
          <TabsContent value="buyback">
            <div className="space-y-6">
              <BuybackProgramManager />
              <RewardsAllocationManager />
              <RewardDistributionHistory />
            </div>
          </TabsContent>

          {/* Raffles Tab */}
          <TabsContent value="raffles">
            <RaffleManager />
          </TabsContent>

          {/* Blind Boxes Tab */}
          <TabsContent value="blindboxes">
            <BlindBoxManager />
          </TabsContent>

          {/* Official Packs Tab */}
          <TabsContent value="packs">
            <AdminStickerPackManager />
          </TabsContent>

          {/* Bundles Tab */}
          <TabsContent value="bundles">
            <AdminBundleManager />
          </TabsContent>

          {/* Moderation Tab */}
          <TabsContent value="moderation">
            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="text-lg sm:text-xl">Moderation Queue</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Review and moderate flagged content
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {/* Mobile Card Layout */}
                <div className="block sm:hidden space-y-3">
                  <ScrollArea className="h-[400px]">
                    {moderationQueue.map((item) => (
                      <div key={item.id} className="border rounded-lg p-3 mb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <Badge variant="outline" className="text-xs mb-1">
                              {item.content_type}
                            </Badge>
                            <p className="text-sm truncate">
                              {item.content_text || 'N/A'}
                            </p>
                          </div>
                          {item.status === 'pending' && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleModerationAction(item.id, 'approved')}
                              >
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleModerationAction(item.id, 'rejected')}
                              >
                                <XCircle className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge
                            variant={
                              item.status === 'approved' ? 'default' :
                                item.status === 'rejected' ? 'destructive' :
                                  'secondary'
                            }
                            className="text-xs"
                          >
                            {item.status}
                          </Badge>
                          {item.ai_score !== null && (
                            <span className={`text-xs ${item.ai_score > 0.7 ? 'text-destructive' : 'text-muted-foreground'}`}>
                              AI: {(item.ai_score * 100).toFixed(0)}%
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(item.created_at), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    ))}
                    {moderationQueue.length === 0 && (
                      <p className="text-center text-muted-foreground py-8 text-sm">No items in moderation queue</p>
                    )}
                  </ScrollArea>
                </div>
                {/* Desktop Table Layout */}
                <div className="hidden sm:block">
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Content</TableHead>
                          <TableHead>AI Score</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {moderationQueue.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Badge variant="outline">{item.content_type}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {item.content_text || 'N/A'}
                            </TableCell>
                            <TableCell>
                              {item.ai_score !== null ? (
                                <span className={item.ai_score > 0.7 ? 'text-destructive' : ''}>
                                  {(item.ai_score * 100).toFixed(0)}%
                                </span>
                              ) : (
                                'N/A'
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  item.status === 'approved' ? 'default' :
                                    item.status === 'rejected' ? 'destructive' :
                                      'secondary'
                                }
                              >
                                {item.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {format(new Date(item.created_at), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              {item.status === 'pending' && (
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleModerationAction(item.id, 'approved')}
                                  >
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleModerationAction(item.id, 'rejected')}
                                  >
                                    <XCircle className="w-4 h-4 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {moderationQueue.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              No items in moderation queue
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Feature Locks Tab */}
          <TabsContent value="feature-locks">
            <FeatureLocksManager />
          </TabsContent>

          {/* CardStack Tab */}
          <TabsContent value="cardstack">
            <CardStackManager />
          </TabsContent>

          {/* Testimonials Tab */}
          <TabsContent value="testimonials">
            <TestimonialsManager />
          </TabsContent>

          {/* Branding Tab */}
          <TabsContent value="branding">
            <SiteAssetsManager />
          </TabsContent>

          {/* Error Logs Tab */}
          <TabsContent value="errors">
            <ErrorLogManager />
          </TabsContent>
          <TabsContent value="creator-apps">
            <CreatorApplicationsManager />
          </TabsContent>
        </Tabs>

        {/* Ban User Modal */}
        <Dialog open={banModalOpen} onOpenChange={setBanModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ban User</DialogTitle>
              <DialogDescription>
                Ban {selectedUser?.email} from the platform. They will not be able to access their account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Reason (optional)</label>
                <Textarea
                  placeholder="Enter reason for ban..."
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBanModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleBanUser}>
                <Ban className="w-4 h-4 mr-2" />
                Ban User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign Role Modal */}
        <Dialog open={roleModalOpen} onOpenChange={setRoleModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Role</DialogTitle>
              <DialogDescription>
                Change the role for {selectedUser?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Role</label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="moderator">Moderator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRoleModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAssignRole}>
                <UserCog className="w-4 h-4 mr-2" />
                Assign Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default AdminDashboard;
