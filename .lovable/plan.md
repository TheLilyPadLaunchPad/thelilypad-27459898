# Mainnet Launchpad Deploy Failure — Root Cause & Fix

## What happened to the tester

The Solscan tx is **only the pre-payment** (0.00575 SOL + protocol memo `TheLilyPad:v1:launchpad:deploy_collection`) from the artist's wallet to the platform treasury `2cS7yyypbtxQ4qBdZRYtXDEDTQJZK34h4RPmXxz4sKHk`. No collection / Candy Machine / guard transactions exist on-chain. That confirms the edge function `deploy-metaplex-launchpad` failed before broadcasting, but the fee was already paid → SOL gone, no NFT.

## Root cause

In `supabase/functions/deploy-metaplex-launchpad/index.ts` (phase `treasury`, lines 270–290):

```ts
const devKey = Deno.env.get("DEVNET_TREASURY_PRIVATE_KEY");
const mainKey = Deno.env.get("TREASURY_PRIVATE_KEY");
let effectiveNetwork = network;
if (effectiveNetwork === "mainnet" && !mainKey && devKey) {
  console.warn("[treasury] no mainnet key configured; forcing network=devnet");
  effectiveNetwork = "devnet";
}
```

Project secrets contain `DEVNET_TREASURY_PRIVATE_KEY` but **no `TREASURY_PRIVATE_KEY`**. On a mainnet deploy the function silently flips to devnet, then:

1. Queries `https://api.devnet.solana.com` for the mainnet payment signature.
2. `getTransaction` returns null → `fail("verify-payment", "Pre-payment transaction not found on-chain", 402)`.
3. The fee is non-refundable as written — the artist loses SOL with zero on-chain deploy.

Secondary issues that compound the failure on mainnet even after fixing the key:

- RPC is hardcoded to public `https://api.mainnet-beta.solana.com`, which is rate-limited and routinely 429s combined Core + Candy Machine + Guard + wrap txs. We already use Helius elsewhere.
- The frontend treats any non-2xx as "deploy failed" but never refunds the prepayment.
- The function never logs/persists the failure phase to the collection row, so testers see only a toast.

## Fix

### 1. Edge function (`supabase/functions/deploy-metaplex-launchpad/index.ts`)

- Add `MAINNET_HELIUS_RPC_URL` / `HELIUS_API_KEY` resolution; when present use `https://mainnet.helius-rpc.com/?api-key=...` for both `verify-payment` and Umi.
- Remove the silent devnet fallback. If `network === "mainnet"` and `TREASURY_PRIVATE_KEY` is missing, **fail BEFORE the client sends the prepayment is impossible**, so we add a preflight in the frontend (see #2). Server-side, return `fail("treasury", "Mainnet treasury key not configured — contact support", 503)` immediately — and DO NOT touch network, so client knows to refund.
- On any failure after `verify-payment` succeeded, return a structured `{ ok:false, phase, error, refundable:true, paymentSignature }` so the client can issue a refund.
- Persist `last_deploy_error` (phase + message) to `collections` row when we have one.

### 2. Frontend (`src/pages/LaunchpadCreate.tsx`, `src/lib/launchpad/deployCost.ts`)

- New preflight edge function call `deploy-metaplex-launchpad?preflight=1` (or just a `GET` health) that returns whether the requested network is supported. Run it BEFORE `sendDeployPayment` so we never charge the artist on a misconfigured backend.
- If the deploy call returns `refundable:true`, automatically call a new edge function `refund-deploy-payment` that sends an equivalent SOL transfer back from the platform treasury → creator, with memo `TheLilyPad:v1:launchpad:refund_deploy:cid=…:ref=<origSig>`. Surface the refund signature in the toast.
- Show the failing `phase` and message in the deploy modal (already returned from edge function) so testers can report meaningful errors.

### 3. New edge function `refund-deploy-payment`

- Verifies the original payment tx exists, came from `creatorAddress`, went to treasury, has the protocol memo, and that no refund memo already exists for that signature.
- Sends `lamports` back to creator from the treasury key, attaches the refund memo.
- Idempotent — caches refunded signatures in a new `deploy_refunds` table (sig PK).

### 4. Secret / config

- Document that `TREASURY_PRIVATE_KEY` (mainnet) is required for mainnet launches. Until it's set, the preflight in #2 blocks mainnet deploys with a clear "Mainnet launches temporarily disabled" message — no SOL is ever taken.

## For this specific tester

After deploying #3, manually invoke `refund-deploy-payment` with their signature `33cHBu5jj1brRvXzBFWmh9GpdbsJWQMDZv5657a57fYd6UNSUVgcS4xWXMHj47DMsu9YW5aCJTfxK1G3R1uJS7Mo` to return the 0.00575 SOL. (Or admin-process via psql + a one-off script.)

## Out of scope

- Changing the artist-pays-rent model itself.
- Migrating Candy Machine to a different program.

---

**One thing I need from you before building:** Do you have a mainnet treasury private key ready to add as the `TREASURY_PRIVATE_KEY` secret? If yes, I'll wire up the secret prompt as part of the build. If no, the preflight will simply block mainnet deploys until you provide one (devnet keeps working).
