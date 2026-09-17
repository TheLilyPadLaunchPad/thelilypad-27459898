# Wallet cNFT Gallery

## What will be built

- Add a dedicated **My cNFT Gallery** page linked from the account menu.
- Read the connected Solana wallet through the existing on-chain asset service and show every compressed NFT with:
  - artwork
  - NFT name
  - originating pack name from its on-chain metadata
- Include search, pack filtering, refresh, loading, empty, and error states.
- Keep pagination so wallets with more than 50 assets can load the complete gallery.

## Claim behavior

Because no separate reward claim was specified, **Claim** will recover paid pack items that are not fully delivered:

- Match the signed-in user's failed or partial pack purchases to the relevant pack.
- Show **Claim missing items** only for those recoverable purchases.
- Reuse the existing secure, idempotent pack delivery service and saved payment signature.
- Refresh the gallery after a successful claim so the delivered cNFTs appear.
- Already owned cNFTs remain viewable and are never minted twice.

## Technical details

- Extend the wallet NFT model with metadata collection/pack naming where available.
- Add a focused gallery page and route, using the existing wallet, button, image, and pack-delivery patterns.
- Add an account navigation link without replacing the existing broader NFT management page.
- No new database tables or payment flow changes.
