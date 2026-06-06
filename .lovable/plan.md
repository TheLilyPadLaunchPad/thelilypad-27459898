# Fee Breakdown Solution — 2% Platform Standard

A single, consistent fee model that the Launchpad Treasury collects across every monetization surface on The Lily Pad. The headline rate is **2.0%** of the gross transaction (1.25% on premium mints ≥ 0.3 SOL to undercut competitors), split internally between Treasury operations, Team, and Buyback Pool.

## 1. Master Fee Rule

| Surface | Platform Fee | Premium Tier (≥0.3 SOL) | Creator Royalty | Notes |
|---|---|---|---|---|
| Launchpad Primary Mint | **2.0%** | 1.25% | n/a (first sale) | Charged on mint price |
| Direct Marketplace Sale (1-of-1, fixed) | **2.0%** | 1.25% | 0–10% (collection-defined) | Charged on sale price |
| Secondary Marketplace (resale) | **2.0%** | 1.25% | 0–10% enforced | Royalty paid to original creator |
| Auction settlement | **2.0%** | 1.25% | 0–10% enforced | Same split as marketplace |

All percentages are basis points (bps) in code: `200 bps = 2.0%`, `125 bps = 1.25%`.

## 2. Internal Split of the 2.0% Platform Fee

The 2.0% is not a single bucket — it is split at settlement into three on-chain destinations:

```text
2.00% Platform Fee
 ├── 1.50%  → Treasury  (PLATFORM_WALLETS.solana.treasury)
 ├── 0.25%  → Team      (PLATFORM_WALLETS.solana.team)
 └── 0.25%  → Buyback   (PLATFORM_WALLETS.solana.buybackPool)
```

For premium tier (1.25%) the same proportions scale down:
```text
1.25% Platform Fee
 ├── 0.9375% → Treasury
 ├── 0.1563% → Team
 └── 0.1563% → Buyback
```

This already exists in `src/config/treasury.ts → getLaunchpadFeeSplit()`; the plan generalizes it to all transaction types.

## 3. Per-Surface Settlement Flow

### A. Launchpad Primary Mint (mint price = P)
```text
Buyer pays P
 → Creator        receives  P × 0.98
 → Treasury       receives  P × 0.015
 → Team           receives  P × 0.0025
 → Buyback Pool   receives  P × 0.0025
```
On-chain: Metaplex Candy Machine `solPayment` guard splits to multiple destinations via a pre-mint transfer instruction OR via a router program. Simplest path: add three `solPayment` guards in a guard group with split destinations, OR pre-bundle a SystemProgram transfer in the same tx.

### B. Direct Primary Marketplace Sale (creator-listed 1-of-1)
Same math as mint — no royalty yet because it's the first sale.

### C. Secondary Marketplace Sale (price = P, royalty = R%)
```text
Buyer pays P
 → Original Creator  receives  P × R%             (royalty, enforced)
 → Seller            receives  P × (1 − 0.02 − R%)
 → Treasury          receives  P × 0.015
 → Team              receives  P × 0.0025
 → Buyback Pool      receives  P × 0.0025
```
Example at P = 1 SOL, R = 5%:
- Creator royalty: 0.05 SOL
- Platform: 0.02 SOL (0.015 / 0.0025 / 0.0025)
- Seller net: 0.93 SOL

## 4. Code Surface Changes

### `src/config/treasury.ts`
- Promote `getLaunchpadFeeSplit` to a generic `getPlatformFeeSplit(amount, surface)` that returns `{ treasury, team, buyback, creator, royalty, seller }`.
- Add a `secondary` surface entry under `fees` mirroring `launchpad` (200 / 125 bps tiered).
- Update `marketplace.platformFee` from `250` → `200` so all surfaces match the 2.0% headline.

### `src/lib/fees.ts`
- Extend `getFeeBreakdown` to surface the 3-way internal split (treasury / team / buyback) — currently only returns a single `fee` number.
- Add `getSecondarySaleBreakdown(price, royaltyBps)` for resale UI.

### `src/pages/LaunchpadCreate.tsx`
- Replace the existing flat "2.0% Platform Fee" card with the new 3-line breakdown (Treasury 1.5% / Team 0.25% / Buyback 0.25%) and the creator net line — uses the new helper.

### `src/pages/CollectionDetail.tsx` + Marketplace listing/buy components
- Show the same breakdown card before "Buy" / "List" actions so sellers see net proceeds and buyers see where fees go.

### `src/pages/FeesAndPricing.tsx`
- Document the unified table from section 1 as the public-facing policy page.

### On-chain settlement
- **Solana mint**: in `supabase/functions/deploy-metaplex-launchpad/index.ts`, configure `solPayment` to a router PDA OR pre-append SystemProgram transfers for the 3 platform destinations. (Pure `solPayment` to a single destination cannot split — we either use a guard group with multiple `solPayment` entries or do the split in a wrapping client-side tx.)
- **Marketplace (`contracts/LilyPadMarketplace.sol`)**: change `marketplaceFeePercent` from `250` → `200`, replace single `withdrawFees` recipient with three immutable addresses (`treasury`, `team`, `buyback`) and split inside `buyItem` at sale time. Add royalty payout via ERC-2981 lookup before seller payout.
- **Monad equivalent**: same change in the Monad factory/marketplace contract path under `src/chains/monad/`.

## 5. Validation & Edge Cases
- Lamport-precise math via existing `BigInt` helpers in `src/lib/fees.ts` — no floating point in settlement.
- Rounding remainder (≤ 2 lamports) routed to Treasury.
- Enforce `royaltyBps + 200 ≤ 10000` at collection creation.
- Minimum sale price stays at `0.001 SOL` (already in `TREASURY_CONFIG.minimums`).

## 6. Out of Scope (call out, don't build now)
- Token-gated fee discounts (e.g. Lily Pad NFT holders).
- Cross-chain fee parity beyond Solana + Monad.
- Automated buyback execution from buyback pool (already covered by `executeBuyback`).

## 7. Deliverables Checklist
1. Updated `treasury.ts` config + generic split helper.
2. Updated `fees.ts` with surface-aware breakdown.
3. UI breakdown cards on LaunchpadCreate, CollectionDetail, Marketplace buy/list.
4. Updated `FeesAndPricing.tsx` policy page.
5. Marketplace contract update (Solidity + Solana settlement).
6. Edge function update for split-destination mint settlement.
