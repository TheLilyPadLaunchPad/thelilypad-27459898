
# Migrate to fully native Arweave (user ArConnect wallets)

Replace Irys end-to-end with raw `arweave-js`. Every user signs and pays for their own Arweave uploads using **ArConnect / Wander** (a browser extension). The platform pays for nothing and holds no Arweave keys.

## ⚠️ Trade-offs the user must accept

Before any code changes, the user should understand these are permanent consequences of this choice — they are not bugs to be fixed later:

- **New required wallet.** Every user who uploads anything (profile pic, NFT, chat message, sticker, shop item) must install **ArConnect** and fund it with AR tokens. Phantom alone is no longer enough.
- **Users must buy AR.** No free tier. No devnet. Even a 1-byte test upload costs real AR. Users will need an exchange that lists AR (Binance, KuCoin, MEXC, Gate) — *not* available on Coinbase or most US-friendly exchanges.
- **Candy Machine deploys become 2-step + slow.** Native Arweave needs ~2–20 min to make a URI retrievable. The current "upload → create CM" sequence will be split into "upload" → wait for confirmations → "create CM". Failed waits will require manual resume.
- **Metaplex Umi tooling loses its uploader.** `@metaplex-foundation/umi-uploader-irys` is removed; we write a thin custom uploader that wraps `arweave-js`. This is unsupported territory — Metaplex docs/examples won't apply.
- **Chat, profile sigs, and tiny writes become expensive.** Today these are sub-cent on Irys. Native Arweave has a per-tx minimum that makes high-frequency small writes uneconomical for end users. **Decentralized chat in particular may have to be disabled or moved off-Arweave.**
- **Mobile = mostly broken.** ArConnect is desktop-extension only. Mobile users cannot upload until a WalletConnect-compatible Arweave wallet (e.g. Wander mobile) is wired in, which is out of scope.

If any of these are dealbreakers, stop and pick a different option.

## Architecture

```text
        ┌────────────────────────┐
        │  ArConnect (window.    │
User →  │  arweaveWallet) holds  │
        │  AR + signs tx         │
        └───────────┬────────────┘
                    │ sign(tx)
                    ▼
        ┌────────────────────────┐
        │ src/integrations/      │
        │ arweave/nativeClient   │  ← new, replaces irys/client.ts
        │ (arweave-js)           │
        └───────────┬────────────┘
                    │ POST tx
                    ▼
        ┌────────────────────────┐
        │ arweave.net gateway    │
        └────────────────────────┘
```

No edge function involvement for uploads. Everything client-side, user-signed, user-paid.

## Scope

All Irys call sites get replaced. Based on grep, that's ~25 files:

- Core integration: `src/integrations/irys/client.ts` (1,973 lines), `src/integrations/irys/graphql.ts`
- Solana flows: `src/chains/solana/{client,metadata,bundleDeploy,cartCheckout}.ts`, `src/config/solana.ts`, `src/config/launchpad/solana.ts`
- Hooks: `useSolanaLaunch`, `useShopMint`, `useDecentralizedChat`
- Pages/components: `LaunchpadCreate`, `EditProfile`, `CollectionEditForm`, `ContractDeployModal`, `CreateOneOfOneModal`, `DeploymentDebugPanel`
- Monad: `src/chains/monad/metadata.ts`
- Misc: `src/lib/{payloadMapper,deployDebug,ipfs}.ts`

## Phases

### Phase 1 — New native Arweave client
- Create `src/integrations/arweave/nativeClient.ts` exporting the same surface the rest of the app uses today from `irys/client.ts`:
  - `uploadFile(file, tags)`, `uploadJson(obj, tags)`, `uploadBatch(items)`, `getPrice(bytes)`, `getBalance()`, `fund(amount)`
- Under the hood: `arweave-js`, signing via `window.arweaveWallet` (ArConnect API: `connect`, `getActiveAddress`, `sign`, `dispatch`).
- Add a `useArweaveWallet()` hook that detects ArConnect, prompts install if missing (link to chrome store / wander.app), and exposes connect/disconnect/balance.
- Replace the existing `arweave/{profileClient,messagingClient,indexClient}.ts` internals to use the new native client.

### Phase 2 — Custom Metaplex Umi uploader
- Write `src/chains/solana/umiArweaveUploader.ts` implementing the Umi `UploaderInterface` (`upload`, `uploadJson`, `getUploadPrice`) backed by the native client.
- Replace `umi.use(irysUploader(...))` with `umi.use(arweaveUploader(...))` in `src/chains/solana/client.ts`.
- Update the Candy Machine deploy sequence (`bundleDeploy.ts`, `useSolanaLaunch.ts`) to:
  1. Upload all assets + metadata via Arweave.
  2. Poll each returned tx ID against `arweave.net/tx/<id>/status` until confirmed (status 200, >0 confirmations).
  3. Only then create the Candy Machine.
- Persist `arweave_tx_ids` on the collection draft so a stalled deploy can resume without re-paying.

### Phase 3 — Call-site swaps
- Mechanically replace every `import … from '@/integrations/irys/client'` with the new native client.
- Update `EditProfile`, `CollectionEditForm`, `ContractDeployModal`, `CreateOneOfOneModal`, shop mint, raffles cart checkout, art generator, sticker manager.
- Remove the `Irys Solana Shim` (Phantom `sendTransaction` mapping) — no longer relevant.
- Keep the debug panel; rename "Irys" labels to "Arweave".

### Phase 4 — Decentralized chat decision
- `useDecentralizedChat` posts one Arweave tx per message. Economically dead under native Arweave.
- Options (we pick one before shipping):
  - Disable the feature and remove the UI entry point.
  - Switch chat-only storage to Supabase Realtime (still works, just not on-chain).
- Default: disable, with a feature flag so it can be re-enabled if a cheap path returns.

### Phase 5 — Remove Irys
- Delete `src/integrations/irys/`.
- `bun remove @irys/sdk @irys/web-upload @irys/web-upload-solana @metaplex-foundation/umi-uploader-irys` (whichever are present).
- Remove Irys URLs from `src/config/solana.ts` and any allowlists.
- Update `mem://infrastructure/irys-solana-provider-compatibility` (delete) and other Irys-referencing memory notes to point at the new client.

### Phase 6 — UX hardening
- ArConnect detection banner ("Install ArConnect to upload"). Link to https://www.wander.app/.
- AR balance display + warning when balance is below the cost of the pending upload.
- Confirmation-wait UI for Candy Machine deploys ("Waiting for Arweave network to confirm metadata — this can take 2–20 minutes"). Include resume on reload.
- Network errors now say "Arweave gateway unreachable" instead of generic "Network Error".

## Out of scope

- Mobile Arweave wallet support.
- Server-side fallback if ArConnect is missing (would require a platform JWK, which contradicts the chosen direction).
- Migrating already-uploaded Irys assets — existing URIs continue to resolve from arweave.net unchanged.
- Monad path: `src/chains/monad/metadata.ts` only uses Irys for one optional metadata hop; it gets the same swap but no contract changes.

## Risks

- ArConnect adoption rate is low → upload conversion will drop sharply on day 1.
- AR price volatility → users will sometimes see "insufficient AR" mid-deploy. Mitigation: pre-flight balance check.
- Candy Machine creation timing out while waiting for Arweave confirmations → idempotent resume is required, not optional.
- No Metaplex support if the custom Umi uploader breaks against a future `@metaplex-foundation/umi` release.

## Deliverables

- New `arweave/nativeClient.ts` + `useArweaveWallet` hook.
- Custom Umi Arweave uploader.
- All 25 call sites migrated.
- Decentralized chat disabled (or moved off-chain).
- Irys SDK and integration folder removed.
- Updated memory notes.
- New banners/UX for ArConnect install, AR balance, and confirmation waits.

