// src/hooks/useAdminActions.ts
import { useState } from "react";
import { toast } from "sonner";
import {
    adminUpdateProfile,
    suspendProfile,
    unsuspendProfile,
    changeUserRole,
    grantRole,
    revokeRole,
    verifyUser,
    unverifyUser,
    banUser,
    unbanUser,
    searchUsers,
    fetchUserAuditLogs,
    fetchRecentAdminActions,
} from "@/admin/adminActions";
import { AdminProfilePatch } from "@/admin/adminTypes";

export function useAdminActions() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const executeAction = async <T,>(
        action: () => Promise<T>,
        successMessage: string,
        opts: { silent?: boolean } = {}
    ): Promise<T | null> => {
        setLoading(true);
        setError(null);
        try {
            const result = await action();
            if (!opts.silent) toast.success(successMessage);
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : "Action failed";
            setError(message);
            toast.error(message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    return {
        loading,
        error,

        updateProfile: (userId: string, patch: AdminProfilePatch, reason?: string) =>
            executeAction(() => adminUpdateProfile(userId, patch, reason), "Profile updated"),

        suspend: (userId: string, reason: string) =>
            executeAction(() => suspendProfile(userId, reason), "User suspended"),

        unsuspend: (userId: string, reason: string) =>
            executeAction(() => unsuspendProfile(userId, reason), "User unsuspended"),

        ban: (userId: string, reason: string, expiresAt?: string | null) =>
            executeAction(() => banUser(userId, reason, expiresAt), "User banned"),

        unban: (userId: string, reason: string) =>
            executeAction(() => unbanUser(userId, reason), "User unbanned"),

        changeRole: (userId: string, role: string, reason: string) =>
            executeAction(() => changeUserRole(userId, role, reason), "Role granted"),

        grantRole: (userId: string, role: string, reason: string) =>
            executeAction(() => grantRole(userId, role, reason), "Role granted"),

        revokeRole: (userId: string, role: string, reason: string) =>
            executeAction(() => revokeRole(userId, role, reason), "Role revoked"),

        verify: (userId: string, reason: string) =>
            executeAction(() => verifyUser(userId, reason), "User verified"),

        unverify: (userId: string, reason: string) =>
            executeAction(() => unverifyUser(userId, reason), "Verification removed"),

        searchUsers: (query: string, limit?: number) =>
            executeAction(() => searchUsers(query, limit), "Search complete", { silent: true }),

        getAuditLogs: (userId: string) =>
            executeAction(() => fetchUserAuditLogs(userId), "Audit logs fetched", { silent: true }),

        getRecentActions: (limit?: number) =>
            executeAction(() => fetchRecentAdminActions(limit), "Recent actions fetched", { silent: true }),
    };
}
