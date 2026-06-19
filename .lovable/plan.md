## Goal

Bring back the layered **trait generator** flow for XRPL (the generative/PFP path that currently exists for Solana/Monad), and make sure XRPL launches push assets through **Pinata IPFS** on both testnet and mainnet.

## What exists today

- `src/pages/XRPLEasyGenerator.tsx` — only handles 1-of-1 style uploads (pick N images → pin each → mint). No layer/trait engine.
- `src/pages/ArtGenerator.tsx` — full generative pipeline (LayerManager, TraitRarityEditor, TraitRulesManager, `assetGenerator`) but it only outputs a ZIP and is gated to Solana/Monad.
- `src/integrations/pinata/client.ts` already exposes `pinFile` / `pinJson` and goes through the `pinata-upload` edge function — works for any network.
- `src/hooks/useXRPLConnectedLaunch.ts` signs `AccountSet` + `NFTokenMint` through the connected Joey Wallet on the chosen XRPL network.
- Launchpad tiles in `src/pages/Launchpad.tsx`: the `generative` and `art-generator` tiles are restricted to `chains: ["solana", "monad"]`, so XRPL users never see a trait generator. XRPL clicks short-circuit to `/launchpad/xrpl-generator`.

## Plan

### 1. New page: `src/pages/XRPLTraitGenerator.tsx`

A trait-driven wizard for XRPL, modeled on `ArtGenerator` but ending in an on-ledger mint instead of a ZIP download.

Steps:
1. **Setup** — collection name, description, symbol, network (`testnet` default, `mainnet`), taxon, transfer fee, XLS-20 flags (reuse the UI from `XRPLEasyGenerator`).
2. **Layers** — `LayerManager` + `TraitRarityEditor` + `TraitRulesManager` (same components ArtGenerator uses).
3. **Generate** — call `generateAssets(...)` from `src/lib/assetGenerator.ts` to produce N composited PNG `Blob`s + per-NFT trait arrays. Show progress + preview grid.
4. **Review & Mint** — show first ~20 previews, supply count, network, fee, expected pin count.
5. **Minting** — for each generated asset:
   - `pinFile(blob)` → image CID
   - `pinJson({ name, description, image: ipfs://<cid>, attributes: traits.map(t => ({trait_type, value})), collection: { name, family } })` → metadata CID
   Then `pinJson(collectionMeta)` for the AccountSet Domain. All pinning uses the existing Pinata edge function, which already serves testnet identically to mainnet.
6. **Complete** — pass `{ network, collection, items }` to `useXRPLConnectedLaunch().launch(...)`, then show tx hashes (link to `livenet.xrpl.org` or `testnet.xrpl.org` based on `network`).

Guardrails reused from `XRPLEasyGenerator`:
- Require `isConnected && chainType === 'xrpl'`; otherwise call `connectXRPL()` and stop.
- Block `transferFee > 0` when the Transferable flag is off.
- Validate URI length via existing `validateXRPLUri` inside `useXRPLConnectedLaunch`.

### 2. Routing — `src/App.tsx`

Add a lazy route:
```
/launchpad/xrpl-trait-generator → XRPLTraitGenerator (ProtectedRoute)
```
Keep `/launchpad/xrpl-generator` (Easy/1-of-1 flow) as-is.

### 3. Launchpad tiles — `src/pages/Launchpad.tsx`

- Add `"xrpl"` to the `chains` array of the **generative** tile and the **art-generator** tile so they appear when XRPL is selected.
- In `handleTileClick`, when `selectedChain === 'xrpl'`:
  - `generative` or `art-generator` → `navigate('/launchpad/xrpl-trait-generator')`
  - `1of1` (and the existing fallback) → keep navigating to `/launchpad/xrpl-generator`
- Update `continueDraft` similarly so XRPL generative drafts land on the trait generator.

### 4. Pinata IPFS confirmation

No code change needed in `src/integrations/pinata/client.ts` — `pinFile`/`pinJson` already work on every network because the `pinata-upload` edge function holds the JWT. Both the existing `XRPLEasyGenerator` and the new `XRPLTraitGenerator` will pin via Pinata for testnet **and** mainnet, satisfying the "link XRPL launchpad to Pinata IPFS testnet" requirement.

If users want a visible confirmation, the Review step will show a "Storage: Pinata IPFS" badge so it's obvious which backend is being used.

## Technical notes

- Reuse `generateAssets` from `src/lib/assetGenerator.ts` — it already returns composited image bytes plus trait arrays, no new compositor needed.
- XRPL `NFTokenMint` URI is limited to 256 bytes; `ipfs://<cid>` (~53 chars) and `ipfs://<cid>/0.json` style URIs both fit.
- We pin per-NFT JSON individually (not a directory) to mirror the existing XRPL Easy flow and avoid a new edge-function code path.
- No backend / schema / RLS changes.

## Files touched

- **New**: `src/pages/XRPLTraitGenerator.tsx`
- **Edit**: `src/App.tsx` (add route)
- **Edit**: `src/pages/Launchpad.tsx` (tile chains + routing)
