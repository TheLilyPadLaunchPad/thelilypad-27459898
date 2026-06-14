# Plan: Solana Pay + Attestations integration

You selected all four, but the prompt was 1–2. Picking the two with the highest leverage and least overlap with what's already built; the other two are noted at the bottom with the reason to defer.

## What gets built

### 1. Solana Pay — tips & shop checkout

Solana Pay is a URL spec (`solana:<recipient>?amount=...&reference=...&label=...&message=...&memo=...`) plus a QR. Phantom/Backpack mobile scan it and prompt the user to sign. We already build raw `SystemProgram.transfer` txs with a `TheLilyPad:v1:<action>` memo — Solana Pay is the standards-compliant wrapper around the same intent, and unlocks the mobile-scan flow.

Where it plugs in:
- **Tipping** (`buildTipCreatorTx` in `src/chains/solana/creator.ts`): add a sibling `buildTipCreatorPayUrl` that returns a `solana:` URL + QR. Tip modal gets a "Scan to tip" tab next to the existing connected-wallet button.
- **Shop checkout** (`buildShopPurchaseTx` and friends in `src/chains/solana/shop.ts`): same treatment — desktop browsing, phone scans QR to pay.
- **Reference key reconciliation**: each Pay URL gets a fresh `reference` pubkey. A new edge function `solana-pay-confirm` polls Helius for a tx containing that reference and writes to `earnings` / `shop_purchases` (same rows the connected-wallet flow writes). Avoids trusting client-reported tx sigs.

New files:
- `src/chains/solana/solanaPay.ts` — URL builder, reference generator, QR data URL helper.
- `src/components/payments/SolanaPayQR.tsx` — modal/inline QR + status poller.
- `supabase/functions/solana-pay-confirm/index.ts` — polls Helius (`HELIUS_API_KEY` already exists), validates recipient + amount + memo + reference, inserts the matching row.

Touch points:
- `src/components/` tip modal (wherever `buildTipCreatorTx` is called) — add QR tab.
- Shop checkout component — add QR tab.

No DB schema changes. Reuses existing `earnings` and `shop_purchases` tables.

### 2. Solana Attestation Service — verified creator badge

Replace the boolean `user_profiles.is_verified` flag with an on-chain attestation issued by a platform authority wallet when an admin approves a creator application (`promote_to_creator` flow already exists).

- New schema in SAS: `LilyPadVerifiedCreator { wallet: pubkey, tier: u8, issued_at: i64 }`.
- Admin approve action calls a new edge function `attest-creator` that signs and submits the attestation using the existing `TREASURY_PRIVATE_KEY` as the issuer (or a new dedicated key — see Open question).
- Store the attestation pubkey on `user_profiles.verification_attestation` (new column) so the UI can deep-link to a SAS explorer.
- Profile badge component reads the column and shows "Verified on-chain" with a link; verification check on sensitive actions (e.g. high-tier shop listing) fetches the attestation on-chain rather than trusting the DB boolean.

New files:
- `src/chains/solana/attestations.ts` — SAS schema registration helper + read helpers.
- `supabase/functions/attest-creator/index.ts` — issues attestation, returns pubkey, updates row.
- `supabase/functions/revoke-attestation/index.ts` — admin-only revoke.

Touch points:
- `src/pages/admin/AdminDashboard.tsx` (creator approval) — call the new function after `promote_to_creator`.
- Verified badge component — show on-chain link.
- One-time bootstrap script `scripts/register-sas-schema.ts` to deploy the schema (run once per network).

## Technical details

- **Solana Pay**: use `@solana/pay` (`encodeURL`, `createQR`). Add as a dependency.
- **SAS**: use `sas-lib` (Solana Attestation Service SDK). Add as a dependency.
- **Networks**: both must respect the existing devnet/mainnet toggle in `src/config/solana.ts`. SAS schema is registered separately per network.
- **Issuer key**: edge functions use a server-held keypair. Reusing `TREASURY_PRIVATE_KEY` is simplest but couples attestation revocation to treasury rotation — see Open question.
- **Confirmation polling**: `solana-pay-confirm` runs a 60s polling loop with backoff via Helius `getSignaturesForAddress(reference)`. Times out → user sees "Not detected yet, refresh" — they can also retry manually.

## What I'm NOT building (and why)

- **Kora paymaster** — Requires running and SOL-funding a separate paymaster service. Real ongoing infra cost + a non-trivial server to host. Worth doing once user volume justifies it; not now.
- **Commerce Kit** — Prebuilt React components that overlap almost entirely with what's already in `src/components/` for shop, tips, mint. Adopting it would be a refactor, not a feature gain.

If you want either of these anyway, say so and I'll re-plan.

## Open question (answer in build mode)

- Issuer key for attestations: reuse `TREASURY_PRIVATE_KEY`, or add a dedicated `ATTESTATION_ISSUER_PRIVATE_KEY` secret? Dedicated is cleaner; reusing is one less secret to manage.
