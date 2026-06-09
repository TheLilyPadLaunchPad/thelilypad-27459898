# Launchpad 2026 Upgrade Plan

Move the launchpad from a single Start/End date model to a multi-phase Candy Guard Groups architecture matching modern Metaplex Core Candy Machine standards.

## 1. Phase System (Core)

Replace the single mint window with an array of **Mint Phases**, each compiled to a Metaplex Candy Guard Group.

Per phase config:
- Phase label (Whitelist / Public / OG / Custom)
- Price (SOL)
- Per-wallet mint limit
- Start date + start time + timezone
- End date + end time + timezone
- Allowlist source: CSV upload, paste list, or existing Merkle root
- Optional: token-gate / NFT-gate

Defaults provided via launch templates:
- Free Mint
- Standard (Whitelist → Public)
- Premium (WL → OG → Public → Collectors)
- Open Edition (unlimited, timed)

## 2. Date + Time + Timezone

Every date input gains:
- Date picker
- Time picker (HH:MM)
- Timezone selector (default UTC, browser tz suggested)

All values are normalized to a UTC unix timestamp before being sent to the edge function and assigned to Metaplex `startDate` / `endDate` guards.

## 3. Countdown Widget

On collection detail page:
- Pre-launch: "Mint Starts In: Xd Yh Zm Ws"
- Active: "Mint Ends In: ..."
- Closed: "Mint Closed"
Driven by active phase from `useCollectionDetail`.

## 4. Advanced Settings (collapsible)

- Bot Tax toggle (default ON, 0.01 SOL)
- Sequential phases toggle (auto-chain end→start)
- Allow concurrent phases toggle
- Global per-wallet `mintLimit` guard
- Expert mode: compute unit limit auto-tuned to active guard count

## 5. Validation

Block deploy if:
- Any phase end ≤ start
- Phases overlap when concurrent disabled
- Whitelist phase has no wallets / Merkle root
- Per-wallet limit < 1
- Price < 0

## 6. Deployment Preview Modal

Show summary: name, supply, royalty, treasury, each phase (price + window), guard checklist, estimated SOL cost, dry-run option.

## 7. Edge Function (`deploy-metaplex-launchpad`)

Accept new payload shape:
```ts
{
  defaultGuards: { botTax?, solPayment? },
  groups: Array<{
    label: string,           // ≤32 chars, on-chain group label
    guards: {
      startDate?: { date: number },     // unix seconds
      endDate?:   { date: number },
      solPayment?:{ amount, destination },
      mintLimit?: { id, limit },
      allowList?: { merkleRoot },
    }
  }>
}
```
Build merkle root server-side from CSV when provided. Persist phases into a new `collection_phases` table for the front end (replacing the synthesized fallback added previously).

## 8. Database

New table `collection_phases`:
- collection_id (fk), label, price, max_per_wallet, supply, starts_at, ends_at, requires_allowlist, merkle_root, group_label, sort_order
- RLS: public read, creator/admin write via edge function (service role).

`useCollectionDetail` reads from this table; falls back to current synthesized public phase only if empty.

## 9. UI Files Touched

- `src/components/launchpad/PhaseEditor.tsx` (new — repeatable phase rows)
- `src/components/launchpad/DateTimeTzPicker.tsx` (new)
- `src/components/launchpad/AdvancedSettingsPanel.tsx` (new)
- `src/components/launchpad/LaunchTemplates.tsx` (new)
- `src/components/launchpad/ContractDeployModal.tsx` (preview + diagnostics)
- `src/pages/LaunchpadCreate.tsx` (wire phases into payload)
- `src/components/collection-detail/CollectionMintCard.tsx` (countdown + active-phase switching)
- `src/components/collection-detail/useCollectionDetail.ts` (load phases from new table)
- `supabase/functions/deploy-metaplex-launchpad/index.ts` (groups → guard groups)

## 10. Rollout

1. Migration: `collection_phases` table + grants + RLS.
2. Edge function payload accepts both legacy and new shape (back-compat).
3. UI ships new PhaseEditor behind existing Advanced Mode toggle, default template = "Standard".
4. Countdown + mint-button gating reads active phase by current UTC.

## Out of scope (this pass)

- Token-2022 payment guards
- Civic gatekeeper captcha
- Freeze guards (thaw flow)
These remain available in `GuardConfigurator` for power users but are not exposed in the new phase UI yet.
