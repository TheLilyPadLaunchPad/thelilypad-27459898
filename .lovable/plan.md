# Metaplex Core Compliance Remediation Plan

Closes the three blockers raised in the audit so the project can claim a complete Metaplex Core launchpad (target compliance 9/10).

## 1. Transaction simulation in edge functions

Add a mandatory dry‑run before any SOL is spent or DB row marked deployed.

- In `supabase/functions/deploy-metaplex-launchpad/index.ts`, insert a new phase `simulate` between `preflight-authority` and `send`:
  - Build the `createCollection` tx with the umi builder, then call `umi.rpc.call("simulateTransaction", ...)` (via `@solana/web3.js` `Connection.simulateTransaction` against the same RPC endpoint) with `sigVerify: false, replaceRecentBlockhash: true, commitment: "processed"`.
  - Parse `value.err` and `value.logs`. On any error, return `{ ok:false, phase:"simulate", error, logs, refundable:true, paymentSignature }` so the existing refund flow (`refund-deploy-payment`) reverses the SOL charge.
  - Repeat the same pattern for the Candy Machine `create` tx and the first `addConfigLines` batch.
- Add the same simulation step to `supabase/functions/deploy-candy-machine/index.ts` (and any other function that sends a user‑funded tx — audit list during implementation).
- Cap simulation compute‑unit logs to last ~50 lines before returning, to keep response payload small.

## 2. Core Asset marketplace — deploy `escrow_program`

The Anchor source already exists at `anchor/escrow_program/` but uses a placeholder ID and is not deployed.

Steps:

1. **Fix the program**
   - Replace placeholder `declare_id!("Escrow11111…")` with a real keypair‑derived program ID (generated via `solana-keygen new -o target/deploy/escrow_program-keypair.json`).
   - Convert `escrow_account` to a PDA seeded by `[b"escrow", asset.key()]` (currently `init` with no seeds — unsafe).
   - Add a `cancel_listing` instruction (seller reclaims authority, closes escrow).
   - In `purchase`, route a 2.5% cut to the platform treasury (matches `PLATFORM_FEE_BPS`) and emit an SPL memo `TheLilyPad:v1:marketplace_buy`.
   - Replace direct lamport mutation with `system_program::transfer` CPI (safer, supports buyer = non‑PDA).
2. **Build & deploy**
   - `anchor build` → produces `.so` + IDL.
   - Deploy to devnet first, then mainnet, using the platform deploy keypair (kept in `TREASURY_PRIVATE_KEY` secret — never in `src/`).
   - Store the deployed program ID in a new edge‑function secret `ESCROW_PROGRAM_ID` and surface it to the client via a small `get-config` edge function (no secret leaks).
3. **Client integration**
   - Replace stubs in `src/hooks/useEscrowProgram.ts` and `src/hooks/useMarketplaceContract.ts` with real Anchor calls using `@coral-xyz/anchor` + the deployed IDL (`anchor/escrow_program/idl/escrow_program.json`).
   - Wire `listItem`, `cancelListing`, `purchaseItem` to actual on‑chain instructions; keep the existing `nft_listings` DB rows as an index/cache only (source of truth = chain).
   - Add a Helius webhook listener (new edge function `marketplace-indexer`) that updates `nft_listings.status` on `initialize_listing` / `purchase` / `cancel_listing` events.
4. **Buyback pool hardening (bonus, same PR)**
   - Add an on‑chain authority check: wrap the buyback wallet in a tiny PDA‑gated program OR — minimal change — restrict withdrawals to a multisig (Squads) and store the multisig address in `buyback_pool` table. Document in `docs/buyback.md`.

## 3. Legacy code cleanup

Remove the dead Token Metadata + EVM artifacts that confuse the audit, **without** breaking the active Monad chain support (Monad still uses ERC‑721 — that stays).

Delete / quarantine:

- `src/config/theLilyPad.ts` (legacy EVM contract constants, all stubs returning `""` / `false`).
- `src/config/nftContract.ts` and the EVM‑only fields in `src/config/nftFactory.ts` (keep IPFS helpers, drop `NFT_FACTORY_ADDRESS` / `isFactoryConfigured`).
- `src/hooks/useVerifyTheLilyPad.ts` (references the dead Lily Pad ERC‑721).
- `contracts/TheLilyPad.sol`, `TheLilyPadUpgradeable.sol`, `SimpleLilyPadNFT.sol`, `LilyPadNFT.sol` — replaced by Metaplex Core. Keep `BuybackController.sol`, `LilyPadToken.sol`, `LilyPadGovernor.sol`, `LilyPadTimelock.sol`, `LilyPadMarketplace.sol` (Monad side).
- Any Token‑Metadata (`mpl-token-metadata`) imports in edge functions — confirm with `rg "mpl-token-metadata" supabase/functions` and remove unused branches. The unified deploy path is Core only.
- Update `src/chains/index.ts` and `src/chains/solana/*` to drop legacy re‑exports surfaced by the deletions.

Add a single source‑of‑truth doc `docs/metaplex-standards.md` stating: **Solana = Metaplex Core only. Monad = ERC‑721A.** Audit script `scripts/check-no-legacy.ts` (grep for forbidden imports) wired into CI as a sanity guard.

## Technical details

```text
deploy-metaplex-launchpad phases (new):
  validate → upload → preflight-authority → simulate → send → confirm → finalize
                                              ^^^^^^^^ NEW
                                              on fail → refund
```

Files touched (high‑level):

- `supabase/functions/deploy-metaplex-launchpad/index.ts` (+ simulate phase)
- `supabase/functions/deploy-candy-machine/index.ts` (+ simulate phase)
- `supabase/functions/marketplace-indexer/index.ts` (new)
- `supabase/functions/get-config/index.ts` (new, returns `ESCROW_PROGRAM_ID`)
- `anchor/escrow_program/src/lib.rs` (PDA seeds, fee cut, cancel ix, memo, CPI)
- `anchor/escrow_program/idl/escrow_program.json` (regenerated)
- `src/hooks/useEscrowProgram.ts`, `src/hooks/useMarketplaceContract.ts` (real Anchor)
- Delete: `src/config/theLilyPad.ts`, `src/hooks/useVerifyTheLilyPad.ts`, `src/config/nftContract.ts`, 4 legacy `.sol` files
- New: `docs/metaplex-standards.md`, `scripts/check-no-legacy.ts`
- New secret: `ESCROW_PROGRAM_ID`

## Out of scope

- New marketplace UI design (use existing `Marketplace.tsx` shell).
- Migrating existing test‑net `nft_listings` rows (drop & re‑seed on devnet).
- Squads multisig provisioning — documented but operator action required.

## Open questions before I build

1. **Escrow deploy keypair** — should I generate a fresh devnet keypair and have you fund + provide the secret, or do you already have a program keypair you want reused?
2. **Buyback hardening** — accept the lightweight "multisig wallet + DB record" path, or do you want the full custom guard program (larger scope)?
3. Want me to keep the Token‑Metadata UI option in the launchpad wizard (hidden flag) for future use, or remove it entirely?
