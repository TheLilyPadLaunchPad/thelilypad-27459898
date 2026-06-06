import { useEffect, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdminActions } from "@/hooks/useAdminActions";
import { AuditLogEntry } from "@/admin/adminTypes";
import { AdminGate } from "@/components/admin/AdminGate";
import FrogLoader from "@/components/FrogLoader";
import { MintL3apTokenCard } from "@/components/admin/MintL3apTokenCard";

export default function AdminDashboard() {
    const [recentActions, setRecentActions] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const { getRecentActions } = useAdminActions();

    useEffect(() => {
        loadRecentActions();
    }, []);

    const loadRecentActions = async () => {
        setLoading(true);
        const actions = await getRecentActions(20);
        if (actions) {
            setRecentActions(actions);
        }
        setLoading(false);
    };

    return (
        <AdminGate>
            <div className="container mx-auto py-8 px-4">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
                    <p className="text-muted-foreground">
                        Moderation tools and system overview
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Card>
                        <CardHeader>
                            <CardTitle>User Management</CardTitle>
                            <CardDescription>View and moderate user profiles</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Search users, suspend accounts, change roles
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Audit Logs</CardTitle>
                            <CardDescription>Track all admin actions</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                View complete history of moderation actions
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>System Stats</CardTitle>
                            <CardDescription>Platform analytics</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Users, collections, transactions
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="mt-8">
                    <MintL3apTokenCard />
                </div>

                <Card className="mt-8">
                    <CardHeader>
                        <CardTitle>Recent Admin Actions</CardTitle>
                        <CardDescription>
                            Last 20 moderation actions across all admins
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <FrogLoader size="sm" />
                            </div>
                        ) : recentActions.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">
                                No admin actions recorded yet
                            </p>
                        ) : (
                            <div className="space-y-4">
                                {recentActions.map((log) => (
                                    <div
                                        key={log.id}
                                        className="flex items-start justify-between border-b pb-4 last:border-0"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant="outline">{log.action}</Badge>
                                                <span className="text-sm text-muted-foreground">
                                                    {new Date(log.created_at).toLocaleString()}
                                                </span>
                                            </div>
                                            {log.reason && (
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    Reason: {log.reason}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AdminGate>
    );
}
