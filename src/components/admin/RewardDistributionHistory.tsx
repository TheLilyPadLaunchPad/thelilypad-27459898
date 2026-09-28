import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  History, 
  Calendar, 
  Users, 
  Coins, 
  CheckCircle2,
  Clock,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Trophy,
  Eye,
  Download,
  Loader2,
  Filter,
  X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { toast } from "@/hooks/use-toast";

type ClaimStatusFilter = 'all' | 'fully_claimed' | 'partially_claimed' | 'unclaimed';

interface RewardPeriodSummary {
  period_start: string;
  period_end: string;
  total_distributed: number;
  total_claimed: number;
  recipient_count: number;
  claimed_count: number;
  top_reward: number;
  total_weighted_volume: number;
}

interface RecipientDetail {
  id: string;
  user_id: string;
  rank: number;
  reward_amount: number;
  weighted_volume: number;
  is_claimed: boolean;
  claimed_at: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

export function RewardDistributionHistory() {
  const [selectedPeriod, setSelectedPeriod] = useState<RewardPeriodSummary | null>(null);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  
  // Filter states
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [claimStatus, setClaimStatus] = useState<ClaimStatusFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  const { data: history, isLoading } = useQuery({
    queryKey: ['reward-distribution-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volume_rewards')
        .select('*')
        .order('reward_period_end', { ascending: false });

      if (error) throw error;

      // Group by period
      const periodMap = new Map<string, RewardPeriodSummary>();
      
      data?.forEach(reward => {
        const key = `${reward.reward_period_start}-${reward.reward_period_end}`;
        const existing = periodMap.get(key);
        
        if (existing) {
          existing.total_distributed += Number(reward.reward_amount);
          existing.total_claimed += reward.is_claimed ? Number(reward.reward_amount) : 0;
          existing.recipient_count += 1;
          existing.claimed_count += reward.is_claimed ? 1 : 0;
          existing.top_reward = Math.max(existing.top_reward, Number(reward.reward_amount));
          existing.total_weighted_volume += Number(reward.weighted_volume);
        } else {
          periodMap.set(key, {
            period_start: reward.reward_period_start,
            period_end: reward.reward_period_end,
            total_distributed: Number(reward.reward_amount),
            total_claimed: reward.is_claimed ? Number(reward.reward_amount) : 0,
            recipient_count: 1,
            claimed_count: reward.is_claimed ? 1 : 0,
            top_reward: Number(reward.reward_amount),
            total_weighted_volume: Number(reward.weighted_volume),
          });
        }
      });

      return Array.from(periodMap.values()).sort(
        (a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime()
      );
    },
  });

  // Fetch recipients for selected period
  const { data: recipients, isLoading: isLoadingRecipients } = useQuery({
    queryKey: ['period-recipients', selectedPeriod?.period_start, selectedPeriod?.period_end],
    queryFn: async () => {
      if (!selectedPeriod) return [];

      const { data, error } = await supabase
        .from('volume_rewards')
        .select('*')
        .eq('reward_period_start', selectedPeriod.period_start)
        .eq('reward_period_end', selectedPeriod.period_end)
        .order('rank', { ascending: true });

      if (error) throw error;

      // Fetch profiles
      if (data && data.length > 0) {
        const userIds = data.map(r => r.user_id);
        const { data: profiles } = await supabase
          .from('streamer_profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', userIds);

        const typedProfiles = profiles as { user_id: string; display_name: string; avatar_url: string }[] | null;
        const profileMap = new Map(
          typedProfiles?.map(p => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }]) || []
        );

        return data.map(reward => ({
          ...reward,
          display_name: profileMap.get(reward.user_id)?.display_name,
          avatar_url: profileMap.get(reward.user_id)?.avatar_url,
        })) as RecipientDetail[];
      }

      return data as RecipientDetail[];
    },
    enabled: !!selectedPeriod,
  });

  const formatPeriod = (start: string, end: string) => {
    return `${format(new Date(start), 'MMM d')} - ${format(new Date(end), 'MMM d, yyyy')}`;
  };

  const getClaimProgress = (claimed: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((claimed / total) * 100);
  };

  const togglePeriod = (periodKey: string) => {
    setExpandedPeriods(prev => {
      const next = new Set(prev);
      if (next.has(periodKey)) {
        next.delete(periodKey);
      } else {
        next.add(periodKey);
      }
      return next;
    });
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">🥇 1st</Badge>;
    if (rank === 2) return <Badge className="bg-gray-400/20 text-gray-400 border-gray-400/30">🥈 2nd</Badge>;
    if (rank === 3) return <Badge className="bg-amber-600/20 text-amber-500 border-amber-600/30">🥉 3rd</Badge>;
    return <Badge variant="outline">#{rank}</Badge>;
  };

  const getDisplayName = (recipient: RecipientDetail) => {
    if (recipient.display_name) return recipient.display_name;
    return `${recipient.user_id.slice(0, 8)}...`;
  };

  // Filter history based on selected filters
  const filteredHistory = useMemo(() => {
    if (!history) return [];
    
    return history.filter(period => {
      // Date range filter
      if (dateFrom) {
        const fromDate = startOfDay(parseISO(dateFrom));
        const periodEnd = new Date(period.period_end);
        if (isBefore(periodEnd, fromDate)) return false;
      }
      
      if (dateTo) {
        const toDate = endOfDay(parseISO(dateTo));
        const periodStart = new Date(period.period_start);
        if (isAfter(periodStart, toDate)) return false;
      }
      
      // Claim status filter
      if (claimStatus !== 'all') {
        const isFullyClaimed = period.claimed_count === period.recipient_count;
        const isPartiallyClaimed = period.claimed_count > 0 && period.claimed_count < period.recipient_count;
        const isUnclaimed = period.claimed_count === 0;
        
        if (claimStatus === 'fully_claimed' && !isFullyClaimed) return false;
        if (claimStatus === 'partially_claimed' && !isPartiallyClaimed) return false;
        if (claimStatus === 'unclaimed' && !isUnclaimed) return false;
      }
      
      return true;
    });
  }, [history, dateFrom, dateTo, claimStatus]);

  // Calculate totals from filtered history
  const totals = filteredHistory.reduce(
    (acc, period) => ({
      totalDistributed: acc.totalDistributed + period.total_distributed,
      totalClaimed: acc.totalClaimed + period.total_claimed,
      totalRecipients: acc.totalRecipients + period.recipient_count,
    }),
    { totalDistributed: 0, totalClaimed: 0, totalRecipients: 0 }
  );

  const hasActiveFilters = dateFrom || dateTo || claimStatus !== 'all';

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setClaimStatus('all');
  };

  // Export to CSV
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      // Fetch all reward data
      const { data: allRewards, error } = await supabase
        .from('volume_rewards')
        .select('*')
        .order('reward_period_end', { ascending: false });

      if (error) throw error;

      // Fetch profiles for display names
      const userIds = [...new Set(allRewards?.map(r => r.user_id) || [])];
      const { data: profiles } = await supabase
        .from('streamer_profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);

      const profileMap = new Map(
        profiles?.map(p => [p.user_id, p.display_name]) || []
      );

      // Build CSV content
      const headers = [
        'Period Start',
        'Period End',
        'User ID',
        'Display Name',
        'Rank',
        'Reward Amount (SOL)',
        'Weighted Volume',
        'Status',
        'Claimed At',
        'Created At'
      ];

      const rows = allRewards?.map(reward => [
        format(new Date(reward.reward_period_start), 'yyyy-MM-dd'),
        format(new Date(reward.reward_period_end), 'yyyy-MM-dd'),
        reward.user_id,
        profileMap.get(reward.user_id) || 'Unknown',
        reward.rank,
        Number(reward.reward_amount).toFixed(4),
        Number(reward.weighted_volume).toFixed(4),
        reward.is_claimed ? 'Claimed' : 'Pending',
        reward.claimed_at ? format(new Date(reward.claimed_at), 'yyyy-MM-dd HH:mm:ss') : '',
        format(new Date(reward.created_at), 'yyyy-MM-dd HH:mm:ss')
      ]) || [];

      // Escape CSV values
      const escapeCSV = (value: string | number) => {
        let str = String(value);
        // Neutralize spreadsheet formulas (CSV injection)
        if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
      ].join('\n');

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `reward-distribution-history-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export Complete",
        description: `Exported ${allRewards?.length || 0} reward records to CSV.`,
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "Export Failed",
        description: "Unable to export reward history. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Reward Distribution History
              </CardTitle>
              <CardDescription>
                View all past reward allocations and claim status. Click a period to see recipients.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={isExporting || !history || history.length === 0}
                className="gap-2"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export CSV
                  </>
                )}
              </Button>
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2"
              >
                <Filter className="w-4 h-4" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                    {[dateFrom, dateTo, claimStatus !== 'all'].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      <CardContent className="space-y-6">
        {/* Filters Panel */}
        {showFilters && (
          <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filter Options
              </h4>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
                  <X className="w-3 h-3" />
                  Clear All
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date-from">From Date</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date-to">To Date</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Claim Status</Label>
                <Select value={claimStatus} onValueChange={(v) => setClaimStatus(v as ClaimStatusFilter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="fully_claimed">Fully Claimed</SelectItem>
                    <SelectItem value="partially_claimed">Partially Claimed</SelectItem>
                    <SelectItem value="unclaimed">Unclaimed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {hasActiveFilters && (
              <p className="text-xs text-muted-foreground">
                Showing {filteredHistory.length} of {history?.length || 0} periods
              </p>
            )}
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Coins className="w-4 h-4" />
              Total Distributed {hasActiveFilters && '(Filtered)'}
            </div>
            <p className="text-2xl font-bold text-primary">
              {totals.totalDistributed.toFixed(2)} SOL
            </p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Total Claimed {hasActiveFilters && '(Filtered)'}
            </div>
            <p className="text-2xl font-bold text-green-500">
              {totals.totalClaimed.toFixed(2)} SOL
            </p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Users className="w-4 h-4" />
              Total Recipients {hasActiveFilters && '(Filtered)'}
            </div>
            <p className="text-2xl font-bold">
              {totals.totalRecipients}
            </p>
          </div>
        </div>

        {/* History Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredHistory.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Total Pool</TableHead>
                    <TableHead>Top Reward</TableHead>
                    <TableHead>Claim Status</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((period, index) => {
                    const periodKey = `${period.period_start}-${period.period_end}`;
                    const claimProgress = getClaimProgress(period.claimed_count, period.recipient_count);
                    const isFullyClaimed = period.claimed_count === period.recipient_count;
                    const isExpanded = expandedPeriods.has(periodKey);
                    
                    return (
                      <TableRow 
                        key={index}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => togglePeriod(periodKey)}
                      >
                        <TableCell>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">
                              {formatPeriod(period.period_start, period.period_end)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            {period.recipient_count}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-primary">
                            {period.total_distributed.toFixed(2)} SOL
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {period.top_reward.toFixed(2)} SOL
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isFullyClaimed ? (
                            <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              All Claimed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Clock className="w-3 h-3" />
                              {period.claimed_count}/{period.recipient_count} ({claimProgress}%)
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPeriod(period);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">
              <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No reward distributions yet</p>
              <p className="text-sm">
                Allocate rewards to top traders to see the history here
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recipient Details Modal */}
      <Dialog open={!!selectedPeriod} onOpenChange={() => setSelectedPeriod(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              Reward Recipients
            </DialogTitle>
            <DialogDescription>
              {selectedPeriod && formatPeriod(selectedPeriod.period_start, selectedPeriod.period_end)}
              {" • "}
              {selectedPeriod?.total_distributed.toFixed(2)} SOL distributed
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[400px]">
            {isLoadingRecipients ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recipients && recipients.length > 0 ? (
              <div className="space-y-2 p-1">
                {recipients.map((recipient) => (
                  <div
                    key={recipient.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      recipient.is_claimed 
                        ? 'bg-green-500/5 border-green-500/20' 
                        : 'bg-muted/30 border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {getRankBadge(recipient.rank)}
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={recipient.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {recipient.display_name?.slice(0, 2).toUpperCase() || 
                           recipient.user_id.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{getDisplayName(recipient)}</p>
                        <p className="text-xs text-muted-foreground">
                          Volume: {Number(recipient.weighted_volume).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary">
                        {Number(recipient.reward_amount).toFixed(2)} SOL
                      </p>
                      {recipient.is_claimed ? (
                        <p className="text-xs text-green-500 flex items-center gap-1 justify-end">
                          <CheckCircle2 className="w-3 h-3" />
                          Claimed {recipient.claimed_at && format(new Date(recipient.claimed_at), 'MMM d')}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3" />
                          Pending
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No recipients found for this period
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
