import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminActions } from "@/hooks/useAdminActions";
import { AuditLogEntry, AuditSource } from "@/admin/adminTypes";
import { AdminGate } from "@/components/admin/AdminGate";
import FrogLoader from "@/components/FrogLoader";
import { MintL3apTokenCard } from "@/components/admin/MintL3apTokenCard";
import { SystemStatsCards } from "@/components/admin/SystemStatsCards";
import { UserManagementPanel } from "@/components/admin/UserManagementPanel";
import { CollectionRepairPanel } from "@/components/admin/CollectionRepairPanel";

const sourceVariant: Record<AuditSource, "default" | "secondary" | "outline"> = {
    admin_action: "default",
    moderation: "secondary",
    creator_approval: "outline",
};

const sourceLabel: Record<AuditSource, string> = {
    admin_action: "Admin",
    moderation: "Moderation",
    creator_approval: "Creator",
};

export default function AdminDashboard() {
    const [recentActions, setRecentActions] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const { getRecentActions } = useAdminActions();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const actions = await getRecentActions(30);
            if (!cancelled) {
                setRecentActions(actions ?? []);
                setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <AdminGate>
            <div className="container mx-auto py-8 px-4">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
                    <p className="text-muted-foreground">
                        Moderation tools, user management, and platform overview.
                    </p>
                </div>

                <Tabs defaultValue="overview" className="space-y-6">
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="users">Users</TabsTrigger>
                        <TabsTrigger value="tools">Tools</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-6">
                        <SystemStatsCards />

                        <Card>
                            <CardHeader>
                                <CardTitle>Recent Admin Actions</CardTitle>
                                <CardDescription>
                                    Combined feed of admin profile actions, moderation queue decisions,
                                    and creator-application reviews.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loading ? (
                                    <div className="flex justify-center py-8">
                                        <FrogLoader size="sm" />
                                    </div>
                                ) : recentActions.length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">
                                        No admin actions recorded yet.
                                    </p>
                                ) : (
                                    <div className="space-y-3">
                                        {recentActions.map((log) => (
                                            <div
                                                key={`${log.source}-${log.id}`}
                                                className="flex items-start justify-between gap-3 border-b pb-3 last:border-0"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <Badge variant={sourceVariant[log.source] ?? "outline"}>
                                                            {sourceLabel[log.source] ?? log.source}
                                                        </Badge>
                                                        <Badge variant="outline">{log.action}</Badge>
                                                        <span className="text-xs text-muted-foreground">
                                                            {new Date(log.created_at).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    {log.reason && (
                                                        <p className="text-sm text-muted-foreground">
                                                            {log.reason}
                                                        </p>
                                                    )}
                                                    {log.target_user_id && (
                                                        <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
                                                            target: {log.target_user_id}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="users">
                        <UserManagementPanel />
                    </TabsContent>

                    <TabsContent value="tools" className="space-y-6">
                        <CollectionRepairPanel />
                        <MintL3apTokenCard />
                    </TabsContent>
                </Tabs>
            </div>
        </AdminGate>
    );
}
