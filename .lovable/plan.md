## Goal
Replace the placeholder `ipfs://placeholder-…` URIs in the XRPL launcher with real Pinata IPFS pins, used for both XRPL **mainnet** and **testnet**. Arweave/Irys stays for Solana/Monad.

## Changes

### 1. `src/integrations/pinata/client.ts`
- Update the file header comment: Pinata is no longer "devnet only" — it's also the storage backend for all XRPL NFT uploads (mainnet + testnet).
- Add a small helper `ipfsUri(cid, filename?)` that returns canonical `ipfs://<cid>[/file]` strings (suitable for on-ledger URIs), separate from the existing `ipfsUrl` gateway helper used for browser previews.

### 2. `src/pages/XRPLEasyGenerator.tsx`
- In `handleFileUpload`, stop generating fake URIs. Just stage the `File` + preview locally.
- Add a new step in `handleMint` (before calling `launch`) that:
  1. Pins each image via `pinFile(item.file)` (sequential, with toast progress like `Pinning 3 / 12…`).
  2. Builds a per-NFT metadata JSON `{ name, description, image: "ipfs://<imageCid>", attributes: [] }` and pins it via `pinJson`.
  3. Pins a collection-level metadata JSON `{ name, description, image: <first item's image cid> }` and uses its `ipfs://<cid>` as the `collectionParams.uri`.
- Pass `uri: ipfs://<metadataCid>` for each item into `launch(...)`.
- Works identically for `network = 'mainnet' | 'testnet'` — Pinata isn't network-aware on XRPL.

### 3. Memory
- Update `mem://index.md` Core: note that **XRPL NFTs use Pinata IPFS** for metadata + images on both mainnet and testnet, while Solana/Monad continue using Arweave/Irys.

## Notes
- `pinata-upload` edge function already exists and reads `PINATA_JWT` server-side — no new secrets needed (assuming `PINATA_JWT` is configured; I'll verify with `fetch_secrets` before implementing and flag if missing).
- `mintNFT` in `src/chains/xrpl/nft.ts` already hex-encodes whatever URI is passed in, so `ipfs://<cid>` works as-is on-ledger.
- No DB schema changes. No edge-function changes.
- Out of scope: signing with a real connected XRPL wallet (still uses the placeholder seed — that's a separate task already noted in the code).

## Files touched
- `src/integrations/pinata/client.ts` (comment + helper)
- `src/pages/XRPLEasyGenerator.tsx` (real pinning in upload/mint flow)
- `mem://index.md` (Core note)
