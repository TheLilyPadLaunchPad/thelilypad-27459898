// src/admin/adminActions.ts
import { supabase } from "@/integrations/supabase/client";
import { AdminProfilePatch, AuditLogEntry, AdminUserSearchResult } from "./adminTypes";

export async function adminUpdateProfile(
    targetUserId: string,
    patch: AdminProfilePatch,
    reason?: string
): Promise<void> {
    const { error } = await supabase.rpc("admin_update_profile" as any, {
        target_user_id: targetUserId,
        patch: patch as any,
        reason: reason ?? null,
    });
    if (error) throw error;
}

export async function verifyUser(targetUserId: string, reason: string): Promise<void> {
    return adminUpdateProfile(targetUserId, { is_verified: true }, reason);
}

export async function unverifyUser(targetUserId: string, reason: string): Promise<void> {
    return adminUpdateProfile(targetUserId, { is_verified: false }, reason);
}

export async function grantRole(targetUserId: string, role: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc("admin_set_user_role" as any, {
        target_user_id: targetUserId,
        new_role: role as any,
        reason,
    });
    if (error) throw error;
}

export async function revokeRole(targetUserId: string, role: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc("admin_revoke_user_role" as any, {
        target_user_id: targetUserId,
        revoke_role: role as any,
        reason,
    });
    if (error) throw error;
}

// Back-compat: previously a single "changeUserRole" call.
export async function changeUserRole(targetUserId: string, newRole: string, reason: string): Promise<void> {
    return grantRole(targetUserId, newRole, reason);
}

export async function banUser(
    targetUserId: string,
    reason: string,
    expiresAt?: string | null
): Promise<void> {
    const { error } = await supabase.rpc("admin_ban_user" as any, {
        target_user_id: targetUserId,
        reason,
        expires_at: expiresAt ?? null,
    });
    if (error) throw error;
}

export async function unbanUser(targetUserId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc("admin_unban_user" as any, {
        target_user_id: targetUserId,
        reason,
    });
    if (error) throw error;
}

// Suspend/unsuspend map onto ban/unban (no separate status column).
export async function suspendProfile(targetUserId: string, reason: string): Promise<void> {
    return banUser(targetUserId, reason);
}

export async function unsuspendProfile(targetUserId: string, reason: string): Promise<void> {
    return unbanUser(targetUserId, reason);
}

export async function searchUsers(
    query: string,
    limit: number = 25
): Promise<AdminUserSearchResult[]> {
    const { data, error } = await supabase.rpc("admin_search_users" as any, {
        query_text: query,
        limit_count: limit,
    });
    if (error) throw error;
    return (data as any[]) ?? [];
}

export async function fetchRecentAdminActions(limit: number = 50): Promise<AuditLogEntry[]> {
    const { data, error } = await supabase.rpc("get_admin_audit_feed" as any, {
        limit_count: limit,
    });
    if (error) throw error;
    return (data as AuditLogEntry[]) ?? [];
}

export async function fetchUserAuditLogs(targetUserId: string): Promise<AuditLogEntry[]> {
    const { data, error } = await supabase
        .from("admin_audit_logs" as any)
        .select("*")
        .eq("target_user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(100);
    if (error) throw error;
    return (data as unknown as AuditLogEntry[]) ?? [];
}
