import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useBetaMode } from '@/hooks/useBetaMode';
import {
    ShieldCheck,
    X,
    ChevronUp,
    ChevronDown,
    Users,
    Layers,
    AlertTriangle,
    Eye,
    Trash2,
    CheckCircle,
    XCircle,
    Ban,
    Video,
    Sparkles,
    RefreshCw,
    BarChart3,
    Bell,
    Settings,
    ExternalLink,
    Loader2,
    Crown,
    Activity,
    Database,
    Wrench,
    Lock,
    Unlock,
    FlaskConical,
} from 'lucide-react';

// --- Types ---
interface QuickStats {
    totalUsers: number;
    totalCollections: number;
    liveStreams: number;
    pendingModeration: number;
    recentErrors: number;
}

interface RecentCollection {
    id: string;
    name: string;
    status: string;
    created_at: string;
    minted: number;
    total_supply: number;
}

interface PendingModerationItem {
    id: string;
    content_type: string;
    content_text: string | null;
    created_at: string;
}

// --- Component ---
export const AdminToolbar: React.FC = () => {
    const { isAdmin } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();

    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [activeSection, setActiveSection] = useState<'overview' | 'collections' | 'moderation' | 'quick-actions'>('overview');
    const [betaToggling, setBetaToggling] = useState(false);

    const { isBetaMode, toggle: toggleBetaMode } = useBetaMode();

    const shouldShow = isAdmin && location.pathname !== '/admin';

    // --- Data Fetching ---
    const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
        queryKey: ['admin-toolbar-stats'],
        queryFn: async (): Promise<QuickStats> => {
            const [
                collectionsRes,
                streamsRes,
                moderationRes,
                errorsRes,
            ] = await Promise.all([
                supabase.from('collections').select('id', { count: 'exact', head: true }),
                supabase.from('streams').select('id', { count: 'exact', head: true }).eq('is_live', true),
                supabase.from('moderation_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
                supabase.from('error_logs').select('id', { count: 'exact', head: true }).eq('is_resolved', false),
            ]);
            return {
                totalUsers: 0, // Fetched separately via edge function
                totalCollections: collectionsRes.count || 0,
                liveStreams: streamsRes.count || 0,
                pendingModeration: moderationRes.count || 0,
                recentErrors: errorsRes.count || 0,
            };
        },
        enabled: shouldShow && isOpen,
        staleTime: 30000,
        refetchInterval: isOpen ? 60000 : false,
    });

    const { data: recentCollections, isLoading: collectionsLoading } = useQuery({
        queryKey: ['admin-toolbar-collections'],
        queryFn: async (): Promise<RecentCollection[]> => {
            const { data, error } = await supabase
                .from('collections')
                .select('id, name, status, created_at, minted, total_supply')
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(5);
            if (error) throw error;
            return data || [];
        },
        enabled: shouldShow && isOpen && activeSection === 'collections',
        staleTime: 30000,
    });

    const { data: moderationItems, isLoading: moderationLoading } = useQuery({
        queryKey: ['admin-toolbar-moderation'],
        queryFn: async (): Promise<PendingModerationItem[]> => {
            const { data, error } = await supabase
                .from('moderation_queue')
                .select('id, content_type, content_text, created_at')
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(5);
            if (error) throw error;
            return data || [];
        },
        enabled: shouldShow && isOpen && activeSection === 'moderation',
        staleTime: 30000,
    });

    // --- Actions ---
    const handleModerationAction = useCallback(async (id: string, action: 'approved' | 'rejected') => {
        const { error } = await supabase
            .from('moderation_queue')
            .update({ status: action, reviewed_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            toast.error('Failed to update moderation status');
        } else {
            toast.success(`Content ${action}`);
            queryClient.invalidateQueries({ queryKey: ['admin-toolbar-moderation'] });
            queryClient.invalidateQueries({ queryKey: ['admin-toolbar-stats'] });
        }
    }, [queryClient]);

    const handleDeleteCollection = useCallback(async (id: string) => {
        if (!confirm('Delete this collection? This will hide it from the marketplace and launchpad.')) return;

        // Use soft delete (setting deleted_at) to align with app architecture
        const { error } = await supabase
            .from('collections')
            .update({
                deleted_at: new Date().toISOString(),
                status: 'deleted'
            })
            .eq('id', id);

        if (error) {
            console.error('Delete error:', error);
            toast.error('Failed to delete collection: ' + error.message);
        } else {
            toast.success('Collection moved to trash');
            queryClient.invalidateQueries({ queryKey: ['admin-toolbar-collections'] });
            queryClient.invalidateQueries({ queryKey: ['admin-toolbar-stats'] });
            // Invalidate marketplace queries too
            queryClient.invalidateQueries({ queryKey: ['marketplace-collections'] });
        }
    }, [queryClient]);

    const refreshAll = useCallback(() => {
        refetchStats();
        queryClient.invalidateQueries({ queryKey: ['admin-toolbar-collections'] });
        queryClient.invalidateQueries({ queryKey: ['admin-toolbar-moderation'] });
        toast.success('Admin data refreshed');
    }, [refetchStats, queryClient]);

    const handleBetaToggle = useCallback(async () => {
        setBetaToggling(true);
        try {
            await toggleBetaMode();
            toast.success(
                !isBetaMode
                    ? '🔒 Beta mode ON — users are now locked to the Wait Room'
                    : '🟢 Beta mode OFF — app is now open to all users'
            );
        } catch (err: any) {
            toast.error('Failed to update beta mode: ' + (err?.message || 'Unknown error'));
        } finally {
            setBetaToggling(false);
        }
    }, [toggleBetaMode, isBetaMode]);

    // --- Keyboard Shortcut ---
    useEffect(() => {
        const handleKeyboard = (e: KeyboardEvent) => {
            // Ctrl+Shift+A to toggle admin toolbar
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyboard);
        return () => window.removeEventListener('keydown', handleKeyboard);
    }, []);

    // Stat badge color
    const statColor = (val: number, warn = 5, crit = 10) =>
        val >= crit ? 'bg-red-500' : val >= warn ? 'bg-yellow-500' : 'bg-green-500';

    // Navigation items for quick actions
    const quickNavItems = [
        { label: 'Full Dashboard', href: '/admin', icon: ShieldCheck, accent: true },
        { label: 'User Management', href: '/admin', icon: Users, tab: 'users' },
        { label: 'Collections', href: '/admin', icon: Layers, tab: 'collections' },
        { label: 'Featured', href: '/admin', icon: Sparkles, tab: 'featured' },
        { label: 'Moderation', href: '/admin', icon: AlertTriangle, tab: 'moderation' },
        { label: 'Error Logs', href: '/admin', icon: AlertTriangle, tab: 'errors' },
        { label: 'Streams', href: '/admin', icon: Video, tab: 'streams' },
        { label: 'Settings', href: '/admin', icon: Settings, tab: 'feature-locks' },
    ];

    if (!shouldShow) return null;

    return (
        <>
            {/* Floating Toggle Button */}
            <motion.button
                className="fixed bottom-20 right-4 z-[100] w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-110 transition-transform"
                onClick={() => setIsOpen(prev => !prev)}
                whileTap={{ scale: 0.9 }}
                title="Admin Controls (Ctrl+Shift+A)"
            >
                <ShieldCheck className="w-5 h-5" />
                {stats && stats.pendingModeration > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                        {stats.pendingModeration > 9 ? '9+' : stats.pendingModeration}
                    </span>
                )}
            </motion.button>

            {/* Admin Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 40, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 40, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed bottom-36 right-4 z-[100] w-[360px] max-h-[70vh] bg-background border border-border/60 rounded-2xl shadow-2xl shadow-black/20 overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-border/50">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-primary" />
                                <span className="font-bold text-sm">Admin Controls</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary">
                                    LIVE
                                </Badge>
                            </div>
                            {/* ── Beta Mode Toggle — always visible ── */}
                            <div className="flex items-center gap-2">
                                <motion.div
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold border transition-colors ${
                                        isBetaMode
                                            ? 'bg-red-500/15 border-red-500/40 text-red-400'
                                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                    }`}
                                    layout
                                >
                                    {isBetaMode
                                        ? <><Lock className="w-2.5 h-2.5" /> BETA LOCKED</>  
                                        : <><Unlock className="w-2.5 h-2.5" /> APP OPEN</>}
                                </motion.div>
                                <Switch
                                    id="admin-beta-mode-toggle"
                                    checked={isBetaMode}
                                    onCheckedChange={handleBetaToggle}
                                    disabled={betaToggling}
                                    className="data-[state=checked]:bg-red-500 scale-75"
                                />
                            </div>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refreshAll} title="Refresh">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsMinimized(prev => !prev)}>
                                    {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
                                    <X className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>

                        {!isMinimized && (
                            <>
                                {/* Quick Stats Bar */}
                                <div className="grid grid-cols-4 gap-px bg-border/30">
                                    {[
                                        { label: 'Collections', value: stats?.totalCollections ?? '—', icon: Layers, color: 'text-blue-400' },
                                        { label: 'Live', value: stats?.liveStreams ?? '—', icon: Activity, color: 'text-green-400' },
                                        { label: 'Pending', value: stats?.pendingModeration ?? '—', icon: AlertTriangle, color: stats?.pendingModeration ? 'text-yellow-400' : 'text-muted-foreground' },
                                        { label: 'Errors', value: stats?.recentErrors ?? '—', icon: AlertTriangle, color: stats?.recentErrors ? 'text-red-400' : 'text-muted-foreground' },
                                    ].map((stat) => (
                                        <div key={stat.label} className="flex flex-col items-center py-2.5 bg-background hover:bg-muted/50 transition-colors cursor-default">
                                            <stat.icon className={`w-3.5 h-3.5 ${stat.color} mb-0.5`} />
                                            <span className="text-lg font-bold leading-none">
                                                {statsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : stat.value}
                                            </span>
                                            <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">{stat.label}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Section Tabs */}
                                <div className="flex border-b border-border/50">
                                    {(['overview', 'collections', 'moderation', 'quick-actions'] as const).map((section) => (
                                        <button
                                            key={section}
                                            onClick={() => setActiveSection(section)}
                                            className={`flex-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${activeSection === section
                                                ? 'text-primary border-b-2 border-primary bg-primary/5'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                                                }`}
                                        >
                                            {section === 'quick-actions' ? 'Actions' : section}
                                        </button>
                                    ))}
                                </div>

                                {/* Content */}
                                <ScrollArea className="flex-1 max-h-[340px]">
                                    <div className="p-3">
                                        {/* Overview Section */}
                                        {activeSection === 'overview' && (
                                            <div className="space-y-2">
                                                {quickNavItems.map((item) => (
                                                    <button
                                                        key={item.label}
                                                        onClick={() => {
                                                            navigate(item.href);
                                                            setIsOpen(false);
                                                        }}
                                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left group ${item.accent
                                                            ? 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20'
                                                            : 'hover:bg-muted/60'
                                                            }`}
                                                    >
                                                        <item.icon className={`w-4 h-4 ${item.accent ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                                                        <span className={`text-sm font-medium flex-1 ${item.accent ? 'text-primary' : ''}`}>
                                                            {item.label}
                                                        </span>
                                                        <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Collections Section */}
                                        {activeSection === 'collections' && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-semibold text-muted-foreground uppercase">Recent Collections</span>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 text-[10px] px-2"
                                                        onClick={() => { navigate('/admin'); setIsOpen(false); }}
                                                    >
                                                        View All
                                                    </Button>
                                                </div>
                                                {collectionsLoading ? (
                                                    <div className="flex justify-center py-6">
                                                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                                    </div>
                                                ) : recentCollections && recentCollections.length > 0 ? (
                                                    recentCollections.map((col) => (
                                                        <div key={col.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 transition-colors group">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium truncate">{col.name}</p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <Badge
                                                                        variant={col.status === 'active' || col.status === 'live' ? 'default' : 'secondary'}
                                                                        className="text-[9px] h-4 px-1.5"
                                                                    >
                                                                        {col.status}
                                                                    </Badge>
                                                                    <span className="text-[10px] text-muted-foreground">
                                                                        {col.minted}/{col.total_supply} minted
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7"
                                                                    onClick={() => { navigate(`/launchpad/${col.id}`); setIsOpen(false); }}
                                                                    title="View"
                                                                >
                                                                    <Eye className="w-3.5 h-3.5" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 text-destructive"
                                                                    onClick={() => handleDeleteCollection(col.id)}
                                                                    title="Delete"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-center text-sm text-muted-foreground py-6">No collections yet</p>
                                                )}
                                            </div>
                                        )}

                                        {/* Moderation Section */}
                                        {activeSection === 'moderation' && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-semibold text-muted-foreground uppercase">Pending Review</span>
                                                    <Badge variant="outline" className="text-[10px] h-4">
                                                        {stats?.pendingModeration ?? 0} pending
                                                    </Badge>
                                                </div>
                                                {moderationLoading ? (
                                                    <div className="flex justify-center py-6">
                                                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                                    </div>
                                                ) : moderationItems && moderationItems.length > 0 ? (
                                                    moderationItems.map((item) => (
                                                        <div key={item.id} className="flex items-start gap-2 p-2.5 rounded-lg border border-border/40 hover:bg-muted/40 transition-colors">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1.5">
                                                                    <Badge variant="outline" className="text-[9px] h-4 px-1.5">{item.content_type}</Badge>
                                                                </div>
                                                                <p className="text-xs text-muted-foreground truncate mt-1">
                                                                    {item.content_text || 'No text content'}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7"
                                                                    onClick={() => handleModerationAction(item.id, 'approved')}
                                                                    title="Approve"
                                                                >
                                                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7"
                                                                    onClick={() => handleModerationAction(item.id, 'rejected')}
                                                                    title="Reject"
                                                                >
                                                                    <XCircle className="w-4 h-4 text-destructive" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-center py-6">
                                                        <CheckCircle className="w-8 h-8 text-green-500/50 mx-auto mb-2" />
                                                        <p className="text-sm text-muted-foreground">Queue is clear!</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Quick Actions Section */}
                                        {activeSection === 'quick-actions' && (
                                            <div className="space-y-2">
                                                <span className="text-xs font-semibold text-muted-foreground uppercase">Quick Actions</span>

                                                {/* Beta Mode Card */}
                                                <div className={`rounded-lg border p-3 transition-colors ${
                                                    isBetaMode
                                                        ? 'border-red-500/30 bg-red-500/5'
                                                        : 'border-emerald-500/20 bg-emerald-500/5'
                                                }`}>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-start gap-2.5">
                                                            <FlaskConical className={`w-4 h-4 mt-0.5 shrink-0 ${
                                                                isBetaMode ? 'text-red-400' : 'text-emerald-400'
                                                            }`} />
                                                            <div>
                                                                <p className="text-sm font-semibold leading-tight">
                                                                    Beta Mode
                                                                </p>
                                                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                                                    {isBetaMode
                                                                        ? 'Users are locked to the Wait Room'
                                                                        : 'App is open — users have full access'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <Switch
                                                            id="admin-beta-mode-toggle-actions"
                                                            checked={isBetaMode}
                                                            onCheckedChange={handleBetaToggle}
                                                            disabled={betaToggling}
                                                            className="data-[state=checked]:bg-red-500 shrink-0"
                                                        />
                                                    </div>
                                                </div>

                                                <Separator className="my-1" />

                                                <button
                                                    onClick={() => {
                                                        queryClient.invalidateQueries();
                                                        toast.success('All caches cleared and data refreshed');
                                                    }}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left"
                                                >
                                                    <RefreshCw className="w-4 h-4 text-blue-400" />
                                                    <div>
                                                        <p className="text-sm font-medium">Purge All Caches</p>
                                                        <p className="text-[10px] text-muted-foreground">Force-refresh all cached data across the app</p>
                                                    </div>
                                                </button>

                                                <button
                                                    onClick={() => { navigate('/admin'); setIsOpen(false); }}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left"
                                                >
                                                    <Users className="w-4 h-4 text-green-400" />
                                                    <div>
                                                        <p className="text-sm font-medium">Manage Users</p>
                                                        <p className="text-[10px] text-muted-foreground">Ban, verify, or change user roles</p>
                                                    </div>
                                                </button>

                                                <button
                                                    onClick={() => { navigate('/admin'); setIsOpen(false); }}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left"
                                                >
                                                    <Sparkles className="w-4 h-4 text-yellow-400" />
                                                    <div>
                                                        <p className="text-sm font-medium">Featured Collections</p>
                                                        <p className="text-[10px] text-muted-foreground">Manage homepage featured section</p>
                                                    </div>
                                                </button>

                                                <button
                                                    onClick={() => { navigate('/admin'); setIsOpen(false); }}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left"
                                                >
                                                    <Database className="w-4 h-4 text-purple-400" />
                                                    <div>
                                                        <p className="text-sm font-medium">View Error Logs</p>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            {stats?.recentErrors ? `${stats.recentErrors} unresolved errors` : 'Check application errors'}
                                                        </p>
                                                    </div>
                                                </button>

                                                <Separator className="my-2" />

                                                <button
                                                    onClick={async () => {
                                                        const confirmed = confirm('This will clear all resolved error logs older than 7 days. Continue?');
                                                        if (!confirmed) return;
                                                        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                                                        const { error } = await supabase
                                                            .from('error_logs')
                                                            .delete()
                                                            .eq('is_resolved', true)
                                                            .lt('created_at', weekAgo);
                                                        if (error) {
                                                            toast.error('Failed to clean up error logs');
                                                        } else {
                                                            toast.success('Old resolved error logs cleaned up');
                                                            queryClient.invalidateQueries({ queryKey: ['admin-toolbar-stats'] });
                                                        }
                                                    }}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 transition-colors text-left"
                                                >
                                                    <Wrench className="w-4 h-4 text-red-400" />
                                                    <div>
                                                        <p className="text-sm font-medium text-red-400">Clean Up Error Logs</p>
                                                        <p className="text-[10px] text-muted-foreground">Delete resolved errors older than 7 days</p>
                                                    </div>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>

                                {/* Footer */}
                                <div className="px-3 py-2 border-t border-border/50 bg-muted/20">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                                            Ctrl+Shift+A to toggle
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-[10px] gap-1 text-primary"
                                            onClick={() => { navigate('/admin'); setIsOpen(false); }}
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                            Full Dashboard
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};
