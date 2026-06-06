## Goals

1. Fix the "Arweave/metadata upload fails" error blocking generated-collection deploys.
2. Make the creator-funded model explicit: the creator pays **only Solana rent** for the Candy Machine / Core Collection accounts at deploy time. Minters pay the mint price. After **sellout or mint end date**, the creator can **close the Candy Machine** to reclaim the rent SOL (and any leftover prefunded lamports).
3. Defer L3AP-token discount + buyback-tier benefits (separate follow-up). Add a stub note in code so we don't break the future wiring.

---

## 1. Why deploy is failing

`ContractDeployModal.handleDeploy` calls `uploadMetadataToArweave` from `src/integrations/arweave/legacyClient.ts`, which routes to `nativeClient.uploadBytes`. That requires `window.arweaveWallet` (ArConnect / Wander). When the creator only has Phantom installed, the upload throws before deploy ever starts — surfaced as the "fetch failed" error.

Two-part fix:

- **Pre-check**: detect missing Arweave wallet before kicking off deploy. If absent, fall back to a **server-signed Arweave upload** via a new edge function `arweave-upload` that uses a project Arweave JWK (existing secret pattern). If the JWK secret isn't configured yet, fall back to **Supabase `collection-drafts` storage** + the existing IPFS pinning path for the metadata JSON, so deploy isn't blocked.
- **Better errors**: wrap `uploadMetadataToArweave` in `ContractDeployModal` with try/catch that shows the actual upstream message (current `toast.error("Deployment failed")` swallows the Arweave failure).

Also confirms the recent edge-function fix (Umi `setComputeUnit*` removal) is in place — re-deploy `deploy-metaplex-launchpad` as part of this change to be safe.

---

## 2. Rent-only deploy + reclaim flow

### Deployment cost model
- Creator wallet signs and pays **only** the SPL rent-exempt deposit for: Core Collection account, Candy Machine account, Candy Guard account, and config-lines buffer. No upfront mint prefund.
- Minters pay `solPayment` (mint price) directly into the **creator's treasury** PDA at mint time (existing Candy Guard config — unchanged).
- Platform 2% fee continues to be split via the existing `getPlatformFeeSplit` router.

### Reclaim flow
A new "Close & Reclaim" action becomes available on the collection management page when **either**:
- `items_redeemed === items_available` (sellout), **or**
- `mint_end_date` has passed.

Action runs the Metaplex Core / Candy Machine `delete` (a.k.a. `withdraw`) instruction, which:
- Closes the Candy Machine + Candy Guard accounts.
- Returns the rent lamports to the creator wallet.
- Marks the collection `status = 'closed'` in `collections` table.

UI guards: confirmation modal showing "X SOL rent will be returned to {wallet}", disabled state with countdown until eligible, and a clear note that closing is irreversible.

### L3AP placeholder (deferred)
- Add a disabled "Pay mint in L3AP (coming soon — earns buyback rewards)" radio on the deploy form.
- Add a TODO marker referencing this conversation so the follow-up can wire: free deploy when L3AP selected, buyback enrollment, tier markers at every 5% mint-progress increasing the buyback share from 0.01% → 0.50%.

---

## Technical changes

**Frontend**
- `src/components/launchpad/ContractDeployModal.tsx` — pre-flight Arweave wallet check, surfaced error messages, fallback path selector.
- `src/integrations/arweave/legacyClient.ts` (small) — export `hasArweaveWallet()` helper.
- New `src/lib/metadataUpload.ts` — chooses Arweave (wallet) → edge function → Supabase storage in that order.
- `src/pages/CollectionDetail.tsx` (or existing manage view) — add **Close & Reclaim** card with eligibility logic.
- New `src/hooks/useCloseCandyMachine.ts` — wraps Umi `deleteCandyMachine` + `deleteCandyGuard`.
- `src/pages/LaunchpadCreate.tsx` — copy update: "Deploy cost = Solana rent only (refundable on close)". Add disabled L3AP option.

**Edge function**
- New `supabase/functions/arweave-upload/index.ts` — accepts JSON or bytes, signs with project Arweave JWK (`ARWEAVE_JWK` secret — request via add_secret when implementing), returns `{ url, txId }`. CORS + Zod validation per house rules.
- Re-deploy `deploy-metaplex-launchpad` to confirm prior Umi fix is live.

**Database**
- Migration to add `mint_end_date timestamptz` and `closed_at timestamptz` to `collections` if not already present, plus a `closed_tx_signature text`.

**Out of scope (next round)**
- L3AP buyback tier engine, milestone markers, mint-progress driven fee curve.
- Monad equivalent of close & reclaim.
- Refunds for partial mints.

---

## Deliverables

- Generated collections deploy successfully whether or not ArConnect is installed.
- Creator sees an accurate "rent only" cost on the deploy screen.
- After sellout or end date, the creator can close the Candy Machine and recover rent in one click.
- L3AP option visible-but-disabled with a clear "coming soon" label, ready for the follow-up feature.
