# Plan: Create New XRPL Wallet on Auth Page

Generate a brand-new non-custodial XRPL account directly in the browser for users without Crossmark/GemWallet. Uses `xrpl.js` `Wallet.generate()` — no admin RPC, no server seed exposure.

## Scope

1. New "Create New Wallet" CTA in the XRPL tab on `/auth`, below the existing connect buttons.
2. Two-step modal:
   - **Step 1 — Backup**: show address + master seed once, with copy buttons, "Download backup .txt", and a "I saved my backup" checkbox required to proceed.
   - **Step 2 — Optional encrypted cache**: user can set a password to store the seed encrypted in `localStorage` for quick re-sign-in on this device, OR skip (true zero-storage).
3. **Funding**:
   - Testnet → call the official XRPL testnet faucet (`https://faucet.altnet.rippletest.net/accounts`) and show the funded balance.
   - Mainnet → show the 10 XRP reserve notice + "Send XRP to this address from your exchange" instructions.
4. Sign the user in via the existing non-custodial XRPL flow (extend `connectXRPLWallet` with a `'generated'` provider).
5. New "Unlock saved wallet" button appears when an encrypted seed is detected in localStorage — prompts for password, decrypts, signs in.

## Files

```text
src/lib/xrplGeneratedWallet.ts      NEW  generate / encrypt / decrypt / faucet helpers
src/lib/xrplWalletConnect.ts        EDIT add 'generated' provider variant
src/providers/WalletProvider.tsx    EDIT pass-through (generated reuses connectXRPLNonCustodial)
src/components/auth/CreateXRPLWalletDialog.tsx  NEW  two-step modal
src/components/auth/UnlockXRPLWalletDialog.tsx  NEW  password unlock modal
src/pages/Auth.tsx                  EDIT add "Create New Wallet" + "Unlock saved" buttons in XRPL tab
```

## Technical Details

**Generation** — pure client-side, no network:
```ts
import { Wallet } from 'xrpl';
const w = Wallet.generate();            // { address, seed, publicKey, privateKey }
```
Equivalent to `wallet_propose` but runs locally — never exposes the seed off-device.

**Encryption (optional cache)** — Web Crypto AES-GCM with PBKDF2-derived key:
- 250k PBKDF2-SHA256 iterations, 16-byte random salt, 12-byte random IV.
- Stored as JSON `{ v: 1, salt, iv, ct }` under `xrpl:enc:<address>`.
- Index of saved addresses kept under `xrpl:saved`.

**Faucet (testnet only)**:
```ts
POST https://faucet.altnet.rippletest.net/accounts
body: { destination: address }
```
Show balance after, then proceed. Faucet failures are non-blocking (user can retry).

**Sign-in path** — after generation/unlock, call `connectXRPLNonCustodial('generated', address, network)`. The provider stores the address + network in `WalletState` exactly like Crossmark/Gem; subsequent signing uses the in-memory `Wallet` instance held by a small `xrplSigner` singleton (kept only in memory, cleared on disconnect). `signXRPLTransaction` gains a branch for `walletType === 'generated'` that signs locally with `wallet.sign(tx)` and submits via the existing XRPL client.

**Security guardrails**:
- Seed string never logged, never sent to console, never included in toast text.
- Backup download is a `Blob` URL revoked immediately after click.
- "I saved my backup" checkbox required before Continue enables.
- Password requirement when caching: min 10 chars, zxcvbn-style hint optional (skip dependency, just min-length).
- Clear in-memory `Wallet` on `disconnect()` and on tab close (`beforeunload`).
- No `dangerouslySetInnerHTML`; all input via controlled `<Input>` with maxLength.

**UI**:
- Reuses existing shadcn `Dialog`, `Input`, `Button`, `Checkbox` primitives.
- Matches the XRPL tab's black/white branding.
- Strong amber warning banner on Step 1: "This is the only time you will see your seed. Lose it = lose access. No password reset."

## Out of scope (will note for follow-up)
- XRPL → Supabase session (SIWX edge function) — still deferred.
- Hardware wallet (Ledger XRP app) signing — separate plan.
- Multi-sig / regular key setup.
