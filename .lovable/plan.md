# L3AP Token Mint — Wiring Plan

The vanity secret is already stored as `L3AP_MINT_SECRET_KEY`. This plan creates a one-shot admin-only edge function that consumes that secret to mint the L3AP SPL token on Solana, then updates the frontend config with the resulting mint address.

## 1. Edge function: `mint-l3ap-token`

New file: `supabase/functions/mint-l3ap-token/index.ts`

- Admin-gated: validate caller JWT, then check `has_role(uid, 'admin')`. Reject otherwise.
- Idempotency: read `public.platform_tokens` (new tiny table) for `symbol = 'L3AP'`. If a row with a `mint_address` exists, return it instead of re-minting.
- Load `L3AP_MINT_SECRET_KEY` (base58), decode to a Solana `Keypair`, derive its public key, and assert the address starts with `L3AP`. If not, fail loudly.
- Load `DEVNET_TREASURY_PRIVATE_KEY` as the fee payer + mint authority (matches existing convention used elsewhere in the project).
- Build a Umi instance pointing at the current cluster (devnet by default; accept `?network=mainnet` query for the admin call), inject both signers.
- Call `createFungible` from `@metaplex-foundation/mpl-token-metadata` with:
  - `mint`: vanity keypair signer
  - `name: "The Lily Pad Token"`, `symbol: "L3AP"`, `decimals: 6`, `sellerFeeBasisPoints: 0`
  - `uri: ""` for now (metadata JSON can be added later)
- Optionally mint an `initialSupply` (default 1_000_000_000) to the treasury wallet using `mintV1`.
- On success, upsert into `platform_tokens` and return `{ mint, signature, network }`.

CORS, Zod validation on the request body (`{ network?: 'devnet'|'mainnet', initialSupply?: number }`), structured error responses.

## 2. Database: `platform_tokens` table (migration)

```text
platform_tokens
  symbol         text primary key      -- 'L3AP', 'SOL', …
  name           text
  mint_address   text not null
  decimals       int  not null
  network        text not null          -- 'devnet' | 'mainnet'
  created_at / updated_at
```

- `GRANT SELECT` to `anon, authenticated` (public read — addresses are public).
- `GRANT ALL` to `service_role`.
- RLS enabled; SELECT policy = `true`; no client write policies (edge function uses service role).

## 3. Admin UI trigger

Add a small card to `src/pages/admin/AdminDashboard.tsx`:
- "Mint L3AP token" button → calls `supabase.functions.invoke('mint-l3ap-token', { body: { network } })`.
- Network selector (devnet/mainnet).
- Shows the returned mint address + tx signature, with copy buttons and a "Save to config/tokens.ts" reminder.
- Disabled if `platform_tokens` already has an L3AP row for that network (with an override checkbox guarded behind a confirm dialog).

## 4. Config wiring

Update `src/config/tokens.ts`:
- Remove the `isPlaceholder` flag once the address is filled in.
- Add a small helper `getL3apMintAddress()` that first checks a cached value, otherwise falls back to a one-time fetch from `platform_tokens` (cached in memory + localStorage).
- Keep the hard-coded `mintAddress` field as the canonical value the admin pastes in after the mint succeeds (so the bundle never depends on a network call to render).

## 5. Out of scope (follow-ups)

- L3AP-as-mint-currency option in the launchpad creation form.
- Buyback tier engine (0.01% → 0.50% based on 5 milestone markers).
- Metadata JSON upload to Arweave for the token (currently empty `uri`).
- Rotating / deleting the `L3AP_MINT_SECRET_KEY` after a successful mainnet mint (manual step — surfaced as a UI reminder).

## Technical notes / risks

- The Umi signer for the vanity mint must be created via `createSignerFromKeypair` from the decoded `Keypair`, not `generateSigner`, otherwise we lose the L3AP prefix.
- `createFungible` requires the mint signer to sign the tx; the treasury keypair pays fees and becomes mint/freeze authority.
- We pin the function to `verify_jwt = true` (default) and check the admin role server-side; never trust the client.
- If `DEVNET_TREASURY_PRIVATE_KEY` is not funded on mainnet, the mainnet call will fail with "insufficient lamports" — surface that error verbatim to the admin UI.
