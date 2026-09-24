# Transaction states, Monad holder benefits, and collection Q&A assistant

## 1. Clear transaction states (launches, mints, marketplace)
- New shared transaction tracker: every on-chain action moves through **Pending (waiting for wallet) → Submitted (waiting for network) → Confirmed** or **Failed** (with a plain reason and a "Try again" button).
- One reusable status card/toast shows the state, a link to the block explorer (Solscan, Monad explorer, XRPL explorer), and stays visible until dismissed.
- Wired into: collection launch/deploy, Mint button and mint card, Buy NFT, list/delist, bids, and sticker pack purchases.
- Wallet rejections show "Cancelled in wallet" instead of a failure.

## 2. Monad holder-only benefits
- Ownership is checked on the server, not in the browser: a backend function reads the Monad chain directly (ERC-721 `balanceOf`) for the connected wallet, after the wallet signs a short one-time message proving it owns the address.
- Result is cached briefly; holder status re-checks when the wallet or network changes.
- A `HolderGate` wrapper unlocks holder content (perks, gated downloads, discounts) and shows "Hold an NFT from this collection to unlock" otherwise.
- Admins pick which collections count per benefit.

## 3. "Ask about this collection" assistant
- A chat panel on Monad collection pages and marketplace listings.
- The backend gathers the facts (collection details, supply, mint price/status, current listings, floor, traits) and sends them with the question to the AI; answers stream in and stick to that data — it says so when it doesn't know.
- Includes suggested questions and a clear error message if AI credits run out or the service is busy.

## Blocker
Parts 2 and 3 need backend functions, and your hosted database is still paused. Part 1 can be built now; 2 and 3 will be built but can't go live or be tested until the backend is resumed.

## Technical details
- `src/hooks/useTxStatus.ts` + `src/components/tx/TxStatusCard.tsx`; states `idle|awaiting_signature|submitted|confirmed|failed|cancelled`; explorer URL helper per chain in `src/lib/chainUtils.ts`.
- Edge function `verify-monad-holder`: verifies EIP-191 signature (viem `verifyMessage`) over nonce + address, reads `balanceOf` via Monad RPC, returns `{ holder, balance }`; table `holder_benefits(collection_id, title, content, ...)` with RLS so gated content is only returned by the function.
- Edge function `collection-assistant`: loads collection + listings server-side, streams via Lovable AI Gateway `/v1/responses`, model `openai/gpt-6-astra`, reasoning low, `store: false`; UI `CollectionAssistant.tsx` using streamed text; surfaces 402/429 messages.
- Also re-attempt the 3 open security fixes (governance_config, card_stack_items, shop-items storage) once the database is running.
