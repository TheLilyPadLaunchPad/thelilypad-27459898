## Goal

Match the Metaplex Core Candy Machine standard for two payment flows:

1. **Mint proceeds → creator wallet** via the canonical `solPayment` guard (`destination = creator`).
2. **Creator pre-funds the Candy Machine** (rent for collection + CM + guard accounts + insert items + platform fee), instead of the platform treasury silently footing the bill.

Scope is intentionally narrow per your answer ("only align the payment guard") — no full SDK refactor.

## Changes

### 1. Force `solPayment.destination = creator wallet`

File: `src/pages/LaunchpadCreate.tsx` (`phaseToGuards`)

- Today: `destination: ph.payment?.destination || address` — a creator can accidentally override with another address and break "art pays creator".
- Standard pattern: always send mint SOL to the connected creator wallet for the launchpad flow. Lock it down:
  ```
  destination: address   // connected wallet, ignore per-phase override
  ```
- Same fix for `tokenPayment.destinationAta` (resolve creator ATA from the SPL mint).

This matches the Metaplex skill's `cli-candy-machine.md` / `sdk-core.md` "solPayment with destination = creator" pattern.

### 2. Edge function: surface the destination + platform creator on-chain

File: `supabase/functions/deploy-metaplex-launchpad/index.ts`

- Keep current `buildSingleGuard("solPayment")` — it already passes `destination` through.
- After building `defaults`, **validate** `solPayment.destination === creatorAddress` (reject otherwise) so a malicious client can't redirect mint proceeds.
- Royalties plugin: ensure `creators` array reflects the 85/15 creator/platform split already defined in `SOLANA_LAUNCHPAD_CONFIG.treasury.splits`, so secondary-sale royalties (and any creator-share enforcement) follow the standard.

### 3. Creator pre-funds Candy Machine deploy

The Metaplex standard payer for `createCandyMachine` is the wallet that signs the tx. Today the edge function signs everything with `TREASURY_PRIVATE_KEY`, so platform pays rent. To make the creator pay without rewriting the whole flow:

- Client-side, **before** invoking `deploy-metaplex-launchpad`, compute an estimated cost:
  ```
  deployCost = collectionRent + candyMachineRent(itemsAvailable, hidden?) 
             + candyGuardRent + insertItemsTxFees + platformFeeBps
  ```
  Use the constants from `@metaplex-foundation/mpl-core-candy-machine` (hidden-settings CM ≈ 0.012 SOL, configLines CM ≈ 0.0028 SOL/item, guard PDA ≈ 0.0023 SOL, collection ≈ 0.003 SOL).

- Have the connected wallet send that amount in **one SOL transfer with SPL memo `TheLilyPad:v1:launchpad-deploy`** to the treasury (matches existing protocol memo rule). Show the breakdown to the user before signing.

- Pass the resulting `paymentSignature` into the edge function payload. The function:
  - Verifies the memo + amount + recipient on-chain before doing any deploy work.
  - On success, refunds any unused remainder back to the creator at the end (small System transfer from treasury).
  - On any deploy failure, refunds the full amount.

This keeps the existing treasury-as-broadcaster architecture (no Phantom wallet sign-storm on the user) while making the creator economically responsible for deploy costs — the standard "creator pays Candy Machine" outcome.

### 4. Platform fee

- Add a `PLATFORM_DEPLOY_FEE_BPS` constant (default 1500 = 15%, matching the existing treasury config) applied on top of estimated rent.
- Recorded in `platform_fees` table after successful deploy.

## Out of scope (explicitly)

- Full client-side Umi `walletAdapterIdentity` refactor of CM creation (would be the "full refactor" option you declined).
- Changing guard groups / allowlist / startDate semantics.
- Mint-page UI fixes, missing on-chain tx visibility, image-upload security — tracked separately per the earlier prioritisation.

## Files touched

- `src/pages/LaunchpadCreate.tsx` — lock guard destination, add pre-deploy SOL transfer + cost estimator UI.
- `src/lib/launchpad/deployCost.ts` *(new)* — rent + fee estimator.
- `supabase/functions/deploy-metaplex-launchpad/index.ts` — verify `paymentSignature`, validate `solPayment.destination`, enforce creator-share on royalty plugin, refund on failure / remainder.

## Verification

- Deploy a test collection on devnet, confirm:
  - Creator wallet SOL balance decreases by `≈ rent + 15%` before deploy.
  - `solPayment.destination` on the Candy Guard matches the creator's address (check via explorer / `mplx core-candy-machine fetch`).
  - A mint sends SOL straight to the creator wallet.
  - On forced failure (bad URI), treasury refunds the full pre-payment.
