# Make every launched collection address end in `L3AP`

Like pump.fun's `…pump` suffix, every NFT collection (PFP, 1-of-1, music) launched on The Lily Pad will have its on-chain Core Collection address end with our brand suffix `L3AP`. This will be visible on Solscan, wallets, marketplaces — anywhere the collection address is shown.

## What changes

### 1. Deploy flow grinds a vanity keypair before signing
- `src/components/launchpad/ContractDeployModal.tsx`
  - Before invoking `deploy-metaplex-launchpad`, run the existing `runGrinderInWorker({ match: "L3AP", position: "suffix", timeoutMs: 120_000 })` from `src/lib/vanity/runGrinder.ts`.
  - Show a small progress UI: "Grinding vanity address …L3AP (X attempts, Ys)" with a Cancel button. Expected: ~11M attempts, ~10–60s in a Web Worker.
  - On success, pass `{ collectionSecretKey, collectionPublicKey }` in the edge-function payload.
  - On timeout/cancel, offer two choices: **Retry grind** or **Skip vanity (use random address)** so deploys are never permanently blocked.

### 2. Edge function uses the supplied keypair instead of generating one
- `supabase/functions/deploy-metaplex-launchpad/index.ts`
  - Accept optional `collectionSecretKey` (base58, 64 bytes) in the payload.
  - Validate: decodes to 64 bytes, public key matches `collectionPublicKey`, public key ends with `L3AP`.
  - Use it as `collectionSigner` via `umi.eddsa.createKeypairFromSecretKey(...)` instead of `umi.eddsa.generateKeypair()`.
  - If validation fails → 400 (don't silently fall back, the user explicitly opted in).
  - If field is absent → keep existing random behavior (back-compat for older clients / scripts).
  - The Candy Machine and Candy Guard keypairs stay random — only the **Collection address** (the user-visible "contract address") gets the suffix.

### 3. UI surfaces the brand suffix everywhere we already show the address
The L3AP badge code already exists on `CollectionDetail` (`contract_address?.endsWith('L3AP')`). Roll the same badge into:
- `CollectionCard` / launchpad grid tiles (small `…L3AP` chip)
- `CollectionHero` address copy button (tooltip: "Verified L3AP brand address")
- Marketplace listing cards

No DB migration needed — we read the suffix directly off `collections.contract_address`.

## Technical details

**Why client-side grind?**
- Keeps the secret key on the user's machine until the moment of deploy; the edge function uses it once to sign the create-collection tx and discards it.
- Avoids burning treasury CPU on the edge-function worker (Deno isolates are CPU-capped and `L3AP` grinds would frequently hit the wall-clock limit).
- We already shipped `src/lib/vanity/{grindKeypair,runGrinder,vanity.worker}.ts` — this just wires them in.

**Difficulty math**
- Base58 alphabet (excludes `0OIl`), `L3AP` is 4 chars → ~58⁴ ≈ 11.3M attempts. Modern laptops do ~200–500k/s in a worker → median ~30s. We default `timeoutMs` to 120s with a Cancel/Skip escape hatch.

**Security**
- Edge function re-derives the public key from the supplied secret key and rejects if it doesn't match `collectionPublicKey` or doesn't end in `L3AP`. This prevents a malicious client from convincing the server to sign for an unrelated/spoofed address.
- Secret key is never logged or persisted — used only to construct the Umi signer in-memory for that one tx.
- Ownership check (`creator_id === user.id`) already exists and is unchanged.

**Back-compat**
- `scripts/vanity/grind.ts` keeps working for ops-side pre-grinding.
- Collections deployed before this change keep their random addresses; the badge simply won't show on them. No backfill is attempted (we can't change a Solana account's address after the fact).

**Out of scope**
- Vanity suffix on Candy Machine / Candy Guard addresses (low visibility, would 3× the grind cost).
- Monad / EVM collections — different address derivation (CREATE2). Can be a follow-up using a CREATE2 salt grinder if you want `…1eap` style.
- Per-NFT mint addresses — those are minted by buyers, not us, so we can't vanity-grind them.

## Files touched
- `src/components/launchpad/ContractDeployModal.tsx` — add grind step + progress UI
- `supabase/functions/deploy-metaplex-launchpad/index.ts` — accept & validate `collectionSecretKey`
- `src/components/launchpad/CollectionCard.tsx` (or equivalent grid tile) — add `…L3AP` chip
- `src/components/collection-detail/CollectionHero.tsx` — tooltip on address copy
- `src/components/MarketplaceCard.tsx` (if it shows the collection address) — chip
