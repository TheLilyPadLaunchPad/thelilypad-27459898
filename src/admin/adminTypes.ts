// src/admin/adminTypes.ts

export type AdminRole = "admin" | "superadmin";

export interface AdminUser {
    user_id: string;
    role: AdminRole;
    created_at: string;
}

export type AdminAction =
    | "PROFILE_UPDATE"
    | "PROFILE_SUSPEND"
    | "PROFILE_UNSUSPEND"
    | "ROLE_GRANT"
    | "ROLE_REVOKE"
    | "ROLE_CHANGE"
    | "STATUS_OVERRIDE"
    | "DELETE_CONTENT"
    | "BAN"
    | "UNBAN"
    | "BAN_USER"
    | "CREATOR_APPROVED"
    | "CREATOR_REJECTED"
    | "MODERATION_ACTION"
    | string;

export type AuditSource = "admin_action" | "moderation" | "creator_approval";

export interface AuditLogEntry {
    id: string;
    admin_id: string | null;
    target_user_id: string | null;
    action: AdminAction;
    source: AuditSource;
    before?: Record<string, any> | null;
    after?: Record<string, any> | null;
    reason?: string | null;
    metadata?: Record<string, any> | null;
    created_at: string;
}

export interface AdminProfilePatch {
    is_verified?: boolean;
    is_private?: boolean;
    display_name?: string;
    bio?: string;
    avatar_url?: string;
    banner_url?: string;
}

export interface AdminUserSearchResult {
    user_id: string;
    wallet_address: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
    is_creator: boolean;
    is_streamer: boolean;
    is_banned: boolean;
    roles: string[];
    created_at: string;
}
