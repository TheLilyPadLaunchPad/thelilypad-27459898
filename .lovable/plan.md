# Drop ArConnect, restore Irys (Solana-paid Arweave)

Phantom-only flow: users sign and pay for Arweave uploads in SOL through the Irys network node. No second wallet, no AR token, still permanent storage. Existing Arweave-deployed collections stay untouched.

## Why this works
- Irys exposes a Solana funding path: the user funds an Irys node with SOL via a normal Solana tx (signed by Phantom/Solflare/etc.), then signs upload receipts with the same Solana keypair.
- Candy Machine just stores the resulting `https://arweave.net/<id>` URI — it doesn't care who paid.
- Files <100 KiB are free on Irys (no funding tx needed), which covers most JSON metadata.

## Scope of changes

### 1. Add Irys uploader (Solana adapter)
- New `src/integrations/irys/solanaClient.ts` wrapping `@irys/web-upload` + `@irys/web-upload-solana`.
- Wallet adapter sourced from the existing Solana wallet (`window.phantom.solana` / WalletProvider) — no ArConnect import anywhere.
- Public API mirrors the current `nativeClient.ts` so callers don't change much: `uploadBytes`, `uploadJson`, `uploadBlob`, `getBalance`, `fund`, `getUploadPriceSol`.
- Auto-fund logic: before an upload, compare price vs. node balance; if short, send a single SOL funding tx (with our standard `TheLilyPad:v1:irys-fund` memo) and wait for Irys to credit it.

### 2. Rewire upload callers to the new client
Files importing `@/integrations/arweave/nativeClient` or `useArweaveWallet`:
- `src/integrations/arweave/umiArweaveUploader.ts` → swap to Irys Solana client.
- `src/lib/metadataUpload.ts` → drop the ArConnect branch; use Irys for permanent path, keep Supabase `ipfs` bucket only as an explicit "draft / non-permanent" fallback.
- Any Candy Machine per-item upload path in `LaunchpadCreate` / `bundleDeploy.ts` / `assetBundler.ts` → same swap.
- Remove `useArweaveWallet` usages from UI (connect buttons, status pills, balance displays).

### 3. Remove ArConnect surface area
- Delete `src/integrations/arweave/nativeClient.ts`, `src/hooks/useArweaveWallet.ts`, `src/types/arconnect.d.ts`.
- Remove the `arweave` npm dep (only used by nativeClient).
- Remove any "Connect Arweave wallet" UI, install-Wander prompts, and AR-balance checks.
- Keep `src/integrations/arweave/graphql.ts` / read-only helpers — those only hit the public gateway, no wallet needed.

### 4. Edge function (`deploy-metaplex-launchpad`)
No change to the deploy function itself — it already accepts a `uri` and per-item `uri` values. The switch is purely on the client upload side. (We previously added `mplCore/mplCandyMachine/mplToolbox` plugins; those stay.)

### 5. UX in `LaunchpadCreate`
- Replace the "Connect ArConnect + fund with AR" step with a single cost preview: "Permanent storage: ~X SOL via Irys (paid from your connected Solana wallet)."
- One Phantom approval for the funding tx (only if needed), then uploads stream in the background.
- Clear error if Phantom is not connected.

### 6. Memory + docs
- Update `mem://infrastructure/irys-solana-provider-compatibility` from "Irys removed" to "Irys restored, Solana-funded, Phantom-only."
- Update core memory line about ArConnect/Wander.
- Update `docs/nft-launchpad.md` storage section.

## What we are NOT doing
- Not touching collections already deployed with ArConnect-uploaded Arweave URIs (per your answer).
- Not changing Monad flow.
- Not changing Candy Machine on-chain layout or guards.
- Not adding a Supabase-storage fallback for permanent NFT assets — Irys is the only permanent path.

## Risk / open items
- The previous "Irys removed" decision was driven by Phantom signer incompatibility. The fix is to use `@irys/web-upload-solana` (current package), which adapts the Solana wallet signature flow correctly — confirmed working with Phantom in current Irys docs. If we hit signature issues again, fallback is to sign funding txs manually with `@solana/web3.js` and only use Irys SDK for the upload receipts.
- Irys mainnet endpoint: `https://node1.irys.xyz` (Solana mainnet); devnet uses `https://devnet.irys.xyz` with Solana devnet. Network selection follows the existing `network` toggle.

## Files touched (approx.)
- add: `src/integrations/irys/solanaClient.ts`
- edit: `src/integrations/arweave/umiArweaveUploader.ts`, `src/lib/metadataUpload.ts`, `src/lib/assetBundler.ts`, `src/chains/solana/bundleDeploy.ts`, `src/pages/LaunchpadCreate.tsx`, `src/components/launchpad/*` (any AR wallet UI)
- delete: `src/integrations/arweave/nativeClient.ts`, `src/hooks/useArweaveWallet.ts`, `src/types/arconnect.d.ts`
- deps: `+ @irys/web-upload @irys/web-upload-solana`, `- arweave`
- memory: update Irys + core lines
