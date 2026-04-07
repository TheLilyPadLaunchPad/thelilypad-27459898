
# Remove All XRPL/XRP Code from The Lily Pad

## Scope
76 files reference XRPL/XRP. This plan removes all XRPL chain support, wallet connectors, data, and tokens while preserving Solana and Monad functionality.

## Changes

### 1. Delete XRPL-specific files entirely
- `src/chains/xrpl/` (entire directory: BattleService.ts, client.ts, domain.ts, marketplace.ts, nft.ts, types.ts, validate.ts)
- `src/lib/xrpl-wallet.ts`
- `src/hooks/useXRPLPayment.ts`
- Any other XRPL-only hooks/components

### 2. Update chain configuration
- `src/config/chains.ts` — Remove `xrpl` from `SupportedChain`, remove XRPL chain config
- `src/config/featureFlags.ts` — Remove `XRPL_ENABLED` flag
- `src/config/treasury.ts` — Remove XRPL wallet addresses

### 3. Update multi-chain abstractions
- `src/lib/chainUtils.ts` — Remove XRP cases from switch statements
- `src/hooks/useChainCurrency.ts` — Remove `isXRPL` property and XRP references
- `src/hooks/useMonadPayment.ts` / other hooks — Remove any XRP fallback logic

### 4. Update WalletProvider
- `src/providers/WalletProvider.tsx` — Remove XRPL connection logic, wallet state, and chain type

### 5. Update UI components
- Remove XRPL wallet selector options, chain filter tabs, XRP-specific mint logic
- Remove XRPL references from LaunchpadCreate, MintButton, marketplace filters, profile settings
- Clean up any "Easy XRP Generator" or XRPL NFT Generator pages/routes

### 6. Update router
- Remove any `/xrpl-*` or XRPL-specific routes

### 7. Uninstall `xrpl` npm package

## Risk
- Large change touching many files — will verify build compiles after changes
- WalletProvider is flagged as complex; changes will be careful and minimal
