# Wallet sign-in retry review

**Rule:** Cancelling or failing sign-in must leave Connect usable everywhere, without requiring the user to disconnect their wallet. A wallet must not be treated as signed in until authentication succeeds.

## Entry points checked in current source

| Place | Current behavior | Result |
| --- | --- | --- |
| Welcome/sign-in (`Auth.tsx`) | Opens `ChainConnectModal`; Solana calls the shared `connect` action. | Covered by the shared fix. |
| Desktop and mobile navigation (`Navbar.tsx`, `ConnectWallet.tsx`) | Opens the same chain-selection modal. | Covered by the shared fix. |
| Wallet Gallery (`WalletGallery.tsx`) | Uses `ConnectWallet`. | Covered by the shared fix. |
| Trading stats (`PersonalVolumeStats.tsx`) | Calls shared `connect()`. | Covered by the shared fix. |
| Tip dialog (`TipModal.tsx`) | Calls shared `connect()` when signed out. | Covered by the shared fix; no tipping/payment records changed. |
| Shop bundle purchase (`BundlePurchaseModal.tsx`) | Calls shared `connect()` when signed out. | Covered by the shared fix; no settled purchases changed. |
| Contract deployment dialog (`ContractDeployModal.tsx`) | Calls shared `connect()` before deployment. | Covered by the shared fix. |
| Collection connect and mint (`useCollectionDetail.ts`) | Both entry actions call shared `connect`. | Covered by the shared fix. |
| Collection creation (`LaunchpadCreate.tsx`) | Explicitly calls `ensureSupabaseSession` if authentication is missing; a failed attempt returns without deploying. | Already retryable on a later deploy action; no change needed. |
| Alternate WalletConnect button (`WalletConnectButton.tsx`) | Previously opened AppKit directly, bypassing shared sign-in retry. | Changed to shared `connect`, with a regression check. |
| Legacy `connectWithOAuth` action | Previously opened AppKit directly. | Changed to shared `connect`; current wallet-only settings remain unchanged. |
| Monad/Robinhood/ApeChain connections (`WalletProvider.tsx`) | Use EVM-specific network and connection paths; no Solana Web3 sign-in. | Not affected; EVM preservation regression passes. |
| XRPL/Joey connections (`WalletProvider.tsx`) | Each connect invocation executes its own provider connection attempt. | Not affected; unchanged. |
| Email/password admin entry (`AdminLogin.tsx`) | Always clears its busy flag after failure; form can submit again. | Already retryable; settings/permissions unchanged. |
| Email/OAuth callback (`AuthCallback.tsx`) | Failure offers return to sign-in. | Already retryable; unchanged. |

## Background and downstream checks

- `WalletProvider.tsx`: confirmed that a failed Solana sign-in left Reown connected with no changed dependency to trigger another sign-in. Connect now increments an explicit sign-in attempt, rerunning the existing authenticated sync. The original cancellation guards and authentication-before-profile ordering remain intact.
- `solanaWalletAuth.ts` and `supabaseWeb3.ts`: failed operations release the single-flight guard in `finally`; retries reuse the shared signing adapter. No change needed.
- `AuthProvider.tsx`, `useUserProfile.ts`, and `useIsAdmin.ts`: profile resolution follows connected/authenticated state; admin auth callbacks defer their auth rechecks. No retry bypass introduced and no role/permission changes.
- `ProtectedRoute.tsx` and `App.tsx`: disconnected states return to the entry screen after bounded reconnect waiting; retrying can transition through connecting to authenticated state. No change needed.
- Searched application edge functions for Solana Web3 sign-in/message-signing initiation: no wallet signature prompt is initiated there. Sign-in is handled by the existing Cloud Auth SDK, not an app database function or scheduled job. No migrations, server functions, permissions, settings, or settled records were changed.

## Verification

- Eight provider/alternate-button integration checks cover rejection, invalid signature, repeated failure, concurrent retry deduplication, legacy connect, disconnected wallet connection, unchanged EVM handling, and delayed Solana provider readiness.
- Seven existing signing/authentication tests and three network registration tests pass alongside the isolated integration checks.
- Running the new checks against the pre-fix provider reproduces five retry failures; all eight pass against the repaired provider.
- The full project suite passes (70 top-level tests, including the isolated eight-check wallet suite); the latest preview build reports `build OK`.
- Cloud auth/database health checks are normal.
- Full live-preview wallet testing remains unavailable: the sandbox page errors before showing any Connect controls. No real wallet signature approval was available. Automated checks simulate wallet/Cloud boundaries and do not claim a real admin/new-user login.