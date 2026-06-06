# Vanity Address Plan: L3AP Token + Collection Suffix

Generate Solana keypairs whose base58 public keys carry the `L3AP` brand mark — at the **start** for the platform's L3AP SPL token mint, and at the **end** for every collection address minted through the launchpad.

## 1. Shared vanity grinder

Create `src/lib/vanity/grindKeypair.ts` (browser-safe, uses `@solana/web3.js` `Keypair.generate()` in a loop) and a Node twin at `scripts/vanity/grind.ts` for offline grinding of the L3AP token mint.

API:
```ts
grindKeypair({ match: 'L3AP', position: 'prefix' | 'suffix', caseSensitive?: boolean, timeoutMs?: number, onProgress?: (n) => void })
  → { keypair, attempts, elapsedMs }
```

Notes:
- Base58 alphabet excludes `0`, `O`, `I`, `l`. `L3AP` is all valid ✅.
- Expected attempts: ~58⁴ ≈ **11.3M** per match. Suffix grinding is the same cost as prefix.
- Browser grind runs in a **Web Worker** (`src/lib/vanity/vanity.worker.ts`) so the UI stays responsive; report progress every 50k attempts.
- Hard cap default 60s in-browser; surface a "Keep grinding / Use random address" choice if it times out.

## 2. L3AP token mint (one-time, prefix `L3AP…`)

- Offline script `scripts/vanity/grind-l3ap-mint.ts` grinds a `L3AP`-prefixed keypair, prints pubkey + base58 secret, and writes nothing to disk by default.
- Operator stores the secret in the `L3AP_MINT_SECRET_KEY` Supabase secret (runtime) and pastes the pubkey into `src/config/tokens.ts` replacing the current placeholder `L3APxxxx…`.
- New edge function `mint-l3ap-token` consumes the secret once, calls `createSplToken` (already in `src/chains/solana/splToken.ts`) passing the vanity keypair as `mintSigner`, mints initial supply to the platform treasury, then the secret is rotated/deleted.
- `tokens.ts` flips `isPlaceholder: false` once the real address is in place.

## 3. Collection vanity suffix `…L3AP` at deploy time

Touch only the Solana deploy path; Monad is untouched.

Frontend (`src/components/launchpad/ContractDeployModal.tsx`):
- Before calling `deploy-metaplex-launchpad`, run the Web Worker grinder for a `suffix=L3AP` keypair.
- Show a small progress UI ("Branding your collection address… 1.2M/11M tries") with a Skip button that falls back to a random address and records `vanity_skipped=true`.
- On success, send `{ collectionKeypairSecret: base58 }` in the deploy payload.

Edge function (`supabase/functions/deploy-metaplex-launchpad/index.ts`):
- Accept optional `collectionKeypairSecret`. If present, build the collection signer via `umi.eddsa.createKeypairFromSecretKey(bs58.decode(secret))` instead of `generateKeypair()`. Validate the resulting pubkey actually ends in `L3AP` server-side; reject otherwise.
- Existing CM/Guard signers stay random (no branding requirement).

Database: add `vanity_suffix text` and `vanity_skipped boolean default false` to `collections` so we can audit branded vs. non-branded launches.

## 4. UX surface

- `src/pages/LaunchpadCreate.tsx` deploy step: short note "Your collection address will end in **L3AP** — our on-chain signature."
- `CollectionDetail` header: when `contract_address` ends in `L3AP`, render a small "🪷 L3AP-verified address" badge.

## Out of scope
- Grinding longer brands (e.g. `L3APAD`) — exponentially more expensive.
- GPU grinders / `solana-keygen grind` wrappers.
- Vanity for Candy Machine / Candy Guard PDAs (PDAs aren't grindable the same way).
- L3AP buyback tier engine (still deferred from previous turn).

## Technical risks
- **Secret handling**: the collection secret is generated client-side and POSTed once to the edge function for signing. It is never stored after the deploy tx is confirmed. Document this in the function header.
- **Browser CPU**: ~11M base58 checks ≈ 10–40s on a modern laptop in a worker; mobile may need the Skip path.
- **Determinism**: validate the suffix server-side so a malicious client can't smuggle in an unbranded keypair.
