# Replan: Curated Public Launches

Reposition The Lily Pad around three hand-picked launch categories, curated by the team, and simplify the public launch flow so anyone can ship a collection in a short wizard.

## The three categories

- **Featured NFT Projects** — art-first drops the team backs.
- **Utility NFT Projects** — access, memberships, tools, holder perks.
- **Memecoin NFT Projects** — meme/community-driven drops.

Only the team assigns a category. Creators cannot self-feature. A collection appears in a rail only after an admin curates it there.

## Part 1 — Curation system (admin-only)

Extend the existing featured-collections system with the three new rails alongside the retained monthly pick:

- Allowed rail types become: `featured_nft`, `utility_nft`, `memecoin_nft`, `monthly`.
- Retire the current `homepage` and `weekly` rails (existing rows migrate: `homepage` -> `featured_nft`, `weekly` rows are deactivated).
- Curation stays admin-only through the existing access rules; everyone can read active entries.
- Works across all chains (Solana, XRPL, Monad) — a chain badge shows on each card, and each rail can be filtered by chain.

Admin dashboard (Featured Collections Manager) gets four tabs — one per rail — with search over every collection regardless of chain, drag-free ordering via display order, active toggle, and start/end dates as today.

## Part 2 — Homepage rebuild

Replace the current featured section with:

1. **Collection of the Month** — single hero card, kept.
2. **Featured NFT Projects** — carousel rail.
3. **Utility NFT Projects** — carousel rail.
4. **Memecoin NFT Projects** — carousel rail.

Each rail: title, one-line description, chain filter chips (All / Solana / XRPL / Monad), horizontally scrollable cards using the existing glass-case NFT frame, and a "View all" link into the marketplace pre-filtered to that category. Rails with no curated entries are hidden.

## Part 3 — Marketplace category views

- Add category tabs to the marketplace mirroring the three rails plus "All".
- Route `/marketplace?category=utility_nft` (and equivalents) so homepage "View all" links land filtered.
- Category filter composes with the existing chain filter and sorting.

## Part 4 — Simple public launch flow

Introduce a **Simple Launch** path as the default entry for `/launchpad`:

- Three steps: **Details** (name, symbol, description, cover, supply, price, mint date) -> **Assets** (drop images or a folder; auto-generates metadata) -> **Review & Launch**.
- Chain picked on step 1; Solana, XRPL, and Monad all supported, reusing the existing chain deploy paths.
- Everything not needed for a basic drop — trait rules, rarity weighting, candy-guard phase editors, allowlist manager, hybrid/escrow, reveal scheduling, treasury splits — moves behind an **Advanced Launch** toggle that opens today's full wizard unchanged.
- A "Submit for curation" action at the end of a launch notifies admins; it does not grant a rail, it just queues the collection for team review.

## Technical notes

- Database: widen the `feature_type` check on `featured_collections` to the four values, migrate `homepage`/`weekly` rows, keep the existing indexes and admin-only write policies, and keep public read of active entries. No new tables required.
- New `src/components/sections/CuratedCategoryRail.tsx` replaces `HomepageFeaturedCollections` and the weekly slideshow; `FeaturedCollectionsSlideshow` is kept only for the monthly hero.
- Category constants live in one place (`src/config/curation.ts`) and are shared by the admin manager, homepage rails, and marketplace tabs.
- `src/pages/Launchpad.tsx` gains the Simple/Advanced switch; `LaunchpadCreate.tsx` (1.6k lines) stays as the advanced wizard, with the simple flow as a new lightweight component that reuses the same deploy hooks — no duplication of chain logic.
- Copy updates in `public/llms.txt` and homepage/meta description to reflect the curated positioning.
