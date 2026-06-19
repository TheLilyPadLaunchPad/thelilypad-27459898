# Per-Collection Buyback (Solana, Marketplace v1)

Let creators on the Solana launchpad opt their collection into the platform buyback program. They choose a percentage (50–100%) of the collection's net mint revenue that gets routed to the buyback pool when the collection mints out. On sellout, the platform queues a buyback that swaps that SOL into the platform token via Jupiter (existing infrastructure).

Scope: Solana only. Monad/XRPL untouched. Marketplace (secondary sales) buyback hookup is a follow-up — this plan is the primary mint path.

---

## User flow

1. **Creator (launchpad setup):** New "Buyback Contribution" step shows a slider 50–100%. Default off; if enabled, defaults to 50%. Creator sees a preview: "If your 1000 NFTs mint out at 0.5 SOL each, ~X SOL will fund buybacks."
2. **Mint:** No change to mint UX. The contribution % is stored on the collection.
3. **Sellout trigger:** When `collections.minted >= total_supply`, a Cloud function calculates `mint_revenue * contribution_pct`, transfers that SOL from the creator's mint receipts into the buyback pool wallet, and enqueues a `buyback_events` row via the existing `queue_buyback` RPC.
4. **Marketplace tab:** New "Buyback" widget on collection detail page showing contribution %, pool contribution to-date, and last buyback tx. Read-only.

---

## Database changes (single migration the user runs in SQL editor)

Adds two columns to `collections` plus one tracking table. Migration runs via the migration tool so it appears in the approval flow — the user can also copy/paste it into the SQL editor if they prefer.

```sql
-- 1. Collection opt-in fields
ALTER TABLE public.collections
  ADD COLUMN buyback_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN buyback_contribution_pct numeric(5,2)
    CHECK (buyback_contribution_pct IS NULL
           OR (buyback_contribution_pct >= 50 AND buyback_contribution_pct <= 100));

-- 2. Per-collection contribution ledger
CREATE TABLE public.collection_buyback_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.buyback_programs(id),
  event_id uuid REFERENCES public.buyback_events(id),
  chain text NOT NULL DEFAULT 'solana',
  mint_revenue_sol numeric NOT NULL,
  contribution_pct numeric(5,2) NOT NULL,
  contribution_sol numeric NOT NULL,
  tx_signature text,
  status text NOT NULL DEFAULT 'pending',   -- pending | transferred | queued | failed
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.collection_buyback_contributions TO anon, authenticated;
GRANT ALL ON public.collection_buyback_contributions TO service_role;

ALTER TABLE public.collection_buyback_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON public.collection_buyback_contributions
  FOR SELECT USING (true);

CREATE POLICY "Service role write" ON public.collection_buyback_contributions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER set_contribution_updated_at
  BEFORE UPDATE ON public.collection_buyback_contributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

---

## Frontend changes

- **`src/pages/Launchpad.tsx` (or the Solana setup wizard step):** add a "Buyback Contribution" card — toggle + slider (50–100, step 5). Persist to `collections.buyback_enabled` / `buyback_contribution_pct`.
- **`src/components/launchpad/BuybackContributionStep.tsx`** (new): slider + preview math.
- **`src/pages/CollectionDetail.tsx`:** add a small "Buyback Program" panel reading from `collection_buyback_contributions` for that collection.
- **`src/hooks/useCollectionBuyback.ts`** (new): query the contribution row + status.

---

## Backend changes

- **New edge function `collection-sellout-buyback`** (`supabase/functions/collection-sellout-buyback/index.ts`): triggered when `collections.minted` reaches `total_supply`. Service-role:
  1. Reads `buyback_enabled`, `buyback_contribution_pct`, totals mint revenue from `mint_transactions`/`minted_nfts`.
  2. Inserts a `collection_buyback_contributions` row (`pending`).
  3. Calls existing `queue_buyback` RPC with the active Solana `buyback_programs.id` and `contribution_sol`.
  4. Updates the row to `queued` with the event id; existing scheduler picks up execution and swap via Jupiter (`src/chains/solana/buyback.ts` already implemented).
- **Trigger source:** a Postgres `AFTER UPDATE` trigger on `collections` that fires `pg_net.http_post` to the edge function when `minted` crosses `total_supply` and `buyback_enabled = true`. Included in the migration.
- **Treasury transfer:** for v1, contribution is logged and queued — the actual SOL transfer from the mint-collecting wallet to the buyback pool is handled by the same service-role function using the existing `TREASURY_PRIVATE_KEY` secret and protocol memo `TheLilyPad:v1:buyback-contribution`.

---

## Out of scope (follow-ups)

- Marketplace secondary-sale buyback contributions (separate plan).
- Monad / XRPL chains.
- Per-creator dashboards beyond the read-only collection panel.
- Refunds / partial sellouts.

---

## Technical notes

- Reuses: `buyback_programs`, `buyback_events`, `queue_buyback`, `claim_next_buyback`, `complete_buyback_event`, `src/chains/solana/buyback.ts`, `buyback-trigger` edge function.
- A Solana `buyback_programs` row with the platform token mint must exist (one-time seed `INSERT` if missing — handled by the migration).
- All amounts in SOL (numeric); BigInt lamports only inside the swap call (existing helper).
- Memo on the contribution SOL transfer: `TheLilyPad:v1:buyback-contribution` (per project convention).

After you approve, I'll run the migration through the approval flow — you'll see the exact SQL again and can choose to apply it via the migration tool or paste it into the SQL editor yourself.
