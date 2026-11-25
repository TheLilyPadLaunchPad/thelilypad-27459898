# Task Roadmap

- [x] Add profile settings for display name and avatar using partial updates to the existing authenticated profile; 13 checks pass and a temporary signed-in account verified avatar upload, saved readback, and preservation of all other returned fields.
- [ ] Verify profile settings saving through the browser: blocked by inherited preview startup crashes (`slice`/`on` of undefined); direct authenticated persistence checks passed, but page rendering could not be verified.

- [ ] Reown-only wallet connections and email signup/login, preserving existing profiles: separate Cloud account login rejected; account sign-in remains blocked pending a supported Reown-to-Cloud account connection.

- [x] Add admin-only whitelist wallet CSV under Users with saved registration statuses, secure paginated access, and prepared-file download; seven tests pass including isolated database authorization checks.
- [ ] Verify the admin CSV download in-browser: blocked by existing blank preview startup errors and unavailable requesting-user admin session.

- [x] Add WL attempt and confirmed-registration events beside existing wallet connection analytics; six catalog schemas validated and success deduplicated.
- [ ] Confirm WL events arrive from a published real-wallet claim: requires publishing and a visitor's successful wallet sign-in; local checks cannot send analytics.

- [x] Require authenticated wallet registration before showing or downloading a WL pass; verify saved wallet/account identity and include the wallet address on the pass.
- [ ] Verify real-wallet WL onboarding: blocked by unavailable wallet approval and the existing blank preview startup issue.

- [x] Reopen referrals and keep generators available; lock all other visitor pages while retaining admin access. Saved the limited-access setting; six access-policy tests pass.
- [ ] Verify referral onboarding and generator navigation in the browser: blocked by the existing blank preview startup errors; updated page exceptions must be published together with the enabled lock.

- [x] Fix only the eight selected security findings: verified activity, accepted challenges, paid raffle entries, purchased pack access, streamer verification, private activity/supporters, and authenticated owner lookups.
- [x] Validate and update the eight selected finding statuses; 97 project tests pass, live access checks passed as a temporary test user, all other findings unchanged.

- [x] Add privacy-safe wallet connection, signature request, sign-in success, and authentication failure events; schemas and retry regressions validated.
- [ ] Verify live wallet analytics ingestion: blocked by existing blank sandbox startup and unavailable real wallet approval; requires a preview/published connect, cancel, retry, and successful sign-in.
- [x] Restore Connect retry after cancelled or failed Solana sign-in; shared and alternate Connect paths covered by regression checks.
- [x] Repair Reown wallet sign-in adapter, duplicate prompts, and admin session-lock timing; 10 regression tests pass.
- [ ] Verify real admin and new-user sign-in and cancellation/retry: Cloud is healthy; blocked by sandbox startup errors and unavailable real wallet approval.
- [x] Lovable Cloud resumed and its auth/database services are responding normally.

- [x] Admin-only devnet/testnet: devnet/testnet network options now appear only when an admin is logged in (Reown network list gated by verified admin status; WalletProvider adopts test networks only for admins).
- [x] ApeChain generator: stabilized iPad downloads — iOS-safe blob download helper (delayed revoke, `_blank` target) and low-memory ZIP generation (STORE + streamFiles).
- [x] ApeChain generator: added visible ZIP progress, completion guidance, and retry/download-again controls for large iPad downloads.
