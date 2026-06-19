## Goal

Let XRPL creators choose **Pinata IPFS** (current default) or **Arweave** (permanent) for trait images, per-NFT metadata, and the collection-level JSON written into the AccountSet `Domain`. The choice is a per-launch toggle in `XRPLTraitGenerator`.

## Important constraint

Arweave uploads in this project go through **Irys, funded in SOL by the connected Solana wallet (Phantom)** — see `src/integrations/arweave/nativeClient.ts` (`uploadBytes`). There is no AR/XRP funding path. So when an XRPL user picks Arweave, they must also have a Solana wallet connected to pay for the bundle. Pinata stays the zero-extra-wallet default.

## Changes

### 1. `src/pages/XRPLTraitGenerator.tsx`
- Add storage state: `const [storage, setStorage] = useState<'pinata' | 'arweave'>('pinata')`.
- Setup step: add a `Select` ("Storage provider") with two options:
  - **Pinata IPFS** — "Free, fast, requires no extra wallet"
  - **Arweave (permanent)** — "Permanent storage, paid in SOL via your Solana wallet"
- When `storage === 'arweave'`: show a small notice + read `solanaAddress` from `useWallet()`; disable the "Continue" button on the review step if no Solana wallet is connected, with a toast prompting the user to connect Phantom.
- Replace the hard-coded `pinFile` / `pinJson` calls in the mint loop with a small local helper:
  ```ts
  async function uploadImage(blob: Blob, name: string): Promise<string> {
    if (storage === 'arweave') {
      const { uploadBlob } = await import('@/integrations/arweave/nativeClient');
      const { url } = await uploadBlob(blob, { contentType: blob.type, tags: [{ name: 'Content-Type', value: blob.type }] });
      return url; // https://arweave.net/<id>
    }
    const cid = await pinFile(new File([blob], name, { type: blob.type }));
    return ipfsUri(cid);
  }
  async function uploadJson(obj: unknown): Promise<string> { /* same branching */ }
  ```
- Use the returned URI for both per-NFT `URI` (still passed through `convertStringToHex` in `useXRPLConnectedLaunch`) and the collection `Domain` URI. Both `ipfs://…` and `https://arweave.net/…` already pass `validateXRPLUri` (256-byte limit) — keep that check.
- Review step: show a "Storage: Pinata IPFS" or "Storage: Arweave (permanent)" badge so the tester can confirm the active choice before signing.

### 2. No backend / schema changes
- Pinata path keeps using the `pinata-upload` edge function.
- Arweave path reuses the existing Irys-backed `uploadBytes/uploadBlob/uploadJson` in `nativeClient.ts` — no new secrets, no new edge function.
- `useXRPLConnectedLaunch` is untouched; it already accepts any string URI.

### 3. Memory
- Update `mem://features/xrpl-xls20-integration` to note that XRPL launches now support a Pinata-or-Arweave toggle, and that the Arweave path requires a connected Solana wallet for Irys funding.

## Out of scope
- No changes to the 1-of-1 `XRPLEasyGenerator` flow (can be done in a follow-up if desired).
- No new AR/XRP payment path for Irys.
- No change to mainnet vs testnet selection — both storage options work on both XRPL networks.
