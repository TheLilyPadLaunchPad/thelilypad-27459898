# Plan: Mainnet Beta Hardening + Remove Vanity Branding + L3AP Staging

Three connected workstreams: strip the vanity "…L3AP" branding step (tester says unneeded), audit and fix the mainnet launchpad + marketplace data path end-to-end so beta testers experience a "Metaplex-grade" flow, and wire the real L3AP mint into config so the next-stage token work can begin.

## 1. Remove Branding Collection Address

The vanity grinder (`VANITY_BRAND = "L3AP"`) runs in-browser before every deploy, adds 30–120s of CPU work, and frequently fails / forces the "Skip vanity" path anyway. Tester is correct — it's not needed.

- `src/components/launchpad/ContractDeployModal.tsx`
  - Remove `VANITY_BRAND` constant, `grindKeypair` import, vanity progress UI, "Branding …L3AP" toast, and the `vanity_suffix` field on the persisted deploy payload.
  - Deploy with a plain `generateSigner(umi)` collection mint (no grinding, no skip-toggle UI).
- `src/pages/LaunchpadCreate.tsx`
  - Remove the `"Branding collection address …L3AP"` progress step from `setDeployCheckoutProgress`; collapse the 3-step progress to 2 steps (upload → deploy).
- `src/lib/vanity/*` and `scripts/vanity/grind.ts` stay in the repo (still used by the standalone L3AP mint script) but are no longer referenced from the launch flow.

## 2. Mainnet Beta Audit & Fixes

Goal: every launchpad + marketplace surface that currently "works on devnet" returns real on-chain data when the network toggle is set to **mainnet**, with no silent fallbacks to devnet, mock data, or placeholder addresses.

### 2a. Network & RPC

- `src/config/solana.ts` — confirm mainnet RPC list is Helius-first (`HELIUS_API_KEY` is set) with public Solana mainnet as fallback; ensure `getBestRpc('mainnet')` health-check actually filters dead endpoints.
- `src/hooks/*` that read `localStorage` network flag — verify they all call `createUmi('mainnet', wallet)` rather than defaulting to devnet when the flag is missing.
- Treasury: `src/config/launchpad/solana.ts` Platform split currently points at `BQefQgbpAqPjoGKLTmAA2haZh9pEURYNefPFwsTotgem`. Confirm with user this is the **mainnet** platform wallet before beta.

### 2b. Launchpad deploy path (the original runtime-error thread)

- `supabase/functions/deploy-metaplex-launchpad/index.ts` — add structured `phase` logging on entry of every step, flip `skipPreflight: false` for the combined collection+CM+guard tx so real chain errors surface, and split the bundle if simulated tx size > 1232 bytes (createCollection in tx A, createCandyMachine+createCandyGuard+wrap in tx B).
- `src/hooks/useSolanaLaunch.ts` + `src/chains/solana/programs.ts` — surface the edge-function `phase` + `error` into the UI toast instead of generic "Deploy failed".
- Verify `insertItemsToCandyMachine` batches of 10 work against mainnet rate limits (add 250ms jitter between batches).

### 2c. Marketplace / live data

- `src/hooks/useMarketplaceData.ts`, `useCollectionStatsSolana.ts`, `useLaunchpadStats.ts`, `useVolumeTracking.ts` — confirm they query mainnet (Helius DAS) when network=mainnet and do not fall back to Supabase mock rows when the RPC call returns empty.
- `get_launchpad_stats` / `get_platform_stats` / `get_top_collections_stats` DB functions — confirm they aren't filtering out mainnet rows (no `network = 'devnet'` predicate anywhere).
- Mint button on `CollectionDetail` — verify it builds a real Candy Machine mint tx on mainnet and that the `chain_id` / `network` field on `collections` is honored.

### 2d. Acceptance checklist for beta

```text
[ ] Connect Phantom on mainnet → wallet balance + NFTs load via Helius
[ ] Create draft collection → upload assets to Irys (real SOL spend)
[ ] Deploy Candy Machine → single signature, tx confirms on mainnet
[ ] Insert 100+ items → all batches succeed, itemsLoaded == itemsAvailable
[ ] Public mint from a second wallet → NFT lands in wallet, royalty enforced
[ ] Marketplace page lists the new collection with correct floor / volume
[ ] Switch network toggle to devnet → mainnet collections disappear cleanly
```

## 3. L3AP Token Staging (no on-chain action this round)

- `src/config/tokens.ts` — replace the `L3AP` placeholder `mintAddress` with the real address **`L3APdU7dRYSeUzJBAYRh6YayrK1dQzsmTGuABTaWbqG`**, set `isPlaceholder: false`, and confirm `decimals: 6`.
- Leave `L3AP_MINT_SECRET_KEY` Cloud secret untouched (already set).
- Do **not** yet enable L3AP as a Candy Guard payment option or buyback target — that's the "next stage" the user mentioned. This plan only unblocks it by making the mint address real everywhere it's read.
- Grep for remaining `L3APxxxx` placeholders and replace; add a unit-safe `getTokenBySymbol('L3AP')` test.

## Out of scope (call out explicitly)

- No new L3AP minting, no buyback wiring, no governance changes.
- No Monad changes.
- Vanity grinder code stays on disk for the standalone L3AP mint script; only the launchpad UI path is removed.

## Technical notes

- The deploy edge function has no logs in either env (confirmed last turn), so the `phase` instrumentation in 2b is what will let us actually diagnose the next mainnet failure instead of guessing.
- `skipPreflight: true` was almost certainly hiding the real cause of the earlier runtime error; flipping it is the single highest-signal change in this plan.
- Tx-size split in 2b is the documented Metaplex pattern when `guardGroups` has 2+ phases — required for collections with both OG and WL phases on mainnet.
