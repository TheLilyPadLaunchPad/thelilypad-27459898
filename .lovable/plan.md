# Delete Collection — Audit + Full Wipe

## 1. Audit the "Delete Collection" button
- Find the existing delete UI/handler in the launchpad/collection pages (likely in `src/components/launchpad/CollectionEditForm.tsx`, `src/pages/CollectionDetail.tsx`, or a `CollectionCard`/management view).
- Confirm whether it:
  - Soft-deletes (sets `collections.deleted_at`) — current schema supports this, and several RPCs filter by `deleted_at IS NULL`.
  - Hard-deletes the row.
  - Cleans up dependent rows (minted_nfts, listings, buyback rows, allowlist, etc.).
- Report findings; if the button is broken or only soft-deletes when you expect a hard delete, fix it so a creator/admin can fully remove their own collection (admin-only by default unless you say otherwise).

## 2. Hard-delete every collection — Test (dev) database
Run a single transaction (via me) that removes all collections and their dependent rows in FK-safe order:

```text
onchain_nft_auction_bids → onchain_nft_auctions
onchain_nft_listings
nft_offers, nft_transactions, nft_listings, nft_mints, minted_nfts
mint_sessions, mint_transactions, allowlist_entries
collection_audio_metadata, collection_buyback_contributions
buyback_program_collections (collection links only)
card_stack_items referencing collections
featured_collections
collections
```

I will first run a read-only count on each table so you can see the blast radius, then execute the deletes in Test.

## 3. Hard-delete every collection — Live (production) database
I can't write to Live from here. I'll output the exact same transactional SQL block for you to paste into **Cloud View → Run SQL** with **Live** selected. Recommended order:
1. Run the count query first in Live to confirm scope.
2. Run the delete block.
3. Reply "done" and I'll verify with a read-only Live query.

## Warnings
- **Irreversible.** No soft-delete, no backup taken by this plan. If you want a CSV of `collections` first, say so and I'll export it before deleting.
- On-chain Candy Machines / mints are **not** touched — only off-chain DB rows are removed. Any already-minted NFTs continue to exist on Solana.
- Active buyback programs tied to these collections will be orphaned; the `buyback_program_collections` links get removed but the program rows themselves stay (tell me if you want those wiped too).

## Confirm before I proceed
- OK to delete with **no CSV backup**?
- Should I also disable/delete the related **buyback_programs** rows, or leave them?
- Should the Delete button (step 1) be **admin-only** or **creator-can-delete-own**?
