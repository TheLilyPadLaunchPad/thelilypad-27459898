# Full Metaplex Plugins + Candy Guards Integration

Today the launchpad uses **1 Core plugin** (Royalties) and **2 guards** (botTax, solPayment). This plan exposes the full Metaplex Core plugin set and all ~20 Candy Guards as first‑class creator features, with per‑phase guard groups and automatic hidden settings.

## Scope

### Core Collection plugins (10)
Royalties (existing), Attributes, VerifiedCreators, PermanentFreezeDelegate, PermanentTransferDelegate, PermanentBurnDelegate, ImmutableMetadata, AddBlocker, UpdateDelegate, Autograph.

### Candy Guards (20)
botTax, solPayment, tokenPayment, token2022Payment, startDate, endDate, mintLimit, redeemedAmount, addressGate, allowList, nftGate, nftBurn, nftPayment, tokenGate, tokenBurn, programGate, gatekeeper, thirdPartySigner, freezeSolPayment, freezeTokenPayment, edition, assetGate, assetBurn, assetPayment.

### Per‑phase guard groups
Each launch phase (OG / WL / Public / custom) becomes a Candy Machine **guard group** with its own start/end/price/allowlist/limits.

### Hidden settings
Auto‑configured when the user picks **Generative / Blind Box** in Step 1. No extra UI.

## Files

### New
- `src/config/launchpad/candyGuards.ts` — registry of all guards (id, label, description, category, input schema, default value, payload builder).
- `src/config/launchpad/corePlugins.ts` — registry of all Core collection plugins (same shape).
- `src/components/launchpad/GuardConfigurator.tsx` — UI: category accordion → guard toggle → per‑guard config form.
- `src/components/launchpad/CollectionPluginsPanel.tsx` — UI for collection‑level plugin toggles.
- `src/components/launchpad/PhaseGuardGroups.tsx` — per‑phase guard group editor (wraps `GuardConfigurator`).
- `src/chains/solana/guardPayload.ts` — pure functions: `buildGuardSet(config)` → Metaplex `DefaultGuardSetArgs`, `buildGuardGroups(phases)` → `groups[]`.

### Edited
- `src/config/launchpad/types.ts` — extend `WLPhaseConfig` with `guards: GuardConfig`, add `CollectionPluginsConfig` to launch payload.
- `src/pages/LaunchpadCreate.tsx` — wire new panels into Step 1/Review; pass guards/plugins/groups to `deployViaBackend`.
- `src/hooks/useSolanaLaunch.ts` — extend `deployViaBackend` params with `collectionPlugins`, `guardGroups`, `defaultGuards`, `hiddenSettings`.
- `supabase/functions/deploy-metaplex-launchpad/index.ts` — accept new payload; build `plugins[]` for `createCollection`; build `guards` + `groups[]` for `createCandyGuard`; auto‑emit `hiddenSettings` when `collectionType === 'blind_box'`.
- `src/components/launchpad/PhaseConfigManager.tsx` — replace stub with real per‑phase guard editor entrypoint.

## Technical notes

### Guard registry shape (`candyGuards.ts`)
```ts
type GuardCategory = 'payment' | 'time' | 'limit' | 'gating' | 'advanced';
type GuardDef = {
  id: keyof DefaultGuardSetArgs;
  label: string; description: string; category: GuardCategory;
  fields: Array<{ key: string; type: 'number'|'address'|'date'|'csv'|'select'; label: string; required?: boolean }>;
  build: (cfg: any, ctx: { creator: PublicKey }) => OptionOrNullable<any>;
};
```
A single registry feeds both UI rendering and the edge function's payload builder (shared via `src/chains/solana/guardPayload.ts`).

### Edge function changes
- Replace hard‑coded `botTax`/`solPayment` block with `buildGuardSet(defaultGuards)` for the global set and `buildGuardGroups(phases)` for `groups`.
- Add `if (hiddenSettings) builder = ...createCandyMachine({ hiddenSettings: some({...}), ... })` branch; skip `configLineSettings` in that branch.
- Validate every address with `publicKey()` and clamp numeric lamports with `sol()`.

### Hidden settings auto‑logic
If `collectionType === 'blind_box'`:
- `placeholderName = "<collectionName> #$ID+1$"`
- `placeholderUri = "https://arweave.net/<manifestRoot>/$ID$.json"`
- `hash = sha256(placeholderUri).slice(0,32)` (computed server‑side).

### Per‑phase guard groups
Candy Machine guard groups have a 32‑char label limit and require a `default` guard set. The default = the most permissive global config; each phase overrides `startDate`, `endDate`, `solPayment`, `allowList`, `mintLimit`, `addressGate`.

## Out of scope (now)
- Plugin/guard editing **after** deploy (these need separate update flows).
- Monad — guards are Solana‑only; Monad UI shows "Not applicable".
- Gatekeeper network selection beyond Civic default.

## Validation
- Zod schemas in `candyGuards.ts` for each guard's input form.
- Edge function rejects guard payloads with unknown keys or invalid addresses (HTTP 400).
- Manual devnet test: deploy a 3‑phase collection (OG free + WL token‑gated + Public solPayment) and confirm all guards enforced.
