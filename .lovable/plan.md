# Robinhood Chain NFT Generator

A new layered trait generator for Robinhood Chain, built like the XRPL trait generator but stopping before on-chain deployment — the chain isn't connectable yet, so everything stays as a saved draft plus a downloadable export.

## What the user gets

A new page at `/launchpad/robinhood-trait-generator` with the same five-step flow people already know:

1. **Setup** — collection name, symbol, description, supply (cap 10,000), royalty percentage, external link.
2. **Layers** — upload trait images per layer, reorder, set optional layers.
3. **Rarity & Rules** — per-trait rarity weights plus incompatible / requires / forces rules.
4. **Generate** — composites the artwork, duplicate-free, with a preview grid.
5. **Review & Export** — instead of a mint button:
   - "Save draft" keeps the collection in the app so it can be picked up later.
   - "Download collection" produces a ZIP with `images/` and `metadata/` (ERC-721 style JSON, since Robinhood Chain is EVM) plus a `collection.json`.
   - A clear "Deploying to Robinhood Chain is coming soon" notice, matching the wallet modal's coming-soon treatment.

Robinhood Chain also shows up as a launch option in the Launchpad chain picker, with a "Coming soon" badge on deploy-only tiles so nobody expects a live mint.

## Technical notes

- New page `src/pages/RobinhoodTraitGenerator.tsx`, modeled on `src/pages/XRPLTraitGenerator.tsx`, reusing `LayerManager`, `TraitRarityEditor`, `TraitRulesManager`, `generateAssets`, and `GenerationPreview`. No minting hook, no wallet requirement for the generator itself.
- Add `'robinhood'` to `SupportedChain` in `src/config/chains.ts` with a `CHAINS.robinhood` entry (EVM, symbol RH/ETH placeholder, `isActive: false` so wallet/deploy paths skip it) and to `getDbChainValues`. Guard the existing `switch` statements in `src/chains/index.ts` and `getExplorerUrl` so the new value doesn't break them.
- Add a Robinhood chain icon to the shared `ChainIcon` component (reuse the SVG already in `ChainConnectModal.tsx`).
- Register the lazy route in `src/App.tsx` next to the XRPL generator routes; keep it inside `ProtectedRoute` only if draft saving needs a signed-in profile, otherwise allow guests to generate and export.
- Drafts use the existing localStorage draft convention (`DRAFT_PREFIX + robinhood_trait`) plus the current Supabase staged-image bucket, same as other generators. No new tables.
- Export ZIP built client-side with `jszip`; metadata follows the ERC-721 shape already produced by `buildERC721Metadata` in `src/chains/monad/metadata.ts`.
- `src/pages/Launchpad.tsx` gains `robinhood` in the chain list with deploy tiles disabled and the trait-generator tile enabled.

## Out of scope

No wallet connection, no contract deploy, no on-chain mint for Robinhood Chain. Those land once the chain and its wallet support are available.
