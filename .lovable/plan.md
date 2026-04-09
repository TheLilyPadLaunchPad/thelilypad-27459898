

# Audit & Fix: Remove All Remaining XRPL/XRP References

The previous cleanup missed ~29 files that still reference XRPL/XRP. The build fails because Vite tries to bundle the deleted `xrpl` package. Here is the full list of surgical fixes needed.

## Critical Build Blocker

**`vite.config.ts`** — Remove the `"vendor-xrpl": ["xrpl"]` chunk from `manualChunks`, and remove "XRPL" from the PWA description string.

## TypeScript Errors (8 files)

| File | Fix |
|------|-----|
| `src/components/BuyNFTModal.tsx` | Remove the `else if (chainId === 'xrpl')` branch (lines 85-93) and the `xrplTransfer` reference |
| `src/components/TransactionHistory.tsx` | Remove `xrpl` from chainSymbol ternary (line 35) and explorerUrl (line 105) |
| `src/components/collection-detail/CollectionMintCard.tsx` | Remove `fundXRPLTestnetWallet` usage, `isXRPL` variable, and the testnet XRP faucet button block |
| `src/components/collection-detail/utils.ts` | Remove `xrpl` case from chain detection (line 59) |
| `src/components/launchpad/ChainGuard.tsx` | Remove `if (chainType === "xrpl") return "xrpl"` line |
| `src/components/launchpad/MintButton.tsx` | Remove `xrpl` from `isMintingSupported` and the `chain === 'xrpl'` early return |
| `src/components/raffles/RaffleEntryModal.tsx` | Remove `chain === 'xrpl'` payment branch and explorer URL case |
| `src/components/shop/BundlePurchaseModal.tsx` | Fix `'mainnet-beta'` comparison — use `'mainnet'` instead |

## Additional Cleanup (non-error but stale references)

| File | Fix |
|------|-----|
| `src/components/LiveBuybackStats.tsx` | Remove `'xrpl'` from chain prop type and switch case |
| `src/components/PortfolioValueChart.tsx` | Remove XRP from comment |
| `src/hooks/useCreatorCurrency.ts` | Remove `"XRP"` from `CurrencyType` and `CURRENCY_META` |
| `src/hooks/useDraftCollection.ts` | Remove `xrplTaxon` and `xrplTransferFee` fields |
| `src/pages/Launchpad.tsx` | Remove `easy-xrp` and `xrpl-generator` route handlers, update subtitle text |
| `src/pages/BuybackProgram.tsx` | Remove any XRPL references |
| `src/integrations/irys/client.ts` | Remove "XRPL" from comment |

## Summary

- **29 files** still have XRPL references
- **8 files** cause TypeScript build errors
- **1 file** (`vite.config.ts`) causes the fatal "Could not resolve entry module xrpl" error
- All fixes are deletions of dead code branches — no new logic needed

