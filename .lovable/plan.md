## Why the admin button is missing

- `Navbar` only renders the admin entry when `useIsAdmin().isAdmin === true`.
- `useIsAdmin` checks `public.user_roles` for `role = 'admin'`.
- Currently only one row exists — for an orphan user with no profile/wallet. Your wallet (`3xxV9tbTanfAqRTSZkiZKMGdVDb3KZrrPm3NCkU38Hty`, user `776f7000-10d6-4534-9208-827f60f5162f`) has **no admin row**, so the button correctly hides.
- Secondary issue: while the role query is in flight, `isAdmin` defaults to `false`, so the button can flicker/hide on every page load even for real admins.

## Plan

1. **Grant admin role** to user `776f7000-10d6-4534-9208-827f60f5162f` (wallet `3xxV9tbTanfAqRTSZkiZKMGdVDb3KZrrPm3NCkU38Hty`) by inserting a row into `public.user_roles`.
2. **Fix the loading race in `Navbar`**: gate the admin menu/button on `!loading && isAdmin` so it doesn't flash hidden during the role check. Use the `loading` flag already exposed by `useIsAdmin`.
3. **No change** to RLS, hooks API, or the security model — admin still requires a server-side `user_roles` row.

### Files touched
- `supabase` data change: insert into `public.user_roles`.
- `src/components/Navbar.tsx`: read `loading` from `useIsAdmin`, render admin links only when `!loading && isAdmin`.

### Verification
- After sign-in with the Subagent wallet, the admin dropdown (desktop) and the floating admin button (mobile) should appear immediately without flicker, and `/admin` should be reachable.
