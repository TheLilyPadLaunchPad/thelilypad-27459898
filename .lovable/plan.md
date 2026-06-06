# Fix backend deploy + show platform fee

Two separate issues from the 1-of-1 Solana launch flow.

## 1. "Failed to fetch" on backend deploy

`src/hooks/useSolanaLaunch.ts` (`deployViaBackend`, line 1006) hits the edge function with raw `fetch` against `${VITE_SUPABASE_URL}/functions/v1/...`. Edge logs for `deploy-metaplex-launchpad` are empty, meaning the request never reaches the function — classic Lovable preview fetch‑proxy / CORS preflight failure.

**Fix**
- Replace raw `fetch` with `supabase.functions.invoke('deploy-metaplex-launchpad', { body: params })`. This uses the SDK's transport (the same path our other working functions use) and avoids the preview-proxy issue.
- Surface the actual server error (when present) instead of a generic "Backend deployment failed".
- In `supabase/functions/deploy-metaplex-launchpad/index.ts`, harden CORS:
  - Add `Access-Control-Allow-Methods: POST, OPTIONS`.
  - Return `Content-Type: application/json` and `corsHeaders` on every response (including the 401/403/404 early returns, which today omit `Content-Type`).
- Add a startup log line (`console.log('[deploy-metaplex-launchpad] invoked', { network, collectionId })`) so we can confirm the request lands.

## 2. Platform fee is not visible (and not actually collected)

`deploy-metaplex-launchpad` configures `solPayment` with `destination: frontendCreatorPubkey`, so 100% of mint proceeds go to the creator — the documented 2.0% platform fee is never split, and nothing in the create flow shows the user what fee will apply.

**Fix (display-only, no business-logic split yet)**
- Add a "Fees & Payout" summary card in `src/pages/LaunchpadCreate.tsx` near the deploy confirmation step. Use existing helpers from `src/lib/fees.ts` (`getFeeDetails`) keyed off the configured mint price (or "—" if free).
- Show: mint price, platform fee % + amount, creator net per mint, and treasury address (truncated). Pull the fee bps from `TREASURY_CONFIG.fees.launchpad` so it stays in sync with config.
- Keep the existing "2.0% Flat Fee" badge but link it to the new breakdown card.

> Actually splitting the mint payment between creator and treasury requires a second `solPayment` guard group or a custom router and is out of scope for this fix — call it out in a follow-up note so the user can prioritize it separately.

## Out of scope
- Arweave wallet missing warning (separate issue, user needs Wander/ArConnect installed).
- Refactoring on-chain payment splitting between creator and platform treasury.

## Files touched
- `src/hooks/useSolanaLaunch.ts` — swap fetch → `supabase.functions.invoke`, better error surfacing.
- `supabase/functions/deploy-metaplex-launchpad/index.ts` — CORS hardening + startup log + consistent JSON headers.
- `src/pages/LaunchpadCreate.tsx` — add Fees & Payout summary card before deploy confirm.
