## Full migration to external Supabase — swap-in plan

You have: new empty Supabase project, URL + anon (publishable) key in hand, Web3 (Solana) provider already enabled. Goal: point this app at the new project so SIWS sign-in works end-to-end.

### Phase 1 — Push schema and storage to the new project (you, CLI)

The new project is empty. Before flipping any keys, the schema, RLS, functions, triggers, and storage buckets must exist on the new project. From your local clone:

```bash
supabase link --project-ref <NEW_PROJECT_REF>
supabase db push        # applies every file in supabase/migrations/
```

Then recreate the 8 storage buckets that exist today (avatars, collection-images, collection-drafts, channel-emotes, stream-thumbnails, collection-audio, ipfs public; shop-items private) in the new project's dashboard → Storage. Bucket files themselves do not need to copy yet (project is pre-launch / empty).

Edge functions deploy automatically once the project is linked and we publish — no manual step needed from you for those.

### Phase 2 — You hand me the keys, I swap envs (me, one pass)

Once Phase 1 is done, send me:
- `VITE_SUPABASE_URL` (e.g. `https://<ref>.supabase.co`)
- `VITE_SUPABASE_PUBLISHABLE_KEY` (the anon key)
- `VITE_SUPABASE_PROJECT_ID` (the ref alone)

I'll also need the **service_role key** added as a secret (separate, server-only) before edge functions will work against the new project — I'll request it via the secret tool when we reach Phase 4. You can grab it from Project Settings → API in the new dashboard.

In a single change I will:
1. Update the three `VITE_SUPABASE_*` values in `.env`.
2. Regenerate `src/integrations/supabase/types.ts` against the new project.
3. Verify `src/integrations/supabase/client.ts` still reads from `import.meta.env` (no edit needed — it already does).

### Phase 3 — Verify SIWS sign-in works

With the new URL/anon key live and the Web3 provider already on:
- Open the preview, click connect wallet → sign message.
- Expected: `supabase.auth.signInWithWeb3` returns a session, `auth.uid()` is set, `handle_new_web3_user()` trigger creates a `user_profiles` shell row.

If sign-in 422s, that's the Web3 toggle not actually on — re-check the dashboard. If it 401s with "Invalid API key", the anon key is wrong.

### Phase 4 — Wire edge functions to the new project

Edge functions read `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS` as runtime secrets. All six currently point at Lovable Cloud. I will request the new values via the secrets tool (you paste them once each); then redeploy any function we test (admin-users, verify-solana-tx, content-moderation, etc.).

### Phase 5 — Clean up legacy auth code

Now that Supabase JWTs are the source of truth, remove the wallet-only fallbacks that exist in case auth was missing:
- `useIsAdmin` already gates on `supabase.auth.getUser()` — keep.
- Audit RLS policies that still match on `wallet_address` (instead of `auth.uid()` via `current_profile_id()`) and tighten them. List comes from the linter.
- Drop the `user_nonces` table if SIWS replaced the custom nonce flow (confirm with you before dropping).

### Technical notes

- `src/integrations/supabase/client.ts` is auto-generated normally, but on a full migration it's safe to leave as-is — it already reads env vars. Only `.env` and `types.ts` change.
- `supabase/config.toml` `project_id` will update automatically when you `supabase link`.
- The `reference-supabase-auth/` folder is unrelated sample code, untouched.
- 17 existing project secrets stay; only the 6 `SUPABASE_*` ones get rotated.

### What I need from you to start Phase 2

After you finish Phase 1 (`db push` + recreate buckets), reply with the three `VITE_SUPABASE_*` values. I'll handle Phase 2 in one shot, then we test sign-in together before touching edge functions.