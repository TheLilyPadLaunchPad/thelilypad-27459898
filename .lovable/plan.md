# Fix: Candy Machine deployed but empty (itemsLoaded = 0)

The deploy edge function creates the Collection + Candy Machine + Guard, but never writes per-item config lines into the CM. Result: `itemsAvailable = N`, `itemsLoaded = 0`, mints fail. The detail page also doesn't surface this state.

## What to change

### 1. Server-side: insert items during deploy
**File:** `supabase/functions/deploy-metaplex-launchpad/index.ts`

After the `createCandyMachine` + `wrap` builder sends successfully, run a second pass that:
- Accepts a new `items: { name: string; uri: string }[]` field in the payload (length must equal `itemsAvailable`).
- Chunks items into batches of 10.
- For each batch, builds an `addConfigLines` tx (from `@metaplex-foundation/mpl-core-candy-machine`) with `index` = running offset and `configLines` = batch, then `sendAndConfirm` with `skipPreflight: true`.
- Tracks `itemsLoaded` and returns it in the response.
- On partial failure (e.g. batch 3 of 5 fails), still updates the collection row with whatever was loaded and returns a `partial: true` flag plus the failed offset so the client can resume.

If `items` is omitted (back-compat), skip the insert pass and return `itemsLoaded: 0` with a warning — the UI repair flow (below) handles legacy rows.

### 2. Client-side: send items in the deploy payload
**File:** `src/components/launchpad/ContractDeployModal.tsx` (and any other caller of `deploy-metaplex-launchpad`)

Before invoking the function:
- For each artwork in the collection, upload its per-NFT metadata JSON via `uploadCollectionMetadata` (already handles Arweave + Supabase fallback).
- Build `items = artworks.map((a, i) => ({ name: \`${name} #${i + 1}\`, uri: metadataUrl }))`.
- Pass `items` in the payload alongside the existing fields.
- Show a progress toast: "Uploading metadata (3/8)…", "Inserting items (batch 1/1)…".

### 3. DB: persist load state
**Migration:** add `items_loaded INTEGER DEFAULT 0` to `collections`. Update at the end of deploy and after any repair run.

### 4. UI: surface "loaded vs available" + repair button
**File:** `src/pages/CollectionDetail.tsx`

- Fetch CM on-chain state (use existing `fetchCandyMachine` helper or read `items_loaded` from DB).
- If `items_loaded < total_supply` AND user is the creator, render a yellow `Alert`: "Your Candy Machine has 0/8 items loaded. Mints will fail until you insert items." with a "Repair: insert missing items" button.
- The button reuses the existing `CandyMachineManager` "Insert Items" tab logic but auto-populates the JSON from `artworks_metadata` + uploads any missing metadata first.

### 5. Block mint UI when empty
**File:** `src/pages/CollectionDetail.tsx` mint button

Disable the Mint button with tooltip "Collection not fully loaded — contact creator" when `items_loaded === 0` or `items_loaded < itemsAvailable` and the active phase would draw past `items_loaded`.

## Technical notes
- `addConfigLines` from `mpl-core-candy-machine` is the correct call (not the legacy `mpl-candy-machine` import).
- CM `configLineSettings.uriLength` is currently `200` when `baseUri` is empty — Arweave URLs (~50 chars) and Supabase public URLs (~150 chars) both fit. Verify before insert; if any URI exceeds `uriLength`, fail fast with a clear error.
- The treasury wallet is the CM authority, so the edge function (already signing with `DEVNET_TREASURY_PRIVATE_KEY`) can run `addConfigLines` without the creator wallet.
- Idempotency: query `itemsLoaded` on-chain before insert; only insert from `itemsLoaded` onward. Safe to re-run.
- Out of scope: changing config-line layout (prefixUri optimization), Bubblegum/cNFT path, mainnet treasury funding.

## Verification
After deploy, the function response should include `itemsLoaded === itemsAvailable`. The detail page should drop the warning alert, and a test mint on devnet should succeed.