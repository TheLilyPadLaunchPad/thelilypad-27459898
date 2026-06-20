
## 1. Wallet Profile — "Holdings Folder" Redesign

Rework the wallet/profile page so a user's NFTs read like a clean file-manager.

### Stats header
A band at the top of `PublicProfile` / `ArtistProfile` showing:
- Total NFTs owned
- Number of distinct collections
- Estimated portfolio value (sum of floor price × owned, per chain, converted to USD via existing `useCryptoPrice`)
- Chain breakdown chips (Solana / Monad / XRPL counts)

### Folder grid (collections)
- Default view = grid of "collection folders". Each folder card shows: collection art, name, count badge ("12 items"), small stack of 3 thumbnail peeks, floor price.
- Click a folder → inline expand (accordion) showing the actual NFT tiles inside, or route to `/profile/:id/collection/:collectionId` for deep link.
- Empty-state per chain.
- Search + sort (Recently acquired / Floor desc / Name).

### Per-NFT actions
On each NFT tile (hover on desktop, kebab menu on mobile):
- **Set as profile picture** — snapshot mode: writes `image_url` into `user_profiles.avatar_url` + flag `avatar_source = 'nft'` + `avatar_nft_mint` for display only (no on-chain verify loop).
- **List for sale** — opens existing listing modal.
- **Transfer / Send** — opens existing transfer flow (Solana / Monad / XRPL hook based on chain).
- **View on explorer** — Solscan / Monad explorer / Bithomp.

### Data sources (already in repo, just compose)
- `useWalletNFTs` for Solana DAS
- Monad: ERC-721 enumeration via existing `src/chains/monad/client.ts`
- XRPL: existing `src/chains/xrpl/nft.ts`
- Floor prices via `useNFTFloorPrices`

### New components
```text
src/components/profile/holdings/
  HoldingsStatsHeader.tsx
  CollectionFolderCard.tsx
  CollectionFolderGrid.tsx
  NFTTile.tsx                 // with action menu
  NFTActionMenu.tsx
  SetAsPfpButton.tsx
```
Wired into `PublicProfile.tsx` replacing the current flat NFT list.

### DB change
Migration adds two nullable columns to `user_profiles`:
- `avatar_source text` ('upload' | 'nft')
- `avatar_nft_mint text`

No RLS changes needed (table policies already cover owner updates).

---

## 2. Cross-Marketplace Top Collections ("Market Pulse")

Show top NFT collections from external marketplaces with floor / vol / 24h vol / buys / sells, plus a side-by-side **Lily Pad Advantage** column.

### Surfaces
- **Top 10 widget** on `/marketplace` (new `MarketPulseWidget`) — compact table.
- **Full page** at `/market-pulse` (Top 20, sortable, chain filter Solana / Ethereum / Monad). Linked from Marketplace and main nav under "Discover".

### Data sources (free / public tiers)
- **Solana** — Magic Eden public API + Tensor public stats endpoint
- **Ethereum** — Reservoir (preferred, has key-less tier) + OpenSea fallback
- **Monad** — Magic Eden Monad collection stats endpoint

All calls go through a new **edge function `market-pulse`** so:
- API keys (if any) stay server-side
- We can cache responses in `app_settings` or a new lightweight table for 5 min to stay under rate limits
- CORS is controlled

### Edge function shape
`supabase/functions/market-pulse/index.ts`
- Query: `?chain=solana|ethereum|monad&limit=20`
- Returns normalized rows:
  ```ts
  { rank, name, image, chain, floor, floorUsd, volume24h, volumeTotal, buys24h, sells24h, listed, marketplace, url }
  ```
- 5-minute in-memory + table cache (`market_pulse_cache` table, single row per chain).

### Lily Pad Advantage column
For each external row, we render a static comparison cell pulled from platform config:
- Creator royalties enforced (vs marketplace bypass)
- Buyback % feeding token (volume booster)
- Platform fee (lower than ME / OS)
- "Print money better" callout when a Lily Pad collection beats the external floor/vol on the same chain.

Powered by `src/config/marketComparison.ts` (new) so values stay editable.

### New files
```text
src/pages/MarketPulse.tsx
src/components/marketplace/MarketPulseWidget.tsx
src/components/marketplace/MarketPulseTable.tsx
src/components/marketplace/AdvantageCell.tsx
src/hooks/useMarketPulse.ts            // wraps the edge function
src/config/marketComparison.ts
supabase/functions/market-pulse/index.ts
```

### DB change
New table `market_pulse_cache` (chain text PK, payload jsonb, fetched_at timestamptz) with `GRANT SELECT … TO anon, authenticated`, `service_role` full access, RLS on with public read policy (cache is non-sensitive).

---

## Out of scope (will not touch this round)
- On-chain PFP verification / hex frame (you chose snapshot mode)
- Listing/transfer modal internals — we reuse the existing flows
- Buyback engine itself — only its config values are surfaced in the Advantage column

---

## Technical notes
- All new components use existing semantic tokens (mint primary, dark frog theme) — no hardcoded colors.
- Edge function uses `npm:@supabase/supabase-js@2/cors` headers, validates query with Zod.
- Reservoir / Magic Eden keys: if needed, requested via `add_secret` after plan approval.
- Holdings grid uses `useInfiniteScroll` for large wallets.
- All chain queries respect the existing `ChainProvider` + `chainUtils` normalization ("solana" | "monad" | "xrpl").
