# Fix broken devnet launchpad deploy

## What's actually wrong

1. `src/pages/LaunchpadCreate.tsx` → `handleDeploy` always uses Arweave/Irys:
   - `preFundIrysForBatch(...)`
   - `uploadBatchToArweave(...)` for all item images + metadata
   - `uploadToArweave(coverFile, ...)` and `uploadMetadataToArweave(...)` for the collection
   On devnet, Irys/Arweave is intermittently unreachable from the preview → the console shows `Network Error` retries on images 121–123, then the sandbox restarts and the tester sees a "page refresh."
2. The `collections` row is inserted *before* uploads finish, so a mid-flight reload leaves a zombie `upcoming` collection and no resumable state for the user.
3. The Pinata routing we built (`prepareDevnetManifest`, `pinFile`, `pinJson`) is wired into `metadataUpload.ts` only — `handleDeploy` never calls it.

## Fix

### 1. Devnet upload path (Pinata)
In `src/pages/LaunchpadCreate.tsx` `handleDeploy`, branch on `isDevnet()` from `@/integrations/pinata/client`:

- Skip `preFundIrysForBatch` entirely on devnet (no SOL needed for Pinata).
- For each asset:
  - `pinFile(asset.file, asset.name)` → image CID/URL
  - build the per-item metadata via the existing `buildMetaplexMetadata` / `buildMusicNftMetadata` using the Pinata image URL
- Bundle all per-item JSONs with `prepareDevnetManifest(builtMetadata, name)` → returns `{ manifestRoot, items }`, giving a single `${manifestRoot}/$ID$.json` URI template for hidden settings.
- For the collection cover + collection metadata:
  - `pinFile(coverFile)` → `collectionImageUri`
  - `pinJson({ name, symbol, description, image })` → `collectionMetadataUri`
  - `pinJson({ name: "Unrevealed…", … })` → `revealPlaceholderUri`
- Music: also route `track.audioFile` through `pinFile` instead of `uploadToArweave` when on devnet (keep Arweave tags only on mainnet, since IPFS doesn't carry UDL tags).

Mainnet flow stays exactly as it is today.

Add a small helper near the top of `handleDeploy`:

```ts
const devnet = isDevnet();
const uploadImage   = devnet ? pinataUploadImage   : arweaveUploadImage;
const uploadJson    = devnet ? pinataUploadJson    : arweaveUploadJson;
const uploadBundle  = devnet ? pinataUploadBundle  : arweaveUploadBundle;
```

…so the rest of the function stays linear and the two providers are interchangeable.

### 2. Don't insert the `collections` row until uploads succeed
Move the `supabase.from("collections").insert(...)` block to **after** the asset/metadata uploads complete (right before `setPendingOnChainDeploy`). That way a failed upload no longer leaves a zombie row. Keep the existing cleanup-on-failure code as a safety net for the on-chain step.

### 3. Reload guard during deploy
Add a `beforeunload` listener that's active while `isDeploying === true`:

```ts
useEffect(() => {
  if (!isDeploying) return;
  const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
  window.addEventListener("beforeunload", h);
  return () => window.removeEventListener("beforeunload", h);
}, [isDeploying]);
```

This stops the browser from silently dropping a long deploy when Vite HMR or the sandbox reconnects.

### 4. Toast copy
Replace "Securing N items to Arweave…" / "Uploading collection banner/metadata to Arweave…" with provider-aware strings: `"Pinning N items to IPFS (devnet)…"` vs `"Securing N items to Arweave…"`. Same for `"Persistence secured on Arweave"`. Use `debugUpload('solana.pinata', …)` / `debugUri('solana.pinata', uri)` so the floating Debug panel shows the right scope.

## Files to edit (build mode)

- `src/pages/LaunchpadCreate.tsx` — branching upload path, deferred collection insert, reload guard, toast copy.
- `src/integrations/pinata/client.ts` — add a tiny `pinFiles(files)` helper for batched image pinning with progress callback (re-uses existing `pinFile`).
- `src/lib/metadataUpload.ts` — already exposes `prepareDevnetManifest`; no change.

No edge-function changes, no DB migration, no mainnet behavior change.

## Out of scope

- Cleaning up existing zombie `collections` rows from previous broken attempts.
- Replacing Arweave on mainnet.
- Changing the edge function `deploy-metaplex-launchpad` (it already accepts the manifest-root URI shape).
