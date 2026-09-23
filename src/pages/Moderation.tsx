import { authUrl } from "@/lib/guestEntry";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
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
import { 
  Shield, 
  Flag, 
  MessageSquare, 
  Trash2, 
  CheckCircle, 
  XCircle,
  Clock,
  ArrowLeft,
  AlertTriangle,
  Eye,
  Ban,
  ThumbsUp,
  Bot,
  Filter,
  Image as ImageIcon,
  FileText,
} from "lucide-react";

interface ModerationItem {
  id: string;
  content_type: string;
  content_text: string | null;
  content_url: string | null;
  reference_id: string | null;
  reference_table: string | null;
  submitted_by: string | null;
  status: string;
  ai_score: number | null;
  ai_reasons: string[] | null;
  ai_details: Record<string, any> | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

interface Report {
  id: string;
  comment_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  comment?: {
    id: string;
    content: string;
    user_id: string;
    clip_id: string;
    created_at: string;
    clip?: {
      id: string;
      title: string;
    };
  };
}

export default function Moderation() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("queue");
  
  // Moderation queue state
  const [moderationQueue, setModerationQueue] = useState<ModerationItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueFilter, setQueueFilter] = useState<string>("pending");
  
  // Reports state (existing)
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  
  // Action states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useSEO({
    title: "Content Moderation | The Lily Pad",
    description: "Review flagged content, manage reports, and maintain community safety. AI-powered moderation tools for creators."
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate(authUrl());
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate(authUrl());
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchModerationQueue();
      fetchReports();
    }
  }, [user, queueFilter]);

  const fetchModerationQueue = async () => {
    setQueueLoading(true);
    try {
      let query = supabase
        .from("moderation_queue")
        .select("*")
        .eq("submitted_by", user.id)
        .order("created_at", { ascending: false });

      if (queueFilter !== "all") {
        query = query.eq("status", queueFilter as any);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      setModerationQueue((data as unknown as ModerationItem[]) || []);
    } catch (error) {
      console.error("Error fetching moderation queue:", error);
    }
    setQueueLoading(false);
  };

  const fetchReports = async () => {
    setReportsLoading(true);
    try {
      const { data: userClips } = await supabase
        .from("clips")
        .select("id")
        .eq("user_id", user.id);

      if (!userClips || userClips.length === 0) {
        setReports([]);
        setReportsLoading(false);
        return;
      }

      const clipIds = userClips.map(c => c.id);

      const { data: clipComments } = await supabase
        .from("clip_comments")
        .select("id, content, user_id, clip_id, created_at")
        .in("clip_id", clipIds);

      if (!clipComments || clipComments.length === 0) {
        setReports([]);
        setReportsLoading(false);
        return;
      }

      const commentIds = clipComments.map(c => c.id);

      const { data: reportsData, error } = await supabase
        .from("comment_reports")
        .select("*")
        .in("comment_id", commentIds)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { data: clipsData } = await supabase
        .from("clips")
        .select("id, title")
        .in("id", clipIds);

      const reportsWithData = (reportsData || []).map(report => {
        const comment = clipComments.find(c => c.id === report.comment_id);
        const clip = clipsData?.find(c => c.id === comment?.clip_id);
        return {
          ...report,
          comment: comment ? {
            ...comment,
            clip: clip
          } : undefined
        };
      });

      setReports(reportsWithData);
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast({
        title: "Error",
        description: "Failed to load reports",
        variant: "destructive",
      });
    }
    setReportsLoading(false);
  };

  const handleUpdateReportStatus = async (reportId: string, newStatus: string) => {
    setActionLoading(reportId);
    try {
      const { error } = await supabase
        .from("comment_reports")
        .update({ status: newStatus })
        .eq("id", reportId);

      if (error) throw error;

      setReports(prev => prev.map(r => 
        r.id === reportId ? { ...r, status: newStatus } : r
      ));

      toast({
        title: "Status updated",
        description: `Report marked as ${newStatus}`,
      });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update report status",
        variant: "destructive",
      });
    }
    setActionLoading(null);
  };

  const handleDeleteComment = async () => {
    if (!selectedReport?.comment_id) return;
    
    setActionLoading(selectedReport.id);
    try {
      const { error } = await supabase
        .from("clip_comments")
        .delete()
        .eq("id", selectedReport.comment_id);

      if (error) throw error;

      setReports(prev => prev.filter(r => r.comment_id !== selectedReport.comment_id));

      toast({
        title: "Comment deleted",
        description: "The comment and associated reports have been removed",
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast({
        title: "Error",
        description: "Failed to delete comment",
        variant: "destructive",
      });
    }
    setActionLoading(null);
    setDeleteDialogOpen(false);
    setSelectedReport(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-500 border-yellow-500"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case "auto_approved":
        return <Badge variant="outline" className="text-green-500 border-green-500"><Bot className="w-3 h-3 mr-1" /> Auto-Approved</Badge>;
      case "auto_rejected":
        return <Badge variant="destructive"><Ban className="w-3 h-3 mr-1" /> Auto-Rejected</Badge>;
      case "approved":
        return <Badge variant="outline" className="text-green-500 border-green-500"><ThumbsUp className="w-3 h-3 mr-1" /> Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      case "reviewed":
        return <Badge variant="outline" className="text-blue-500 border-blue-500"><Eye className="w-3 h-3 mr-1" /> Reviewed</Badge>;
      case "resolved":
        return <Badge variant="outline" className="text-green-500 border-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Resolved</Badge>;
      case "dismissed":
        return <Badge variant="outline" className="text-muted-foreground"><XCircle className="w-3 h-3 mr-1" /> Dismissed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case "image":
        return <ImageIcon className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getReasonBadge = (reason: string) => {
    const colors: Record<string, string> = {
      nsfw: "bg-red-500/20 text-red-400 border-red-500/30",
      violence: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      hate_speech: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      spam: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      harassment: "bg-pink-500/20 text-pink-400 border-pink-500/30",
      illegal: "bg-red-500/20 text-red-400 border-red-500/30",
      clean: "bg-green-500/20 text-green-400 border-green-500/30",
    };
    return (
      <Badge variant="outline" className={colors[reason] || ""}>
        {reason}
      </Badge>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const pendingReportsCount = reports.filter(r => r.status === "pending").length;
  const pendingQueueCount = moderationQueue.filter(m => m.status === "pending").length;

  // Stats
  const queueStats = {
    total: moderationQueue.length,
    pending: moderationQueue.filter(m => m.status === "pending").length,
    autoApproved: moderationQueue.filter(m => m.status === "auto_approved").length,
    autoRejected: moderationQueue.filter(m => m.status === "auto_rejected").length,
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-3 sm:px-4 pt-20 sm:pt-24 pb-8 sm:pb-12">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate("/dashboard")}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-1 flex items-center gap-2">
                <Shield className="w-7 h-7" />
                Content Moderation
              </h1>
              <p className="text-muted-foreground">Review flagged content and manage reports</p>
            </div>
            {(pendingQueueCount > 0 || pendingReportsCount > 0) && (
              <Badge variant="destructive" className="w-fit">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {pendingQueueCount + pendingReportsCount} pending
              </Badge>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{queueStats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Scanned</p>
                </div>
                <Bot className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-yellow-500">{queueStats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending Review</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-500">{queueStats.autoApproved}</p>
                  <p className="text-xs text-muted-foreground">Auto-Approved</p>
                </div>
                <ThumbsUp className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-red-500">{queueStats.autoRejected}</p>
                  <p className="text-xs text-muted-foreground">Auto-Blocked</p>
                </div>
                <Ban className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="queue" className="gap-2">
              <Bot className="w-4 h-4" />
              AI Queue
              {pendingQueueCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">{pendingQueueCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <Flag className="w-4 h-4" />
              User Reports
              {pendingReportsCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">{pendingReportsCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* AI Moderation Queue */}
          <TabsContent value="queue">
            <Card className="glass-card border-border/50">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Bot className="w-5 h-5" />
                      AI Moderation Queue
                    </CardTitle>
                    <CardDescription>
                      Content automatically scanned by AI
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <select
                      value={queueFilter}
                      onChange={(e) => setQueueFilter(e.target.value)}
                      className="text-sm bg-muted border border-border rounded px-2 py-1"
                    >
                      <option value="all">All</option>
                      <option value="pending">Pending</option>
                      <option value="auto_approved">Auto-Approved</option>
                      <option value="auto_rejected">Auto-Rejected</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                {queueLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : moderationQueue.length > 0 ? (
                  <div className="space-y-4">
                    {moderationQueue.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 rounded-lg border border-border bg-muted/30"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            {getContentTypeIcon(item.content_type)}
                            <Badge variant="secondary" className="text-xs capitalize">
                              {item.content_type.replace("_", " ")}
                            </Badge>
                            {getStatusBadge(item.status)}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(item.created_at)}
                          </span>
                        </div>

                        {item.content_text && (
                          <div className="p-3 rounded-md bg-background border border-border mb-3">
                            <p className="text-sm line-clamp-3">{item.content_text}</p>
                          </div>
                        )}

                        {item.ai_score !== null && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Risk Score</span>
                              <span className={item.ai_score > 0.5 ? "text-red-500" : item.ai_score > 0.2 ? "text-yellow-500" : "text-green-500"}>
                                {Math.round(item.ai_score * 100)}%
                              </span>
                            </div>
                            <Progress 
                              value={item.ai_score * 100} 
                              className={`h-2 ${item.ai_score > 0.5 ? "[&>div]:bg-red-500" : item.ai_score > 0.2 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`}
                            />
                          </div>
                        )}

                        {item.ai_reasons && item.ai_reasons.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.ai_reasons.map((reason, i) => (
                              <span key={i}>{getReasonBadge(reason)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Bot className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-1">No items in queue</p>
                    <p className="text-sm">Content you submit will be automatically scanned</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Reports */}
          <TabsContent value="reports">
            <Card className="glass-card border-border/50">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Flag className="w-5 h-5" />
                  Reported Comments
                </CardTitle>
                <CardDescription>
                  {reports.length} total report{reports.length !== 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                {reportsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                ) : reports.length > 0 ? (
                  <div className="space-y-4">
                    {reports.map((report) => (
                      <div
                        key={report.id}
                        className="p-4 rounded-lg border border-border bg-muted/30"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            {getStatusBadge(report.status)}
                            <span className="text-xs text-muted-foreground">
                              {formatDate(report.created_at)}
                            </span>
                          </div>
                          {report.comment?.clip && (
                            <Badge variant="secondary" className="text-xs w-fit">
                              Clip: {report.comment.clip.title}
                            </Badge>
                          )}
                        </div>

                        <div className="mb-3">
                          <div className="text-sm font-medium text-destructive mb-1 flex items-center gap-1">
                            <Flag className="w-3 h-3" />
                            Reason: {report.reason}
                          </div>
                          {report.details && (
                            <p className="text-sm text-muted-foreground">
                              Details: {report.details}
                            </p>
                          )}
                        </div>

                        {report.comment && (
                          <div className="p-3 rounded-md bg-background border border-border mb-3">
                            <div className="flex items-center gap-2 mb-1">
                              <MessageSquare className="w-4 h-4 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Reported comment:</span>
                            </div>
                            <p className="text-sm">{report.comment.content}</p>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {report.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUpdateReportStatus(report.id, "reviewed")}
                                disabled={actionLoading === report.id}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Mark Reviewed
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUpdateReportStatus(report.id, "dismissed")}
                                disabled={actionLoading === report.id}
                              >
                                <XCircle className="w-3 h-3 mr-1" />
                                Dismiss
                              </Button>
                            </>
                          )}
                          {report.status === "reviewed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdateReportStatus(report.id, "resolved")}
                              disabled={actionLoading === report.id}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Mark Resolved
                            </Button>
                          )}
                          {report.comment && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setSelectedReport(report);
                                setDeleteDialogOpen(true);
                              }}
                              disabled={actionLoading === report.id}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Delete Comment
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Shield className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-1">No reports yet</p>
                    <p className="text-sm">Reported comments on your clips will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the comment and all associated reports. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteComment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
