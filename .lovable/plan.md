# Audit: Helius Devnet RPC + Reown Wallet

## Findings

### 1. Helius RPC (devnet) — ✅ correct, ⚠️ key exposed
`src/config/solana.ts` line 8:
```
https://devnet.helius-rpc.com/?api-key=0c6d7147-...
```
This is the correct Helius devnet RPC host and format. It works for standard JSON‑RPC + DAS calls.

Issue: the API key is hardcoded in client source (publicly visible in the bundle). Anyone can scrape it and burn your Helius quota.

### 2. Helius Enhanced API URLs — ❌ wrong host
`src/config/solana.ts` lines 14–16:
```
https://api-devnet.helius-rpc.com/v0/transactions/?api-key=...
https://api-devnet.helius-rpc.com/v0/addresses/{addr}/transactions/?api-key=...
```
`api-devnet.helius-rpc.com` does not exist. That's why `useHeliusTransactions` silently returns `[]` — the fetch throws and is caught.

Correct Helius Enhanced API base is `https://api.helius.xyz/v0/...`. Devnet is selected via query param:
```
https://api.helius.xyz/v0/addresses/{addr}/transactions?api-key=KEY
https://api.helius.xyz/v0/transactions?api-key=KEY
```
(Note: Helius Enhanced API has limited devnet coverage — parsed history may be sparse on devnet, but the endpoint at least responds instead of DNS‑failing.)

### 3. Reown AppKit — ⚠️ configured but using a demo/shared projectId
`src/providers/WalletProvider.tsx`:
- `projectId` falls back to a hardcoded value `b56e18d47c72ab683b10814fe9495694` when `VITE_REOWN_PROJECT_ID` is not set. If that's not your own Reown Cloud project, your modal will work but analytics/relay quota belongs to someone else and can be revoked at any time.
- Networks `[solana, solanaTestnet, solanaDevnet]` — correct.
- `SolanaAdapter()` from `@reown/appkit-adapter-solana/react` — correct.
- Metadata + icon — generic GitHub avatar (180229932). Should be your LilyPad logo + your domain.

## Proposed Changes

### A. Fix Helius Enhanced API host (`src/config/solana.ts`)
```ts
const HELIUS_API_BASE = 'https://api.helius.xyz';
export const HELIUS_DEVNET_URL =
  `${HELIUS_API_BASE}/v0/transactions?api-key=${HELIUS_API_KEY}`;
export const HELIUS_ADDRESS_HISTORY_URL = (address: string) =>
  `${HELIUS_API_BASE}/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}`;
```

### B. Move Helius key to env
- Read from `import.meta.env.VITE_HELIUS_API_KEY` with the current value as a dev‑only fallback.
- Document `VITE_HELIUS_API_KEY` (devnet + mainnet) in README.
- For production/server use, prefer routing parsed‑tx calls through the `rpc-proxy` edge function so the key is never shipped to the browser.

### C. Reown hardening (`src/providers/WalletProvider.tsx`)
- Require `VITE_REOWN_PROJECT_ID`; if missing, log a clear warning and disable the modal instead of falling back to an unknown projectId.
- Update `metadata.name`/`description`/`icons` to LilyPad branding and `url` to `https://thelilypad.lovable.app` (kept dynamic in preview is fine).
- Keep `[solana, solanaTestnet, solanaDevnet]` as is.

### D. Verification
- Reload `/auth`, open the Reown modal, connect Phantom on Devnet.
- Confirm `useHeliusTransactions` now returns 200 from `api.helius.xyz` in the network tab (empty array is fine on devnet; the previous DNS error should be gone).
- Confirm RPC health indicator shows `devnet.helius-rpc.com` green.

## Out of scope
No changes to wallet connect flow, RLS, or edge functions beyond the env‑var wiring.
