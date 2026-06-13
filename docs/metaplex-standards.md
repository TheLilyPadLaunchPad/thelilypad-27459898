# Metaplex / Chain Standards — The Lily Pad

Single source of truth for which NFT standard runs on which chain.

| Chain   | NFT Standard            | Marketplace                | Status      |
| ------- | ----------------------- | -------------------------- | ----------- |
| Solana  | **Metaplex Core only**  | `escrow_program` (Anchor)  | Source-ready, deploy pending |
| Monad   | ERC-721A                | `LilyPadMarketplace.sol`   | Live        |

## Solana: Metaplex Core only

- Launchpad: `supabase/functions/deploy-metaplex-launchpad` creates a Core
  collection + Candy Machine + Candy Guard in one combined transaction.
- Plugins: `Royalties`, `BubblegumV2`, `VerifiedCreators` — applied via
  `buildCollectionPlugins` and validated in the `preflight-authority` phase.
- Token Metadata (`mpl-token-metadata`) is **NOT** an active path. Do not
  add new code that imports it for NFTs. (Fungible tokens via Token
  Metadata is allowed and unrelated.)
- Every Solana transaction issued by the platform must carry the SPL memo
  `TheLilyPad:v1:<action>` so the off-chain indexer can attribute activity.

### Transaction simulation (compliance: required)

Edge functions that spend creator SOL **must** call `simulateUmiBuilder`
before `sendAndConfirm`. On simulation failure return:

```json
{ "ok": false, "phase": "simulate", "error": "…", "logs": [...],
  "refundable": true, "paymentSignature": "…" }
```

so `refund-deploy-payment` reverses the pre-payment automatically.

### Marketplace: `escrow_program`

Source: `anchor/escrow_program/`. The Rust program is hardened
(PDA-seeded escrow, fee split, cancel ix, memo, events) but not yet
deployed.

**Operator steps to deploy:**

1. `cd anchor/escrow_program && solana-keygen new -o target/deploy/escrow_program-keypair.json --no-bip39-passphrase`
2. Note the new program ID (`solana address -k target/deploy/escrow_program-keypair.json`) and paste it into `declare_id!(...)` in `src/lib.rs`.
3. `anchor build` then `anchor deploy --provider.cluster devnet` (mainnet after testing).
4. Add the deployed ID as edge-function secret `ESCROW_PROGRAM_ID`.
5. Copy the regenerated IDL from `target/idl/escrow_program.json` into `anchor/escrow_program/idl/` so the client can import it.

Until step 5, `src/hooks/useEscrowProgram.ts` stays in stub mode — see
[`Anchor Program Stub`](mem://infrastructure/solana-anchor-integration-status).

## Monad: ERC-721A

Unchanged. Contracts in `contracts/` (BattleContract, BuybackController,
LilyPadGovernor, LilyPadMarketplace, LilyPadNFT, LilyPadTimelock,
LilyPadToken). The legacy `TheLilyPad*.sol` and `SimpleLilyPadNFT.sol`
files have been removed — they predated the Core migration and were never
deployed.

## Forbidden imports (Solana side)

The following must not appear in new code paths:

- `@metaplex-foundation/mpl-token-metadata` for NFT creation
- `@/config/theLilyPad`
- `@/hooks/useVerifyTheLilyPad`

The CI sanity check in `scripts/check-no-legacy.ts` greps for these
patterns.
