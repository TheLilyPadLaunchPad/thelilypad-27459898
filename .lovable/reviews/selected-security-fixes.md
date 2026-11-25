# Selected security fixes

## Rules in the user's terms

- Challenge badges reflect trusted activity, not activity someone types into a request.
- A challenge begins only when the invited person accepts it.
- Raffle chances require real payment when priced and respect each person's ticket allowance.
- Pack contents go only to the account that claimed or purchased that exact pack, in its linked delivery wallet.
- Streamer verification comes only from administrators or trusted services.
- Private-profile activity and supporter totals stay private from visitors and unrelated users.
- Access to the app's paid ownership lookup provider requires sign-in.

## Places checked by reading code

| Rule | Screens, flows, jobs, and queries inspected | Result |
| --- | --- | --- |
| Trusted activity | TradingStreak, StreakLeaderboard, StreakHistoryGraph, PersonalVolumeStats, VolumeLeaderboard, VolumeSimulator, RewardsAllocationManager; useVolumeTracking mint/sale/listing calls; track-volume write/read branches; resolve-streak-challenges ongoing and completed branches; volume_tracking policies | Direct client insertion removed. New rows receive server provenance and timestamps. Both badge-resolution paths and streak displays use trusted rows. Historical volume/reward records remain unchanged. Existing track-volume writes already require the service key; client tracking calls cannot bypass that. |
| Accepted challenges | StreakChallenge creation, accept/decline, rematch and history; resolver ongoing/completed branches; streak_challenges insert/update policies | Trigger permits pending creation and only the invited user's response; participants and scores cannot be rewritten. Dates are assigned server-side and resolver requires accepted_at. No active challenges existed at migration time. Closed records unchanged. |
| Valid raffle tickets | Raffles entry flow and chain choices; RaffleEntryModal Solana/Monad/free branches; RaffleManager entry list and manual draw action; verify-solana-tx duplicate checks; draw-raffle-winners scheduled/admin paths; lily_raffle_entries policies and new verified recording function | Entries are recorded through a signed-in payment verifier. Sender, recipient, amount, confirmation, dates, reuse, and cumulative allowance checked; insert trigger locks the raffle. Both draw paths use verified entries. Free entries remain available across chains. Existing winners untouched; no undrawn raffles existed at migration time. |
| Purchased pack access | StickerPackDetail free, paid, and retry branches; BundlePurchaseModal purchase and per-pack delivery; useShopMint deploy/mint/retry; record-shop-purchase item/bundle paths; mint-pack-assets deploy/mint/receipt/result branches; shop_purchases and protected contents policies | Recorded entitlement precedes protected reads and minting. Free claims and bundles retain access via receipts. Missing Solana prices cannot make legacy-priced packs free. Exact account/pack/original delivery-wallet checked. Completed delivery returns its existing results without writes. |
| Trusted streamer verification | Streamers filters/badges, Streams public profile join, Following verification sorting/badges, StreamerProfile badge, PublicProfile badge, ArtistProfile lookup; AdminDashboard verification action; admin-users authorization and verify action; streamer_profiles policies | Protective insert/update trigger covers all streamer writes; admin-users already verifies the caller's server role. Public display code consumes protected stored verification. Other profile roles/settings left untouched. |
| Private activity/supporters | PublicProfile, StreamerProfile, ArtistProfile, DonorProfile shared displays; ActivityFeed and TopSupportersCard including pagination/all-supporters sheet; useProfileActivity initial/filter/pagination/realtime queries; useTopSupporters initial/realtime; get_profile_activity_feed and get_top_supporters live definitions | Both privileged queries enforce target profile visibility, owner/admin exceptions. Public behavior remains available. Supporter fetch failures clear results rather than retaining stale data. No tip/payment records changed. |
| Authenticated lookup provider | WalletGallery, MyNFTs, PublicProfile inventory callers; useWalletNFTs initial/refresh/load-more; chains/solana/helius history/parse helpers; helius-proxy ownership/history/parse routes | Authentication occurs before all paid-provider branches. Gallery sends the real access token and does not bypass a rejected session with a fallback. Existing history/parse helpers already require a session. Unsupported-chain gallery behavior unchanged. |

## Verification

- 16 security tests: isolated PostgreSQL engine applies the actual migrations and baseline query fixtures; concrete denial and allowed-owner/admin cases checked. No live fixture rows or settled records changed.
- 13 existing wallet/auth/gallery checks also pass (29 top-level tests total).
- Full project suite passes: 97 tests across 18 files, including owner/admin privacy and administrator verification checks.
- Handler tests execute actual edge source with controlled provider boundaries: no-purchase pack denial before protected reads, legacy-price payment requirement, settled delivery without writes, and signed-in/invalid-session lookup behavior.
- Live requests using a temporary test user (not the owner's admin account) confirmed authentication, ownership lookup returned 200, and missing-session ownership/history/parse/raffle entry requests returned 401.
- Applied migrations and deployed helius-proxy, resolve-streak-challenges, draw-raffle-winners, mint-pack-assets, record-shop-purchase, and record-raffle-entry.
- Preview validation reports build OK. The sandbox still renders a blank page from its pre-existing startup issue, preventing actual wallet-approved UI purchase/entry flows. No deployable pack was available for a real on-chain delivery test. These remain verification limitations, not additional selected findings.

## Scope

Only the eight selected security findings were changed or managed. No other findings were fixed or ignored, and no existing payouts, prizes, refunds, completed challenges, or delivered results were rewritten.
All eight selected findings were marked fixed through the security management tool after validation.