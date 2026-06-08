## Goal

Devnet deploys via `deploy-metaplex-launchpad` are crashing with no useful trace. Per the Metaplex skill (`references/cli-candy-machine.md`, `references/sdk-core.md`, `references/cli-troubleshooting.md`) and our own canonical reference at `scripts/deploy-cm.ts`, the correct shape for a Core Candy Machine drop is the **one-bundle / hidden-settings** flow with a **single Arweave (or IPFS) directory manifest**. The current edge function instead:

- Uses `esm.sh` for every Metaplex package (incompatible with edge-runtime's lockfile + slow cold starts; matches the documented "Edge Function Deploy Errors" failure mode).
- Calls `addConfigLines` in a loop inside the edge function for non-blind collections (the very pattern the canonical script eliminates).
- Builds `hiddenSettings` only for `blind_box`, so generative/1-of-1/music drops still take the slow path.
- Has no Pinata path for devnet — it tries to use Irys-funded Arweave URIs that the client built with the user's wallet, but those uploads can silently 0-byte when funded on devnet.
- Returns `error.message || "Unknown error"` with no structured cause, which is why the runtime error report is empty.

The fix is a clean restructure of the edge function to match `scripts/deploy-cm.ts` exactly, plus making Pinata the devnet storage backend for **both** asset images and metadata (today it only handles metadata).

## Plan

### 1. Rewrite `supabase/functions/deploy-metaplex-launchpad/index.ts` to mirror `scripts/deploy-cm.ts`

Always use the one-bundle / hidden-settings flow regardless of collection type:

1. Validate auth + ownership (keep current logic).
2. Bootstrap Umi with `npm:` specifiers (not `esm.sh`) — switch to:
   - `npm:@metaplex-foundation/umi-bundle-defaults`
   - `npm:@metaplex-foundation/umi`
   - `npm:@metaplex-foundation/mpl-core`
   - `npm:@metaplex-foundation/mpl-core-candy-machine`
   - `npm:@metaplex-foundation/mpl-toolbox`
   - `npm:bs58`
   This eliminates the documented esm.sh / `deno.lock` crash class.
3. Expect the client to provide already-uploaded `items: [{ name, imageUri?, uri }]` plus a `manifestRoot` (or compute it server-side from the supplied per-item URIs).
4. Compute SHA-256 `itemsHash` over `i:name:uri` exactly as the reference script does.
5. Single tx builder:
   - `createCollection` with `Royalties` (+ any extra Core plugins from `collectionPlugins`).
   - `createCandyMachine` with `hiddenSettings: { name, uri: <manifestRoot>/$ID$.json, hash }` — **never** `configLineSettings`, **never** `addConfigLines`.
   - `createCandyGuard` + `wrap`.
6. Send once with `sendAndConfirm`, return `{ collectionAddress, candyMachineAddress, candyGuardAddress, signature, itemsHashHex, manifestRoot }`.
7. Structured error handling: catch and return `{ error, stack, phase }` so blank-screen reports actually contain a cause; log `console.error(JSON.stringify(...))` so it shows in edge logs.

### 2. Extend Pinata client to upload images for devnet

`src/integrations/pinata/client.ts` already has `pinFile`. Wire it into the deploy flow:

- Add `uploadAssetImage(file)` helper in `src/lib/metadataUpload.ts` that uses Pinata on devnet, Irys on mainnet, Supabase as fallback (same 3-tier pattern already used for metadata).
- In `useSolanaLaunch.deployViaBackend`, when `network === 'devnet'`, upload all images via Pinata, then build per-item metadata JSONs, pin each via Pinata, and assemble a **directory manifest JSON** that the edge function uses as the hidden-settings prefix URI.
- Mainnet path is unchanged (Irys directory manifest already implemented in `uploadJsonManifest`).

### 3. Standardize the client → edge-function contract

Update `deployViaBackend` (and `LaunchpadCreate` callers) so the edge function only ever receives:

```ts
{
  collectionId, name, symbol, creatorAddress, royaltyPercent,
  network: 'devnet' | 'mainnet',
  collectionUri,            // already uploaded
  manifestRoot,             // e.g. https://gateway.pinata.cloud/ipfs/<CID>
  placeholderName,          // e.g. "Lily #"
  itemsAvailable,
  items: [{ name, uri }],   // used only for hash, never inserted
  collectionPlugins, defaultGuards, guardGroups,
  collectionSecretKey?, collectionPublicKey?,
}
```

Remove `baseUri`, `hiddenSettings`, `collectionType` branching, the legacy `phases[0].price` fallback, and the `items` insert path. The edge function becomes a thin wrapper around the reference script.

### 4. Delete dead code paths

- Drop the `addConfigLines` loop and `setComputeUnitPrice`/`setComputeUnitLimit` batching from the edge function.
- Drop `collectionType === 'blind_box'` branching — all collections deploy via hidden settings now.
- Keep `deployHiddenCollection` (already aligned with this model) as the client-signed alternative; mark `deployViaBackend` as its backend twin.

### 5. Verification

- Deploy `deploy-metaplex-launchpad` + `pinata-upload`, tail `supabase functions logs deploy-metaplex-launchpad` while running a devnet deploy from the UI.
- Confirm the response includes a real `signature` and the explorer shows the collection + candy machine.
- Confirm any failure now returns a structured `{ error, phase, stack }` instead of the empty runtime report.

### Files touched

- Rewrite: `supabase/functions/deploy-metaplex-launchpad/index.ts` (+ `package.json` deps moved to `npm:` specifiers — actually drop `package.json` since we use Deno `npm:` imports).
- Edit: `src/lib/metadataUpload.ts` (add `uploadAssetImage` + `uploadAssetMetadata` helpers that route through Pinata on devnet).
- Edit: `src/hooks/useSolanaLaunch.ts` `deployViaBackend` payload + a small `prepareDevnetAssets` helper that builds the items/manifest from the user's images.
- Edit: `src/pages/LaunchpadCreate.tsx` only at the point where it calls `deployViaBackend` (pass the new payload shape).
- No DB / RLS changes.

### Technical notes

- The Core Candy Machine program ID `CMACYFENjoBMHzapRXyo1JZkVS6EtaDDzkjMrmQLvr4J` (from skill `Program IDs`) is the only one used.
- Hidden-settings `hash` must be exactly 32 bytes; we use `crypto.subtle.digest("SHA-256", …)` and slice — same as the reference script.
- Pinata returns a gateway URL like `https://gateway.pinata.cloud/ipfs/<CID>`. For the manifest pattern we store per-item JSONs as `<CID>/0.json` style by pinning a folder (use Pinata's "pin directory" via `pinFileToIPFS` with `wrapWithDirectory: true`). The edge function then uses `${manifestRoot}/$ID$.json` as the hidden URI exactly like the Arweave path manifest.
