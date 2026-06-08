
# Standardize NFT Metadata to Metaplex Standard

Make every metadata JSON the app emits match the canonical Metaplex shape you shared:

```json
{
  "name": "...",
  "description": "...",
  "image": "...",
  "animation_url": "...",        // when media present
  "external_url": "...",         // collection website
  "attributes": [{ "trait_type": "...", "value": "..." }],
  "properties": {
    "files": [{ "uri": "...", "type": "image/png", "cdn": true }],
    "category": "image" | "video" | "audio" | "vr" | "html"
  }
}
```

## Scope

Touch only metadata-construction code (no contract / RLS / UI changes beyond passing already-collected fields through to the builder).

## Changes

### 1. New shared builder — `src/lib/metaplexMetadata.ts`
- `buildMetaplexMetadata(input)` returning the canonical shape.
- Helpers:
  - `mimeToCategory(mime)` — `image/*`→`image`, `video/*`→`video`, `audio/*`→`audio`, `model/*` or `.glb`→`vr`, `text/html`→`html`.
  - `inferMime(uri, fallback?)` — from extension (`.png|.jpg|.webp|.gif|.mp4|.webm|.mp3|.wav|.glb|.html`).
  - `buildFiles({ image, animation, thumbnail, preview, extra }, opts)` — produces `properties.files[]` with `type` and optional `cdn: true` for CDN hosts (`watch.videodelivery.net`, `cloudflarestream.com`, `*.r2.dev`, `lovable.app`).
- Always include `properties.category` (derived from primary media), `properties.files` (omit empty), and `external_url` when supplied.

### 2. Update each builder to use the shared helper

| File | Change |
|---|---|
| `src/lib/musicMetadata.ts` | Re-implement on top of helper; add `external_url` parameter; keep audio category and existing attrs. |
| `src/lib/assetBundler.ts` `nftToStandardMetadata` | Add full `properties` + optional `external_url`; pass `baseImageUri` mime as `image/png`. |
| `src/chains/solana/bundleDeploy.ts` | Replace inline object with helper call; thread `animation_url`/`external_url` from `template.extra`. |
| `src/components/launchpad/CandyMachineManager.tsx` (auto-sync) | Use helper; infer mime from `imageUrl` instead of hardcoding `image/png`; pass `external_url` from collection. |
| `src/components/launchpad/ContractDeployModal.tsx` | Use helper for collection meta; pass `collection.social_website` as `external_url`; include `properties.files` with cover image. |
| `src/hooks/useShopMint.ts` (item + collection) | Use helper for both; infer mime from URL. |
| `src/components/raffles/CreateOneOfOneModal.tsx` | Use helper; move `thumbUri` / `previewUri` into `properties.files` (drop non-standard top-level keys); derive category from animation/image. |
| `src/pages/LaunchpadCreate.tsx` non-music path | Use helper; thread `social_website` and per-asset `animation_url` if present; route `thumbUri`/`previewUri` into `properties.files`. |
| `src/integrations/arweave/legacyClient.ts` `uploadNFTToArweave` | Switch inline merge to helper; keep `extra` spread for caller overrides. |
| `src/chains/solana/agent.ts` `buildAgentNftMetadata` | Use helper; keep `category: 'agent'` override via opts. |

### 3. Field propagation (no schema changes)
- Thread `collection.social_website` → `external_url` through `ContractDeployModal`, `CandyMachineManager`, `LaunchpadCreate`, `useShopMint`.
- Thread `animation_url` from existing per-asset upload results (audio for music, video for video 1-of-1s) where the code already has the URI but discards it.

### 4. Backwards compatibility
- Helper outputs strict superset of current fields, so existing wallets/marketplaces keep working.
- Keep `creators` array in `properties` where it already exists (collection deploys), passed through opts.
- `seller_fee_basis_points`, `symbol`, `collection` top-level fields preserved when caller supplies them.

## Out of scope

- No DB migrations.
- No changes to Candy Machine / Candy Guard config.
- No changes to upload transport (Irys/Arweave stays as-is).
- No UI design changes; only plumbing of already-collected fields.

## Verification

- `npx tsc --noEmit` clean.
- Spot-check one of each path by logging the built JSON: music NFT, generative collection deploy, shop item, 1-of-1, agent NFT, ZIP export — confirm all match the target shape with correct `properties.category` and `properties.files[].type`.

## Technical notes

- `mimeToCategory` order matters: check `model/`/`.glb` before generic `application/octet-stream` fallback.
- `cdn: true` is only set when host matches the CDN allowlist; everything else omits the flag (don't emit `cdn: false`).
- For images uploaded to Arweave, omit `cdn` (Arweave is canonical, not a CDN mirror).
- Preserve `?ext=…` suffix convention already used for Arweave URIs in music NFTs.
