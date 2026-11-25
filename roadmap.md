# Task Roadmap

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
