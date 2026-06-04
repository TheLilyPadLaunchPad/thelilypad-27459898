import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { CheckCircle, XCircle, Search, Loader2, Store, ExternalLink } from 'lucide-react';

interface MarketplaceApplication {
  id: string;
  user_id: string;
  collection_address: string;
  name: string;
  symbol: string;
  image_url: string | null;
  description: string | null;
  total_supply?: number | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}

export const MarketplaceApplicationsManager: React.FC = () => {
  const [applications, setApplications] = useState<MarketplaceApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('marketplace_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      setApplications(data || []);
    } catch (err: any) {
      console.error('Error fetching marketplace applications:', err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [statusFilter]);

  const handleApprove = async (app: MarketplaceApplication) => {
    if (!confirm(`Are you sure you want to approve "${app.name}" and list it on the marketplace?`)) return;
    
    setActionLoading(app.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Insert into collections
      const { error: collectionError } = await supabase
        .from('collections')
        .insert({
          creator_id: app.user_id,
          creator_address: app.collection_address, // Placeholder as we might not know their wallet
          name: app.name,
          symbol: app.symbol,
          image_url: app.image_url,
          description: app.description,
          total_supply: app.total_supply || 0,
          status: 'live',
          contract_address: app.collection_address,
        });

      if (collectionError) {
        if (collectionError.code === '23505') {
          throw new Error('This collection address is already listed in the marketplace.');
        }
        throw collectionError;
      }

      // 2. Update application status
      const { error: updateError } = await supabase
        .from('marketplace_applications')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', app.id);

      if (updateError) throw updateError;

      // 3. Notify user
      await supabase.from('notifications').insert({
        user_id: app.user_id,
        type: 'marketplace_approved',
        title: '🎉 Marketplace Application Approved',
        message: `Your collection "${app.name}" has been approved and is now live on the marketplace!`,
        link: `/marketplace`,
      });

      toast({ title: 'Approved', description: 'Collection added to marketplace successfully.' });
      fetchApplications();
    } catch (err: any) {
      console.error('Error approving application:', err);
      toast({ title: 'Error', description: err.message || 'Failed to approve application', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (appId: string) => {
    if (!confirm('Are you sure you want to reject this application?')) return;
    
    setActionLoading(appId);
    try {
      const { error } = await supabase
        .from('marketplace_applications')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', appId);

      if (error) throw error;
      
      toast({ title: 'Rejected', description: 'Application has been rejected.' });
      fetchApplications();
    } catch (err: any) {
      console.error('Error rejecting application:', err);
      toast({ title: 'Error', description: 'Failed to reject application', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-500 border-yellow-500">Pending</Badge>;
      case 'approved':
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredApps = applications.filter(app => 
    app.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    app.collection_address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
          <Store className="w-5 h-5 text-primary" />
          Marketplace Applications
        </CardTitle>
        <CardDescription>
          Review user requests to list their on-chain collections on the marketplace
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or address..."
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
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
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
            <Store className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No applications found</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collection</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApps.map(app => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {app.image_url ? (
                          <img src={app.image_url} alt={app.name} className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-xs font-bold">
                            {app.symbol.slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{app.name}</p>
                          <p className="text-xs text-muted-foreground">{app.symbol}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <a 
                        href={`https://solscan.io/token/${app.collection_address}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        {app.collection_address.slice(0, 4)}...{app.collection_address.slice(-4)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </TableCell>
                    <TableCell>{getStatusBadge(app.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(app.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      {app.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            title="Reject"
                            disabled={actionLoading === app.id}
                            onClick={() => handleReject(app.id)}
                          >
                            <XCircle className="w-4 h-4 text-destructive" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            title="Approve"
                            disabled={actionLoading === app.id}
                            onClick={() => handleApprove(app)}
                          >
                            {actionLoading === app.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
