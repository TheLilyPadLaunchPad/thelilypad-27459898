# Plan: Migrate to Supabase Web3 (Solana) Auth via Reown AppKit

## Goal
Replace the current custom wallet-based auth (which only stores `wallet_address` on `user_profiles` and has no real Supabase session) with **Supabase `signInWithWeb3({ chain: 'solana' })`** so every authenticated request carries a real Supabase JWT and `auth.uid()` works in RLS.

The Solana wallet signing comes from **Reown AppKit** (already wired in `src/integrations/reown/appkit.ts`), not Phantom directly.

## What stays the same
- Reown AppKit modal & connection flow (UI unchanged).
- `user_profiles`, `user_roles`, profile setup pages.
- All collection / NFT / launchpad logic.
- Wallet address still drives on-chain actions (Irys funding, mint txs, etc.).

## What changes

### 1. Supabase config
- Enable **Web3 provider (Solana)** in Auth → Providers. *(Requires one manual toggle in the Cloud UI — I'll surface a clear callout; the API does not expose this toggle.)*
- Set site URL / additional redirect URLs to current preview + published domains.

### 2. New auth bridge
- New file `src/auth/supabaseWeb3.ts` exposing:
  - `signInWithSolana()` — pulls the active Solana account + signer from Reown's AppKit provider, calls `supabase.auth.signInWithWeb3({ chain: 'solana', statement: 'Sign in to The Lily Pad' })`, returns the new session.
  - `signOutWeb3()` — `supabase.auth.signOut()` + Reown `disconnect()`.
- Wire it into the existing Reown connect callback: after wallet connects, automatically attempt sign-in (idempotent — skip if `supabase.auth.getSession()` already returns a session for the same address).

### 3. AuthProvider rewrite (`src/providers/AuthProvider.tsx`)
- Drive state from `supabase.auth.onAuthStateChange` **plus** wallet connection (both must be true → AUTHENTICATED).
- New state ordering: `DISCONNECTED → CONNECTING_WALLET → WALLET_CONNECTED → SIGNING_IN → LOADING_PROFILE → (NEEDS_PROFILE | AUTHENTICATED)`.
- `walletAddress` now derives from `session.user.user_metadata.address` as source of truth (cross-checked against Reown).
- Keep `useIsAdmin` but switch its query to use `auth.uid()` directly.

### 4. Database migration
- Add `auth_user_id uuid` (unique, nullable initially) on `user_profiles` → backfill by upserting an `auth.users` row per existing wallet *(not possible retroactively without users re-signing in)*; new rows populated on first Web3 sign-in via a trigger on `auth.users`:
  ```sql
  CREATE FUNCTION public.handle_new_web3_user() ...
    -- when raw_app_meta_data->>'provider' = 'web3' and chain = 'solana'
    -- upsert user_profiles by wallet_address, set auth_user_id = new.id
  ```
- Rewrite RLS policies on user-owned tables to use `auth.uid() = (SELECT auth_user_id FROM user_profiles WHERE id = <fk>)` via a `SECURITY DEFINER` helper `public.current_profile_id()`.
- Replace `wallet_owns_profile(profile_uuid, wallet_addr)` callers with `auth.uid()`-based checks.
- Keep legacy wallet-address columns for display / on-chain ops.

### 5. Edge functions
- Add shared helper `supabase/functions/_shared/auth.ts` that calls `supabase.auth.getClaims(token)` and resolves `profile_id`.
- Update every function that currently trusts an `x-wallet-address` header (audit list below) to instead require a valid JWT and derive wallet from the linked profile.
- Functions touched (initial sweep): `deploy-metaplex-launchpad`, `deploy-candy-machine`, `refund-deploy-payment`, `moderation-*`, `tipping`, `marketplace-*`, `shop-purchase`. Full list confirmed during implementation.

### 6. UI
- `Auth.tsx` becomes a single "Connect Wallet" → automatic sign-message → done flow (Reown modal opens, then a second wallet popup for the SIWS message).
- `ProtectedRoute` checks `supabase.auth.getSession()` instead of localStorage `walletConnected`.
- Sign-out button calls `signOutWeb3()`.

### 7. Cleanup
- Delete `src/auth/authMachine.ts` reducer events that no longer apply.
- Remove `user_nonces` table (custom nonce flow replaced by SIWS handled by Supabase).
- Remove any `x-wallet-address` header signing in client code.

## Technical notes
- `signInWithWeb3` for Solana expects an object implementing `{ address, signMessage }`. Reown AppKit exposes this through `getProvider('solana')` → we'll wrap it once in `supabaseWeb3.ts`.
- Existing sessions: users will be signed out on deploy and must re-connect once to mint a Supabase JWT. Profiles persist (matched by `wallet_address`).
- Admin role check: `has_role(auth.uid(), 'admin')` — admins must re-sign-in once to get their JWT linked.

## Rollout order
1. DB migration (add `auth_user_id`, trigger, helper fn) — non-breaking, keeps old policies.
2. Ship `supabaseWeb3.ts` + AuthProvider rewrite + UI changes.
3. Flip RLS policies to `auth.uid()`-based (breaking — requires step 2 deployed).
4. Update edge functions.
5. Remove legacy `wallet_owns_profile` helpers, `user_nonces`, header-based auth.

## Open questions before I start
1. Web3 provider toggle in Supabase Auth — can you flip it in the Cloud UI now, or should I pause after step 1 and wait?
2. Are you OK with all current users being forced to re-connect their wallet once (no data loss, just a fresh sign-in)?
3. Should I keep the existing custom `/profile-setup` flow, or move profile creation into the post-sign-in callback?
