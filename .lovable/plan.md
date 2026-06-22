# Mainnet Stabilization Plan

Audit-only on bundle/runtime. For unfinished features, add feature flags so the mainnet build only exposes what's fully wired.

## Part 1 — Heavy Code Audit (report, no code changes)

### Initial-bundle offenders (forced eager by import chain)
| File:Line | Issue |
|---|---|
| `src/config/solana.ts:1–5` | Metaplex umi + mpl-core + mpl-core-candy-machine + mpl-toolbox imported at module scope; pulled in via `WalletProvider` → lands in initial chunk (~700KB) |
| `src/integrations/arweave/nativeClient.ts:26–28` | `arweave` + `@irys/web-upload` + `@irys/web-upload-solana` hoisted via same chain (~700KB) |
| `src/providers/WalletProvider.tsx:4` | `@solana/web3.js` eager (~900KB) |
| `src/components/FrogLoader.tsx:1` | `framer-motion` in a statically-imported loader — pulls full framer into initial JS |
| `src/App.tsx:13,16,18,20,21,22,23` | `NetworkStatusIndicator`, `MiniPlayer`, `FrogLoader`, `PWAUpdateNotification`, `AdminToolbar` (629 ln), `DevConsole`, `DeploymentDebugPanel` all static |

### Dead / redundant deps
- `@coral-xyz/anchor` (~500KB) in `package.json`, zero imports in `src/`.
- `ethers` + `viem` both shipped for EVM (`useMonadPayment.ts:1` vs `chains/monad/shop.ts:1`).

### vite.config.ts manualChunks gaps
Missing chunks: `xrpl` (~900KB), `viem`+`ethers`, `arweave`+`@irys/*`, `@reown/appkit*`, 5 of 8 `@metaplex-foundation/*` packages, ~14 Radix packages.

### Mega-components (split candidates)
`AllowlistManager.tsx` 1603, `MyNFTs.tsx` 1725, `LaunchpadCreate.tsx` 1642, `CollectionEditForm.tsx` 1506, `ArtworkUploader.tsx` 1360, `AdminDashboard.tsx` 1347.

### Runtime hot spot
`src/pages/MyNFTs.tsx:286–323` — 3 sequential Supabase round-trips for floor price; should be parallelised.

> No code changes from Part 1 — surfaced for a follow-up pass.

## Part 2 — Mainnet Component Status

### Fully built (keep visible)
- Solana: Candy Machine deploy, CM mint, SOL payments, protocol memo, Arweave bundle deploy, cart checkout, shop SOL purchase tx.
- XRPL: XLS-20 mint/list/buy via `chains/xrpl/*`, Pinata IPFS via edge function, `useXRPLConnectedLaunch` (Joey-signed path).
- Shop: `useShopMint.purchasePackOnChain` SOL+cNFT mint, `MyPurchases`.
- Streaming/chat: `useStreamPresence`, Supabase chat (LiveChat / WaitRoom / InterviewRoom), `ClipViewer`.

### Unfinished (gate behind feature flags)
| Feature | Evidence |
|---|---|
| Solana Marketplace / Escrow | `useMarketplaceContract.ts` + `useEscrowProgram.ts` are stubs; placeholder program ID; `isDeployed:false` |
| LimitedEditionMint donor tiers | Hardcoded supply, SOL paid but no NFT minted |
| Livepeer RTMP streaming | No SDK; `Watch.tsx` only renders local MediaStream — remote viewers cannot watch |
| `useXRPLLaunch` (seed-based) | Raw seed path, dev-only — must not be reachable from UI on mainnet |
| Decentralized Arweave chat | Already gated (`DECENTRALIZED_CHAT_ENABLED=false`) — leave |
| XRPL Joey `defaultChain` | Hardcoded `xrpl.testnet.id` in `src/config/joeyWallet.ts:31` |

## Part 3 — Changes to Make (build mode)

1. **Extend `src/config/featureFlags.ts`** with mainnet flags:
   ```ts
   export const SECONDARY_MARKETPLACE_ENABLED = false; // escrow stub
   export const DONOR_TIER_MINT_ENABLED = false;       // no on-chain backing
   export const LIVEPEER_STREAMING_ENABLED = false;    // not wired
   export const XRPL_SEED_LAUNCH_ENABLED = false;      // dev-only
   ```
   All default `false`; can be flipped per-env later.

2. **Gate UI entry points** (hide nav links, list/buy buttons, CTA cards — no logic deletion):
   - `src/components/Navbar.tsx` / `MobileBottomNav.tsx` — hide Marketplace secondary-sale entry when `!SECONDARY_MARKETPLACE_ENABLED`.
   - `src/pages/Marketplace.tsx` + `CollectionDetail.tsx` listing/buy buttons → render disabled "Coming soon" badge.
   - `src/pages/LimitedEditionMint.tsx` — wrap mint CTA with flag; show "Coming soon" panel.
   - `src/pages/Streams.tsx`, `Watch.tsx`, `GoLive.tsx` — when `!LIVEPEER_STREAMING_ENABLED`, show "Streaming beta — coming soon" placeholder and hide Go Live CTA. Keep `ClipViewer` and `WaitRoom` visible (they don't depend on Livepeer).
   - Any UI entry to `useXRPLLaunch` (seed path) — remove from UI, keep file.

3. **Route guards** in `src/App.tsx`: when flag is off, the route renders a small "Coming soon" component instead of redirecting (preserves SEO + back-button).

4. **XRPL default chain**: change `src/config/joeyWallet.ts:31` to read from `import.meta.env.VITE_XRPL_NETWORK` with fallback `mainnet`. Document `VITE_XRPL_NETWORK=testnet` for dev.

5. **No other code touched.** No bundle splitting, no lazy-loading, no provider refactor — those land in a separate pass once flags are in.

## Verification
- `bun run build` succeeds.
- `/marketplace` shows collections but list/buy buttons render "Coming soon".
- `/limited-edition-mint` shows Coming soon panel.
- `/streams` and `/watch/:id` show Coming soon; `/clips/:id` and `/waitroom/:id` still work.
- XRPL Easy Generator still mints via Joey connected flow; no seed input is reachable.

## Out of Scope
- Heavy-code refactor (Part 1 is informational only).
- Building the escrow Anchor program or Livepeer integration.
- Touching the `feature_locks` admin system.
