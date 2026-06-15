# Launchpad & Buyback Architect

Deliver two artifacts to `/mnt/documents/` documenting the end-to-end architecture of the Lily Launchpad and the Buyback engine across Solana and Monad:

1. `Launchpad_Buyback_Architecture.md` — written architecture doc
2. `Launchpad_Buyback_Architecture.mmd` — Mermaid diagram

Both surfaced as artifacts in chat. No source code changes.

## Doc outline (`.md`)

1. **Overview** — product framing (Lily Launchpad), supported chains, what the Buyback engine does and why (tokenomics, anti-rug).
2. **System layers**
   - UI: `src/pages/LaunchpadCreate.tsx`, `BuybackProgram.tsx`, wizards
   - Chain abstraction: `src/chains/index.ts` + `solana/` and `monad/` modules
   - Backend: Supabase tables, RLS, edge functions, storage buckets
   - Assets: Arweave via Irys (funded by connected Solana wallet), Supabase `collection-drafts` for staging
3. **Launchpad — Solana flow**
   - Wizard steps (`SOLANA_LAUNCHPAD_CONFIG`)
   - Auth gate → ensureSupabaseSession → RLS-safe `collections` insert
   - Asset upload → Metaplex metadata → Core Collection → Candy Machine v3 → Candy Guards (`solPayment`, dates, `mintLimit`, `botTax`) → optional hidden/reveal
   - Treasury split (85% creator / 15% platform) via `PLATFORM_WALLETS`
   - Protocol memo `TheLilyPad:v1:<action>` on every tx
4. **Launchpad — Monad flow**
   - ERC-721A `LilyPadFactory` deploy, `LilyPadNFTCollection`, `PaymentSplitter` revenue routing via viem
   - Phase/allowlist persistence in Supabase (`collections`, `allowlist_entries`)
5. **Buyback engine**
   - Pool: `buyback_pool`, `buyback_events`, `buyback_program_collections` (no chain filter)
   - Solana: `executeBuyback` → Jupiter V6 quote → versioned swap tx → treasury signer → memo
   - Monad: Uniswap V2/V3 router via `MonadBuyback`
   - Triggers: secondary-sale royalty share, manual admin execution, scheduled
   - Distribution targets: Lily Pad NFT holder rewards, creator token holders
6. **Data model touchpoints** — `collections`, `minted_nfts`, `nft_listings`, `mint_sessions`, `platform_fees`, `buyback_*`, plus the relevant RPCs (`get_launchpad_stats`, `get_top_collections_stats`).
7. **Security model** — RLS rules for `collections`/`buyback_*`, security-definer RPCs, wallet-auth session requirement before insert, server-side moderation, no client-exposed private keys.
8. **Failure & resilience** — upload retries, blockhash retry loop, deploy refund table, error tracking.
9. **Open gaps / future work** — pulled from `Launchpad_Audit_Report.md` and `Launchpad_Blueprint_Gap_Analysis.md` if relevant.

## Diagram outline (`.mmd`)

`graph LR` with subgraphs:

```text
[User Wallet] → [UI Wizards] → [Chain Abstraction]
                                  ├── Solana: Umi → Irys → Core CM → Candy Guards
                                  └── Monad: viem → Factory → ERC-721A → Splitter
[Supabase] ⇄ UI (drafts, collections, allowlist, sessions)
[Edge Functions] → moderation, attestations, solana-pay-confirm
[Secondary sales] → platform_fees → buyback_pool
[Buyback Engine] ├── Jupiter V6 (SOL) → token → holder rewards
                 └── Uniswap (Monad) → token → holder rewards
```

Mermaid will use default theme (no custom colors) to stay legible in light + dark.

## Technical notes

- Read-only exploration only — no edits to `src/`, no migrations, no installs.
- Pull file references with `code--view` on: `src/chains/index.ts`, `src/chains/solana/{buyback,cartCheckout,bundleDeploy}.ts`, `src/chains/monad/{buyback,contracts,shop}.ts`, `src/config/treasury.ts`, `src/pages/{LaunchpadCreate,BuybackProgram}.tsx`, `contracts/BuybackController.sol`, `contracts/LilyPadNFT.sol`, plus `supabase/functions/` index.
- Use `supabase--read_query` only if exact column names for `buyback_*` / `collections` are needed for the doc.
- Emit artifacts with `<presentation-artifact>` tags after writing.

Hand off to build mode to produce the two files.
