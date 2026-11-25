# Wallet authentication analytics

Implemented with the user-app-events-instrumentation skill. Events go directly to the injected Lovable event pipeline, not a database table or third-party SDK.

## Events

- `project.wallet_connected`: an actual Reown transport account connects/restores, or an existing XRPL/injected connector succeeds. Reown sync reruns and signing retries do not recount the transport. Opening Connect is not a connection.
- `project.wallet_signature_requested`: an actual Solana authentication message-signing invocation, not a balance lookup, session revalidation, transaction signature, or button click.
- `project.wallet_sign_in_succeeded`: Solana Web3 Auth returned both a session and user. Revalidating an existing session is not another sign-in.
- `project.wallet_authentication_failed`: a failed Solana authentication operation, with a bounded stage/reason instead of raw error text. Includes cancellation, invalid signatures, network errors, unavailable wallet adapters, and missing sessions.

## Diagnosis and privacy

- `entry_point` is only `admin` or `app`; an admin-page attempt does **not** prove the caller is an admin.
- Successful sign-ins include `user_role`, resolved from the existing authenticated server role table. A failed/unavailable lookup is `unknown`, never assumed to be regular. Lookup is detached from sign-in and bounded to three seconds; analytics cannot deny login or grant permissions.
- Successful sign-ins include `account_status`: `new_account` is an Auth account created less than 24 hours ago, `existing_account` is older, and missing/future creation dates are `unknown`. This does not assert that it is the visitor's first-ever attempt or count unique users.
- Failures before authentication cannot reliably identify an actual admin or a new account. Compare admin entry-point failures directly, or correlate same-visit failures with a later successful sign-in's verified cohort; attempts that never succeed stay unknown.
- `retry` distinguishes retries following failed authentication for the same wallet in the current bridge lifetime. Single-flight callers share one operation/event sequence.
- Properties contain no wallet addresses, user IDs, signature bytes/messages, tokens, emails, full URLs, or free-form errors. Collector-supplied session IDs can correlate same-visit events without adding identifiers to properties.
- This request adds tracking only, not a new dashboard or changes to sign-in behavior. EVM transport connections are not mislabeled as authenticated Cloud sign-ins; XRPL anonymous session bootstrap is not counted as verified sign-in.

## Verification and live capture

Run the existing wallet/auth regression tests plus the analytics tests; run event schema validation before completion.

The regression suite passes, including the real WalletProvider's cancelled-signature/retry emission sequence. The current localhost UI still has the pre-existing startup errors (`slice` and `on` on undefined), so no Connect controls render; a fresh browser check confirms live UI and collector-ingestion verification remain blocked, not completed.

Localhost does not load the injected analytics runtime: tests use a recorder at the same global boundary to verify event counts, schemas, and privacy. This verifies emission logic, not live ingestion. To verify collection, use the preview or published app to connect, cancel a signature, retry, and finish signing; accept any consent banner and turn off Global Privacy Control, then query the four registered event names. Published event registration requires the next publication.

## North-star coverage

The project metric is **NFTs minted into collectors' wallets each week**. None of these four wallet authentication events measure a completed collector mint; adding that event needs a separate request.