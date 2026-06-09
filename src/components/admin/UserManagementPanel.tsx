import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAdminActions } from "@/hooks/useAdminActions";
import { AdminUserSearchResult } from "@/admin/adminTypes";
import FrogLoader from "@/components/FrogLoader";
import { Search, ShieldCheck, ShieldOff, Ban, RotateCcw, Crown, UserMinus } from "lucide-react";

type ActionKind = "verify" | "unverify" | "ban" | "unban" | "grant_admin" | "revoke_admin";

interface PendingAction {
    kind: ActionKind;
    user: AdminUserSearchResult;
}

export function UserManagementPanel() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<AdminUserSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [reason, setReason] = useState("");
    const admin = useAdminActions();

    const runSearch = useCallback(async (q: string) => {
        setSearching(true);
        const data = await admin.searchUsers(q, 25);
        setResults(data ?? []);
        setSearching(false);
    }, [admin]);

    useEffect(() => {
        const t = setTimeout(() => runSearch(query), 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const onConfirm = async () => {
        if (!pending) return;
        const { kind, user } = pending;
        const r = reason.trim() || "(no reason provided)";
        let ok: any = null;
        if (kind === "verify") ok = await admin.verify(user.user_id, r);
        else if (kind === "unverify") ok = await admin.unverify(user.user_id, r);
        else if (kind === "ban") ok = await admin.ban(user.user_id, r);
        else if (kind === "unban") ok = await admin.unban(user.user_id, r);
        else if (kind === "grant_admin") ok = await admin.grantRole(user.user_id, "admin", r);
        else if (kind === "revoke_admin") ok = await admin.revokeRole(user.user_id, "admin", r);
        setPending(null);
        setReason("");
        if (ok !== null) runSearch(query);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                    Search users by wallet address or display name. Verify, ban, or change roles.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search wallet or display name…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>

                {searching ? (
                    <div className="flex justify-center py-8">
                        <FrogLoader size="sm" />
                    </div>
                ) : results.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No users found.</p>
                ) : (
                    <div className="space-y-2">
                        {results.map((u) => {
                            const isAdmin = u.roles.includes("admin");
                            return (
                                <div
                                    key={u.user_id}
                                    className="flex flex-wrap items-center gap-3 border rounded-lg p-3"
                                >
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={u.avatar_url ?? undefined} />
                                        <AvatarFallback>
                                            {(u.display_name ?? u.wallet_address ?? "?").slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>

                                    <div className="flex-1 min-w-[200px]">
                                        <div className="font-medium truncate">
                                            {u.display_name ?? "Unnamed"}
                                        </div>
                                        <div className="text-xs text-muted-foreground font-mono truncate">
                                            {u.wallet_address}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-1">
                                        {u.is_verified && <Badge variant="secondary">Verified</Badge>}
                                        {u.is_creator && <Badge variant="outline">Creator</Badge>}
                                        {u.is_streamer && <Badge variant="outline">Streamer</Badge>}
                                        {isAdmin && <Badge>Admin</Badge>}
                                        {u.is_banned && <Badge variant="destructive">Banned</Badge>}
                                    </div>

                                    <div className="flex flex-wrap gap-1">
                                        {u.is_verified ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setPending({ kind: "unverify", user: u })}
                                            >
                                                <ShieldOff className="h-3 w-3 mr-1" /> Unverify
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setPending({ kind: "verify", user: u })}
                                            >
                                                <ShieldCheck className="h-3 w-3 mr-1" /> Verify
                                            </Button>
                                        )}

                                        {u.is_banned ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setPending({ kind: "unban", user: u })}
                                            >
                                                <RotateCcw className="h-3 w-3 mr-1" /> Unban
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => setPending({ kind: "ban", user: u })}
                                            >
                                                <Ban className="h-3 w-3 mr-1" /> Ban
                                            </Button>
                                        )}

                                        {isAdmin ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setPending({ kind: "revoke_admin", user: u })}
                                            >
                                                <UserMinus className="h-3 w-3 mr-1" /> Revoke admin
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setPending({ kind: "grant_admin", user: u })}
                                            >
                                                <Crown className="h-3 w-3 mr-1" /> Make admin
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>

            <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm action</DialogTitle>
                        <DialogDescription>
                            {pending && (
                                <>
                                    Action <strong>{pending.kind.replace("_", " ")}</strong> on{" "}
                                    <strong>{pending.user.display_name ?? pending.user.wallet_address}</strong>.
                                    Provide a reason for the audit log.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        placeholder="Reason (visible to other admins in the audit feed)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPending(null)}>
                            Cancel
                        </Button>
                        <Button onClick={onConfirm} disabled={admin.loading}>
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
