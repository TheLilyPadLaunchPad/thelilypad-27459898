# Task Roadmap

- [x] Repair Reown wallet sign-in adapter, duplicate prompts, and admin session-lock timing; 10 regression tests pass.
- [ ] Verify real admin and new-user sign-in: blocked by paused Cloud and sandbox browser startup errors.
- [ ] Resume Lovable Cloud: resume refused because workspace Cloud credits are exhausted; requires a Cloud credit top-up.

- [x] Admin-only devnet/testnet: devnet/testnet network options now appear only when an admin is logged in (Reown network list gated by verified admin status; WalletProvider adopts test networks only for admins).
- [x] ApeChain generator: stabilized iPad downloads — iOS-safe blob download helper (delayed revoke, `_blank` target) and low-memory ZIP generation (STORE + streamFiles).
- [x] ApeChain generator: added visible ZIP progress, completion guidance, and retry/download-again controls for large iPad downloads.
