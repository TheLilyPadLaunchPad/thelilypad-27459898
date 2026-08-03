import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
    Eye, CheckCircle, XCircle, Video, Calendar, Loader2,
    ExternalLink, Search, UserCog, FileText
} from 'lucide-react';

interface CreatorApplication {
    id: string;
    user_id: string;
    display_name: string;
    email: string;
    content_type: string;
    portfolio_urls: string[];
    social_links: Record<string, string> | null;
    motivation: string | null;
    status: string;
    interview_room_id: string | null;
    interview_scheduled_at: string | null;
    interview_notes: string | null;
    created_at: string;
    reviewed_at: string | null;
    reviewed_by: string | null;
}

export const CreatorApplicationsManager: React.FC = () => {
    const [applications, setApplications] = useState<CreatorApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedApp, setSelectedApp] = useState<CreatorApplication | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [interviewOpen, setInterviewOpen] = useState(false);
    const [interviewDate, setInterviewDate] = useState('');
    const [interviewNotes, setInterviewNotes] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    const fetchApplications = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('creator_beta_applications')
                .select('*')
                .order('created_at', { ascending: false });

            if (statusFilter !== 'all') {
                query = query.eq('status', statusFilter);
            }

            const { data, error } = await query;
            if (error) throw error;
            setApplications((data as unknown as CreatorApplication[]) || []);
        } catch (err) {
            console.error('Error fetching applications:', err);
            toast({ title: 'Error', description: 'Failed to load applications', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchApplications();
    }, [statusFilter]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return <Badge variant="outline" className="text-yellow-500 border-yellow-500">Pending</Badge>;
            case 'reviewing':
                return <Badge variant="outline" className="text-blue-500 border-blue-500">Reviewing</Badge>;
            case 'interview_scheduled':
                return <Badge variant="outline" className="text-purple-500 border-purple-500">Interview</Badge>;
            case 'approved':
                return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Approved</Badge>;
            case 'rejected':
                return <Badge variant="destructive">Rejected</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const handleUpdateStatus = async (appId: string, newStatus: string) => {
        setActionLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('creator_beta_applications')
                .update({
                    status: newStatus,
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                } as any)
                .eq('id', appId);

            if (error) throw error;
            toast({ title: 'Status Updated', description: `Application set to ${newStatus}` });
            fetchApplications();
            setDetailOpen(false);
        } catch (err) {
            console.error('Error updating status:', err);
            toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
        } finally {
            setActionLoading(false);
        }
    };

    const handleScheduleInterview = async () => {
        if (!selectedApp || !interviewDate) return;
        setActionLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const roomId = `thelilypad-interview-${selectedApp.id.slice(0, 12)}`;

            const { error } = await supabase
                .from('creator_beta_applications')
                .update({
                    status: 'interview_scheduled',
                    interview_room_id: roomId,
                    interview_scheduled_at: new Date(interviewDate).toISOString(),
                    interview_notes: interviewNotes || null,
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                } as any)
                .eq('id', selectedApp.id);

            if (error) throw error;

            // Send notification to applicant
            await supabase.from('notifications').insert({
                user_id: selectedApp.user_id,
                type: 'interview_scheduled',
                title: '📅 Interview Scheduled',
                message: `Your creator interview is scheduled for ${new Date(interviewDate).toLocaleString()}. Click to join when it's time.`,
                link: `/interview/${selectedApp.id}`,
            });

            toast({ title: 'Interview Scheduled', description: 'Applicant has been notified.' });
            setInterviewOpen(false);
            setInterviewDate('');
            setInterviewNotes('');
            fetchApplications();
        } catch (err) {
            console.error('Error scheduling interview:', err);
            toast({ title: 'Error', description: 'Failed to schedule interview', variant: 'destructive' });
        } finally {
            setActionLoading(false);
        }
    };

    const handlePromote = async (appId: string) => {
        if (!confirm('Are you sure you want to approve this creator? This will grant them creator privileges.')) return;
        setActionLoading(true);
        try {
            const { error } = await supabase.rpc('promote_to_creator' as any, {
                p_application_id: appId,
            });



            if (error) throw error;
            toast({ title: '🎉 Creator Approved!', description: 'User has been promoted and notified.' });
            fetchApplications();
            setDetailOpen(false);
        } catch (err) {
            console.error('Error promoting:', err);
            toast({ title: 'Error', description: 'Failed to promote creator', variant: 'destructive' });
        } finally {
            setActionLoading(false);
        }
    };

    const filteredApps = applications.filter(app =>
        app.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const statusCounts = {
        all: applications.length,
        pending: applications.filter(a => a.status === 'pending').length,
        reviewing: applications.filter(a => a.status === 'reviewing').length,
        interview_scheduled: applications.filter(a => a.status === 'interview_scheduled').length,
        approved: applications.filter(a => a.status === 'approved').length,
        rejected: applications.filter(a => a.status === 'rejected').length,
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                    <UserCog className="w-5 h-5 text-primary" />
                    Creator Applications
                </CardTitle>
                <CardDescription>Review and manage creator beta program applications</CardDescription>
            </CardHeader>
            <CardContent>
                {/* Filters */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name or email..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full sm:w-48">
                            <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All ({statusCounts.all})</SelectItem>
                            <SelectItem value="pending">Pending ({statusCounts.pending})</SelectItem>
                            <SelectItem value="reviewing">Reviewing ({statusCounts.reviewing})</SelectItem>
                            <SelectItem value="interview_scheduled">Interview ({statusCounts.interview_scheduled})</SelectItem>
                            <SelectItem value="approved">Approved ({statusCounts.approved})</SelectItem>
                            <SelectItem value="rejected">Rejected ({statusCounts.rejected})</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                ) : filteredApps.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
                        <p>No applications found</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile Card Layout */}
                        <div className="block sm:hidden space-y-3">
                            <ScrollArea className="h-[500px]">
                                {filteredApps.map(app => (
                                    <div key={app.id} className="border rounded-lg p-3 mb-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="font-medium text-sm truncate">{app.display_name}</p>
                                                <p className="text-xs text-muted-foreground truncate">{app.email}</p>
                                            </div>
                                            {getStatusBadge(app.status)}
                                        </div>
                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                            <Badge variant="secondary" className="text-xs capitalize">{app.content_type}</Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {format(new Date(app.created_at), 'MMM d, yyyy')}
                                            </span>
                                        </div>
                                        <div className="flex gap-1 mt-2">
                                            <Button variant="ghost" size="sm" onClick={() => { setSelectedApp(app); setDetailOpen(true); }}>
                                                <Eye className="w-3 h-3 mr-1" /> View
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </ScrollArea>
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden sm:block">
                            <ScrollArea className="h-[500px]">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Applicant</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Applied</TableHead>
                                            <TableHead>Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredApps.map(app => (
                                            <TableRow key={app.id}>
                                                <TableCell>
                                                    <div>
                                                        <p className="font-medium">{app.display_name}</p>
                                                        <p className="text-xs text-muted-foreground">{app.email}</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className="capitalize">{app.content_type}</Badge>
                                                </TableCell>
                                                <TableCell>{getStatusBadge(app.status)}</TableCell>
                                                <TableCell className="text-muted-foreground text-sm">
                                                    {format(new Date(app.created_at), 'MMM d, yyyy')}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <Button variant="ghost" size="icon" title="View Details" onClick={() => { setSelectedApp(app); setDetailOpen(true); }}>
                                                            <Eye className="w-4 h-4" />
                                                        </Button>
                                                        {app.status === 'pending' && (
                                                            <Button variant="ghost" size="icon" title="Start Review" onClick={() => handleUpdateStatus(app.id, 'reviewing')}>
                                                                <FileText className="w-4 h-4 text-blue-500" />
                                                            </Button>
                                                        )}
                                                        {(app.status === 'reviewing' || app.status === 'pending') && (
                                                            <Button variant="ghost" size="icon" title="Schedule Interview" onClick={() => { setSelectedApp(app); setInterviewOpen(true); }}>
                                                                <Calendar className="w-4 h-4 text-purple-500" />
                                                            </Button>
                                                        )}
                                                        {app.status === 'interview_scheduled' && (
                                                            <>
                                                                <Button variant="ghost" size="icon" title="Join Interview" onClick={() => window.open(`/interview/${app.id}`, '_blank')}>
                                                                    <Video className="w-4 h-4 text-primary" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" title="Approve Creator" onClick={() => handlePromote(app.id)} disabled={actionLoading}>
                                                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                                                </Button>
                                                            </>
                                                        )}
                                                        {app.status !== 'approved' && app.status !== 'rejected' && (
                                                            <Button variant="ghost" size="icon" title="Reject" onClick={() => handleUpdateStatus(app.id, 'rejected')} disabled={actionLoading}>
                                                                <XCircle className="w-4 h-4 text-destructive" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </div>
                    </>
                )}
            </CardContent>

            {/* Detail Modal */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Application Details</DialogTitle>
                        <DialogDescription>Review the full application</DialogDescription>
                    </DialogHeader>
                    {selectedApp && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="p-3 rounded-lg bg-muted/30">
                                    <p className="text-muted-foreground text-xs">Name</p>
                                    <p className="font-medium">{selectedApp.display_name}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-muted/30">
                                    <p className="text-muted-foreground text-xs">Email</p>
                                    <p className="font-medium">{selectedApp.email}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-muted/30">
                                    <p className="text-muted-foreground text-xs">Type</p>
                                    <p className="font-medium capitalize">{selectedApp.content_type}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-muted/30">
                                    <p className="text-muted-foreground text-xs">Status</p>
                                    {getStatusBadge(selectedApp.status)}
                                </div>
                            </div>

                            {/* Portfolio */}
                            <div className="p-3 rounded-lg bg-muted/30">
                                <p className="text-muted-foreground text-xs mb-2">Portfolio Links</p>
                                {selectedApp.portfolio_urls?.map((url: string, i: number) => (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline mb-1">
                                        <ExternalLink className="w-3 h-3" /> {url}
                                    </a>
                                ))}
                            </div>

                            {/* Socials */}
                            {selectedApp.social_links && Object.keys(selectedApp.social_links).length > 0 && (
                                <div className="p-3 rounded-lg bg-muted/30">
                                    <p className="text-muted-foreground text-xs mb-2">Social Links</p>
                                    {Object.entries(selectedApp.social_links).map(([platform, url]) => (
                                        <a key={platform} href={url as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline mb-1 capitalize">
                                            <ExternalLink className="w-3 h-3" /> {platform}: {url as string}
                                        </a>
                                    ))}
                                </div>
                            )}

                            {/* Motivation */}
                            {selectedApp.motivation && (
                                <div className="p-3 rounded-lg bg-muted/30">
                                    <p className="text-muted-foreground text-xs mb-2">Motivation</p>
                                    <p className="text-sm whitespace-pre-wrap">{selectedApp.motivation}</p>
                                </div>
                            )}

                            {/* Admin Actions */}
                            <DialogFooter className="flex-col sm:flex-row gap-2">
                                {selectedApp.status !== 'approved' && selectedApp.status !== 'rejected' && (
                                    <>
                                        <Button variant="outline" className="gap-2" onClick={() => { setDetailOpen(false); setInterviewOpen(true); }}>
                                            <Calendar className="w-4 h-4" /> Schedule Interview
                                        </Button>
                                        <Button variant="destructive" className="gap-2" onClick={() => handleUpdateStatus(selectedApp.id, 'rejected')} disabled={actionLoading}>
                                            <XCircle className="w-4 h-4" /> Reject
                                        </Button>
                                        <Button className="gap-2 bg-green-600 hover:bg-green-700" onClick={() => handlePromote(selectedApp.id)} disabled={actionLoading}>
                                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                            Approve & Promote
                                        </Button>
                                    </>
                                )}
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Schedule Interview Modal */}
            <Dialog open={interviewOpen} onOpenChange={setInterviewOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Schedule Interview</DialogTitle>
                        <DialogDescription>
                            Set a date/time for {selectedApp?.display_name}'s interview. A private video room will be created automatically.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium">Interview Date & Time *</label>
                            <Input
                                type="datetime-local"
                                value={interviewDate}
                                onChange={e => setInterviewDate(e.target.value)}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Internal Notes (optional)</label>
                            <Textarea
                                placeholder="Any notes about this applicant..."
                                value={interviewNotes}
                                onChange={e => setInterviewNotes(e.target.value)}
                                className="mt-1"
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setInterviewOpen(false)}>Cancel</Button>
                        <Button onClick={handleScheduleInterview} disabled={!interviewDate || actionLoading} className="gap-2">
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                            Schedule & Notify
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
};
