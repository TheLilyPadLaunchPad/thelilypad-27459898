# Admin Dashboard Cleanup & Wire-Up

Replace the placeholder cards on `/admin` with real, RLS-backed data and tools, and turn the existing stub functions in `src/admin/adminActions.ts` into actual database calls.

## 1. Database (migration)

**New table `public.admin_audit_logs`**
- `admin_id uuid` (admin who acted), `target_user_id uuid` (nullable — moderation actions may target content), `action text`, `source text` (`'admin_action' | 'moderation' | 'creator_approval'`), `before jsonb`, `after jsonb`, `reason text`, `metadata jsonb`, `created_at timestamptz default now()`.
- GRANT `SELECT` to `authenticated`, `ALL` to `service_role`. RLS: only `has_role(auth.uid(),'admin')` can SELECT; INSERT only via security-definer RPCs.

**New RPCs (security definer, `search_path=public`)**
- `admin_update_profile(target_user_id uuid, patch jsonb, reason text)` — asserts caller is admin, snapshots before/after on `user_profiles`, applies allowed fields (`is_verified`, `is_private`, display_name, bio, banner_url, avatar_url), writes one `admin_audit_logs` row with `source='admin_action'`. Used for verify / unverify / update.
- `admin_set_user_role(target_user_id uuid, new_role app_role, reason text)` — admin-only; insert/delete in `user_roles`; logs to audit.
- `admin_ban_user(target_user_id uuid, reason text, expires_at timestamptz)` and `admin_unban_user(target_user_id uuid, reason text)` — wrap `banned_users`; logs to audit. (Used in place of a `status` column since `user_profiles` has none.)
- `get_admin_audit_feed(limit_count int)` — admin-only; UNION of:
  - `admin_audit_logs` (all sources),
  - `moderation_actions` mapped to the same shape (`source='moderation'`, action=`action_type`),
  - `creator_beta_applications` where `status in ('approved','rejected')` (`source='creator_approval'`).
  Returns most recent N rows.
- `search_users(query text, limit_count int)` — admin-only; case-insensitive match on `wallet_address` / `display_name`; returns id, wallet, display_name, is_verified, is_creator, is_streamer, ban status (`is_user_banned`), role list.

## 2. Frontend wiring

**`src/admin/adminActions.ts`** — remove `console.warn` stubs; call the new RPCs via `supabase.rpc(...)`. Keep the function signatures so `useAdminActions` keeps working. Add `banUser` / `unbanUser` / `searchUsers`.

**`src/admin/adminTypes.ts`** — add `source` field to `AuditLogEntry`; add `BAN`, `UNBAN`, `CREATOR_APPROVED`, `CREATOR_REJECTED`, `MODERATION_ACTION` to `AdminAction`.

**New `src/components/admin/UserManagementPanel.tsx`** — search box (debounced) → results table with badges (verified, creator, streamer, banned, role). Row actions: Verify / Unverify, Ban / Unban (with reason dialog), Change Role (admin / user dropdown). All wired through `useAdminActions`.

**New `src/components/admin/SystemStatsCards.tsx`** — calls `get_platform_stats` + `get_launchpad_stats` and renders four KPI cards (Users, Collections, NFTs Minted, Total Volume). Replaces the static "User Management / Audit Logs / System Stats" placeholder grid.

**`src/pages/admin/AdminDashboard.tsx`** — restructure into tabs:
- **Overview** — `SystemStatsCards` + Recent Admin Actions feed (now populated via `get_admin_audit_feed`, with `source` badge color-coded).
- **Users** — `UserManagementPanel`.
- **Tools** — keep `MintL3apTokenCard` and link out to existing managers (`/admin` routes already in the app).

Loading + empty states use the existing `FrogLoader` and shadcn `Card` patterns. No styling overhaul — just spacing/empty-state polish on the existing tokens.

## 3. Out of scope
- Superadmin tier (kept single `admin` role per your answer).
- Building separate routes for each existing manager component — they already exist; only the dashboard landing page changes.
- Changes to moderation, creator-approval, or launchpad flows themselves — we only surface their existing data.

## Files

- migration (new table, RPCs, grants, policies)
- `src/admin/adminActions.ts` (rewrite stubs)
- `src/admin/adminTypes.ts` (extend types)
- `src/hooks/useAdminActions.ts` (add ban/search wrappers)
- `src/components/admin/UserManagementPanel.tsx` (new)
- `src/components/admin/SystemStatsCards.tsx` (new)
- `src/pages/admin/AdminDashboard.tsx` (tabs + real feed)
