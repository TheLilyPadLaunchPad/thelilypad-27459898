# Fix: shop pack purchases charge SOL but deliver nothing

## The confirmed problem

When someone buys an on-chain sticker/emote pack:

1. Their SOL payment is sent to the platform wallet and confirmed.
2. The app then tries to mint each sticker into their wallet — but the minting
   is signed by the *buyer's* wallet, while the pack's on-chain collection and
   tree were created by the *admin* wallet.
3. Bubblegum only accepts mints signed by the tree owner (or an approved
   delegate) plus the collection's authority. The buyer has neither, so every
   mint is rejected.
4. The buyer is left paid-up with nothing delivered and no refund.

Verified in the current code: `purchasePackOnChain` in `src/hooks/useShopMint.ts`
takes payment first, then loops `mintCompressedCore`, which builds the mint with
`collectionAuthority: umi.identity` (`src/chains/solana/programs.ts`). The tree
is created by the admin with no public/delegate setting.

## The fix

Move minting to a trusted server-side step so the platform (not the buyer)
signs the mints, and never charge before delivery is possible.

### 1. Platform mint authority
- Add a platform Solana signing key as a backend secret (the key never appears
  in the app code).
- The pack collection and tree stay owned by that platform key, so it can
  legitimately mint on behalf of buyers.

### 2. New backend function: `mint-pack-assets`
- Input: pack id, buyer wallet, payment transaction signature.
- Verifies on chain that the payment transaction exists, is confirmed, pays the
  expected amount to the platform treasury, and has not already been redeemed.
- Mints every pack item as a compressed NFT to the buyer's wallet using the
  platform key.
- Records the purchase and minted items, and marks the payment signature used
  so it can't be replayed.
- Returns per-item results.

### 3. Purchase flow changes (`useShopMint.ts`, `StickerPackDetail.tsx`,
`BundlePurchaseModal.tsx`)
- Before charging: check the pack is deployed and every item is mint-ready;
  otherwise block the purchase with a clear message (already partly in place).
- Buyer pays, then the app calls `mint-pack-assets` with the signature.
- If minting partially or fully fails, the purchase is recorded as
  "delivery pending" with the payment signature, and the buyer sees a retry
  option; retrying re-calls the function with the same signature (safe, because
  it is idempotent). No silent "0 minted" outcome.
- Free packs use the same function with no payment signature.

### 4. Admin deploy path
- `deployPackOnChain` creates the collection and tree under the platform mint
  authority instead of the admin's personal wallet, so the backend can mint.
- Existing packs deployed under an admin wallet are flagged in the pack manager
  as "needs redeploy" and cannot be sold until redeployed.

## Technical notes
- Platform key stored as a backend secret; only the edge function reads it.
- Idempotency: unique constraint on the payment signature in `shop_purchases`;
  the function returns already-minted results instead of double minting.
- Payment verification uses the existing Solana RPC proxy and the protocol memo
  already attached to purchase transactions.
- Client keeps no signing responsibility for mints, only for its own payment.
