
# Migrate from Lovable Cloud → External Supabase Project

Goal: move the backend off Lovable Cloud onto your own Supabase project so you can enable **Authentication → Providers → Web3 (Solana)** in the Supabase dashboard, which Lovable Cloud doesn't expose.

This is a one-way move. Once disconnected from Cloud for this project, you can't reattach Cloud to it. Plan a maintenance window — users will need to re-sign in.

---

## Phase 1 — Create the external Supabase project

1. Sign up / log in at https://supabase.com.
2. **New project** → pick org, name (`the-lily-pad-prod`), strong DB password (save in 1Password), region close to your users.
3. Wait for provisioning (~2 min).
4. In **Project Settings → API**, copy:
   - Project URL
   - `anon` (publishable) key
   - `service_role` key (server-only, never in `src/`)
5. In **Project Settings → Database**, copy the connection string (you'll need it for `pg_dump`/`psql`).

## Phase 2 — Export everything from Lovable Cloud

Lovable Cloud doesn't offer `pg_dump` or full DB dumps. You have two options:

**Option A (recommended):** Contact Lovable support and request a one-time full DB dump for migration. Mention you're moving to self-hosted Supabase. They can provide a `pg_dump` artifact.

**Option B (DIY, schema-only + CSV data):**
- **Schema:** rebuild from your `supabase/migrations/` folder — every migration that ran on Cloud is checked into the repo and will replay cleanly on the new project.
- **Data:** export each table to CSV from Cloud → Database → Tables → ⋯ → Download as CSV. Save under `migration-data/<table>.csv`.
- **Storage buckets:** for each bucket (`avatars`, `collection-images`, `collection-drafts`, `channel-emotes`, `stream-thumbnails`, `collection-audio`, `ipfs`, `shop-items`) download all files (Supabase CLI: `supabase storage cp ss:///bucket ./bucket -r`). You may need a temporary Cloud API key from support.
- **Edge function source** is already in `supabase/functions/` in the repo.
- **Secrets:** list with `fetch_secrets` and re-add them to the new project manually (you cannot read existing values).

## Phase 3 — Provision the new project

On the new external Supabase project, in order:

1. **Run migrations**
   - Install Supabase CLI locally.
   - `supabase link --project-ref <NEW_PROJECT_REF>`
   - `supabase db push` — replays everything in `supabase/migrations/`.
   - Confirm `public.user_profiles.auth_user_id`, `current_profile_id()`, `handle_new_web3_user()` trigger exist.
2. **Recreate storage buckets** with matching names and public/private flags (see existing list). Upload files from Phase 2.
3. **Recreate edge functions:** `supabase functions deploy <name>` for each function under `supabase/functions/`.
4. **Re-add secrets** in Supabase dashboard → Edge Functions → Secrets: `HELIUS_API_KEY`, `PINATA_JWT`, `REOWN_API_KEY`, `TREASURY_PRIVATE_KEY`, `DEVNET_TREASURY_PRIVATE_KEY`, `L3AP_MINT_SECRET_KEY`, `LOVABLE_API_KEY` (only if you keep using Lovable AI Gateway), etc. Skip the auto-managed `SUPABASE_*` ones — Supabase populates those itself.
5. **Load data:** for each CSV from Phase 2, `\copy public.<table> FROM 'migration-data/<table>.csv' CSV HEADER` via `psql`. Order matters — load tables with no FKs first, then dependents. For `auth.users`, restore from the support dump (Option A) — CSV import of `auth.users` is not reliable on DIY.

## Phase 4 — Enable Web3 (Solana) auth

In the **new** Supabase dashboard:

1. **Authentication → Providers → Web3 (Solana)** → toggle **Enabled** → Save.
2. **Authentication → URL Configuration** → set Site URL to `https://thelilypad.lovable.app` and add Redirect URLs for preview + custom domains.
3. (Optional) keep Email/Google providers configured as before.

## Phase 5 — Disconnect Lovable Cloud and point the app at the new project

1. In Lovable: **Connectors → Lovable Cloud → Disable Cloud** (this disables Cloud for future projects; the current project keeps its env vars until step 3).
2. Update `.env` / Lovable project secrets:
   - `VITE_SUPABASE_URL` → new project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` → new `anon` key
   - `VITE_SUPABASE_PROJECT_ID` → new ref
3. Replace `src/integrations/supabase/types.ts` by regenerating: `supabase gen types typescript --project-id <NEW_REF> > src/integrations/supabase/types.ts`.
4. Verify the client in `src/integrations/supabase/client.ts` still works — it reads from env, so no code change needed.
5. Smoke-test: connect wallet via Reown → `signInWithSolana()` should now succeed (no more 422) → check `supabase.auth.getSession()` returns a real JWT → confirm `auth.uid()` is populated and RLS-protected queries work.

## Phase 6 — Resume the migration plan

With Web3 auth live, continue the previously-planned Phases 3–5 of the SIWS migration:
- Rewrite remaining RLS policies to use `current_profile_id()` / `auth.uid()`.
- Update every edge function to validate JWTs via `supabase.auth.getClaims()` instead of trusting `x-wallet-address` headers.
- Drop legacy `user_nonces`, `signInAnonymously` path, and header-based auth.

---

## Costs & trade-offs

- **You take over billing.** Supabase Pro is ~$25/mo per project plus usage.
- **You lose Lovable Cloud UI conveniences** (one-click migrations from chat, integrated secrets, Cloud status). You'll manage them in the Supabase dashboard.
- **AI Gateway:** `LOVABLE_API_KEY` still works from edge functions hosted anywhere, so Lovable AI usage continues.
- **Rollback:** not possible after Phase 5 step 1. Make a final Cloud DB CSV export as a backup before disabling.

## Effort estimate

~4–8 hours of focused work, longer if you go with Option B (DIY data export) and have large storage buckets.

## Open questions

1. Do you want to request a full DB dump from Lovable support (Option A) or go DIY (Option B)?
2. Are you OK forcing all existing users to re-sign-in (they keep wallet + profile data, just new session)?
3. Which Supabase region should the new project live in?
