# The Lily Pad Launchpad
## Production Blueprint vs. Current Implementation — Gap Analysis

**Date:** April 22, 2026  
**Blueprint Source:** Lily Pad Launchpad – Production Architecture Diagram.pdf (9 pages)

---

## Quick Status Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Fully implemented |
| ⚠️ | Partially implemented |
| ❌ | Not yet implemented (gap) |

---

## 1. System Architecture Overview

### Blueprint Specifies
```
Frontend UI → API Gateway → Services (Auth / Launchpad / Checkout / Asset / Notification)
→ Blockchain Layer → Indexer + Workers → Database Layer (Postgres + Redis)
```

### Current Architecture
```
Frontend UI (React/Vite) → Direct Supabase calls + Direct Solana RPC calls
```

| Component | Blueprint | Current | Status |
|-----------|-----------|---------|--------|
| Frontend (React) | ✅ Required | ✅ React/Vite/TailwindCSS | ✅ |
| API Gateway | Central routing, rate limiting, auth | Client-side only — all RPC calls in browser | ❌ |
| Auth Service | Centralized | Supabase Auth (client-side) | ⚠️ |
| Launchpad Service | Server-side | Client-side hooks (`useSolanaLaunch.ts`) | ⚠️ |
| Checkout Service | Server-side with sessions | Client-side (`cartCheckout.ts`) | ⚠️ |
| Asset Service | Server-side pipeline | Client-side Irys/Turbo SDK | ⚠️ |
| Notification Service | WebSockets | Supabase Realtime (for social features) | ⚠️ |
| Blockchain Layer | RPC abstraction | Direct Umi + RPC calls | ⚠️ |
| Indexer + Workers | BullMQ/Redis queue | In-process polling only | ❌ |
| Database Layer | Postgres + Redis | Supabase (Postgres only) | ⚠️ |

---

## 2. API Gateway

### Blueprint Requirements
```
POST /checkout/start
POST /checkout/execute
GET  /mint/status/:sessionId
POST /collection/create
```
- Rate limiting middleware
- Auth verification
- Idempotency enforcement
- Session ID generation (UUID v4)

### Current Implementation
- **No API Gateway exists.** All logic runs directly in the browser via React hooks.
- No rate limiting on blockchain calls
- No idempotency keys
- No session IDs for mint tracking

### Gap | Priority: 🔴 HIGH
- Duplicate mints are possible if the user double-clicks or retries during a pending tx
- No server-side rate limiting — bots can spam the minting UI
- No centralized auth verification for on-chain operations

---

## 3. Idempotency Layer

### Blueprint Requirement
> "Idempotent execution (NO duplicate mints)"

### Current Implementation
- No idempotency keys anywhere in `cartCheckout.ts` or `programs.ts`
- Retries can send the same transaction twice if the first confirms but RPC reports failure

### Gap | Priority: 🔴 HIGH
The most critical missing safety feature. A failed-but-confirmed transaction that is retried will create duplicate NFTs and charge the user twice.

**Required:**
- Generate a unique `SESSION_ID` before any checkout starts
- Store session + status (`pending / success / partial / failed`) in `mint_sessions` DB table
- Check session status before executing to prevent re-runs

---

## 4. MintSessions & Transactions Tables

### Blueprint Schema
```
MintSessions
- id
- userId
- status (pending/success/partial/failed)
- itemsRequested
- itemsMinted

Transactions
- id
- sessionId
- txSignature
- status
```

### Current Implementation
- ❌ No `mint_sessions` table
- ❌ No `transactions` table
- ⚠️ `minted_nfts` table exists but has no session/status tracking
- ⚠️ `tx_hash` stored on `minted_nfts` but no formal transaction log

### Gap | Priority: 🔴 HIGH
Without session tracking:
- Partial mints (e.g., 3/10 minted before failure) have no resume path
- Failed transactions cannot be audited
- Users have no way to check mint status after navigating away

---

## 5. Indexer + Worker System

### Blueprint Requirement
```
Worker Jobs:
- Mint Confirmation Job
- Missing NFT Recovery Job
- Collection Sync Job

Queue: BullMQ (Redis-based)
```

### Current Implementation
- ❌ No BullMQ
- ❌ No Redis
- ❌ No background workers of any kind
- ⚠️ In-process polling exists for:
  - Tree config PDA visibility (8s, 300ms intervals) — `cartCheckout.ts:254-260`
  - cNFT leaf ID parsing (15s, 500ms intervals) — `programs.ts:672-690`
- ⚠️ No retry if the browser tab closes mid-mint

### Gap | Priority: 🟡 MEDIUM
Currently, if the user closes the tab during minting, all unconfirmed items are lost and cannot be recovered without manual admin intervention.

**Required:**
- `Mint Confirmation Job` — poll RPC to confirm each tx after user signs
- `Missing NFT Recovery Job` — detect minted_nfts with no `mint_address` and attempt re-indexing
- `Collection Sync Job` — sync on-chain collection state to DB

---

## 6. Failure Handling System

### Blueprint Requirement
```
❌ RPC Failure → Retry with fallback RPC
❌ Partial Mint → Save progress → allow resume
❌ Collection Not Found → Poll with exponential backoff
❌ DB Failure → Queue reconciliation job
```

### Current Implementation
| Failure Type | Blueprint | Current |
|-------------|-----------|---------|
| RPC Failure | Fallback RPC | Single RPC, 3-attempt retry only | ⚠️ |
| Partial Mint | Save + resume | Toast error, no resume path | ❌ |
| Collection Not Found | Exponential backoff polling | Fixed-interval polling (300ms) | ⚠️ |
| DB Failure | Queue reconciliation | `console.warn` + toast only | ⚠️ |

### Gap | Priority: 🟡 MEDIUM
- No fallback RPC providers configured
- Partial mint failures lose all progress beyond what was already written to DB
- Polling uses fixed intervals instead of exponential backoff

---

## 7. Notification Service

### Blueprint Requirement
- Real-time mint status updates via WebSockets
- Error alerts pushed to UI

### Current Implementation
- ✅ **Supabase Realtime** exists and is used extensively for:
  - Live chat (`LiveChat.tsx`)
  - Notifications (`useLiveNotifications.ts`, `CreatorNotifications.tsx`)
  - Raffle updates (`Raffles.tsx`)
  - Dashboard analytics (`useDashboardAnalytics.ts`)
- ❌ **Not wired for mint status updates** — checkout progress is tracked via in-memory React state only

### Gap | Priority: 🟢 LOW
The infrastructure is there (Supabase Realtime). It just needs to be connected to mint session status changes so users get live updates if they navigate away and return.

---

## 8. RPC Strategy

### Blueprint Requirement
- Primary + fallback RPC providers
- Health check rotation

### Current Implementation
- Single RPC endpoint from `getSolanaRpcUrl()` config
- No fallback on RPC errors

### Gap | Priority: 🟡 MEDIUM
`useRpcFailover.ts` exists but contains only a single provider stub — the comment inside reads *"For Solana, we only have one RPC per network"*. It needs a secondary endpoint added to actually fail over. Additionally, `StickerPackDetail.tsx`, `useSPLTokens.ts`, and `useSolanaTransactions.ts` bypass the configured RPC and hardcode public endpoints directly.

---

## 9. Infrastructure / DevOps

### Blueprint Requirement
| Component | Spec |
|-----------|------|
| Frontend | Vercel |
| Backend | Node.js, Dockerized |
| Load Balancing | Cloudflare / NGINX |
| Storage | Arweave (permanent) + CDN cache |
| Scaling | Kubernetes, horizontal auto-scale |
| CI/CD | Required |
| Monitoring | Logs + metrics |

### Current Implementation
- ⚠️ Frontend is deployable to Vercel (Vite/React)
- ❌ No backend server (Node.js/Docker)
- ❌ No load balancer
- ✅ Arweave/Irys storage implemented
- ❌ No CDN for asset caching
- ❌ No CI/CD pipeline
- ❌ No monitoring/observability

---

## 10. Dev Handoff Checklist (Blueprint Status)

### Backend
- [ ] ❌ Implement API Gateway routes
- [ ] ❌ Add idempotency layer
- [ ] ❌ Build retry system (`retryWithBackoff()`)
- [ ] ❌ Integrate queue workers (BullMQ)

### Frontend
- [x] ✅ Connect wallet adapter
- [x] ✅ Build checkout UI
- [ ] ⚠️ Add real-time mint status updates (infrastructure exists, not wired to minting)

### Blockchain
- [x] ✅ Integrate Umi
- [x] ✅ Add mpl-core + Bubblegum V2
- [x] ✅ Implement batch mint logic

### DevOps
- [ ] ❌ Setup CI/CD
- [ ] ❌ Configure monitoring (logs + metrics)
- [ ] ❌ Deploy Redis + Postgres (Supabase = Postgres ✅, Redis ❌)

---

## 11. Summary — What's Done vs. What's Missing

### ✅ Fully Implemented
- Wallet connection (Solana + Monad)
- Collection creation (mpl-core 1.10.0 CollectionV2)
- Candy Machine with guards (multi-phase)
- Batch & bulk NFT minting (Core + cNFT)
- Cart checkout UI with cost preview
- Arweave/Irys asset upload pipeline
- Supabase Realtime infrastructure (social)
- DB tables: collections, minted_nfts, users
- Burn NFT feature (Core + Bubblegum V2)

### ⚠️ Partially Implemented
- Retry logic (inline 3-attempt, no exponential backoff)
- Notification service (Supabase Realtime exists but not for minting)
- Auth (Supabase client-side, no server-side verification)
- Failure handling (toasts + warnings, no recovery path)
- RPC polling for account visibility (fixed interval)
- RPC failover (`useRpcFailover.ts` is a stub — single provider, no true fallback)

### ❌ Not Implemented (Blueprint Gaps)
- **API Gateway** (all logic is client-side)
- **Idempotency layer** (risk of duplicate mints)
- **MintSessions table** (no partial mint tracking)
- **Transactions table** (no tx log)
- **Worker/Queue system** (BullMQ + Redis)
- **Background indexer jobs** (Mint Confirmation, Recovery, Sync)
- **Fallback RPC** (stub exists, no secondary endpoint configured)
- **Partial mint resume** (lost on failure)
- **Image optimization** for uploaded assets (Epic 4 — Asset Pipeline)
- **Metadata validator** before Arweave upload (Epic 4 — Asset Pipeline)
- **CI/CD pipeline**
- **Monitoring & observability**
- **Node.js backend / Docker**

---

## 12. Recommended Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 🔴 P0 | Idempotency (session IDs + dedup check) | Medium | Prevents duplicate mints |
| 🔴 P0 | MintSessions DB table + status tracking | Low | Enables partial mint recovery |
| 🔴 P1 | Fallback RPC configuration | Low | Prevents total outage on RPC failure |
| 🟡 P1 | Exponential backoff retry utility | Low | More resilient minting |
| 🟡 P2 | Wire Supabase Realtime to mint sessions | Medium | Real-time mint progress |
| 🟡 P2 | Transactions table + tx logging | Low | Auditability |
| 🟢 P3 | Background worker system (BullMQ) | High | Production-grade reliability |
| 🟢 P3 | API Gateway / Node.js backend | Very High | Full production architecture |
| 🟢 P3 | Image optimization in upload pipeline | Medium | Reduces storage cost + load time |
| 🟢 P3 | Metadata validator before Arweave upload | Low | Prevents bad/missing metadata on-chain |
| 🟢 P4 | CI/CD + monitoring | High | DevOps maturity |

---

---

---

## 13. UI Wireframe & Growth System (v3 additions)

### UI Wireframe — What's Built vs. Missing

| Screen | Blueprint Spec | Current Status |
|--------|---------------|----------------|
| Dashboard (Creator Hub) | Sidebar + active collections + live mint stats | ✅ `Dashboard.tsx` exists |
| Create Collection Flow | 5-step wizard | ✅ `LaunchpadCreate.tsx` (multi-step) |
| Cart Checkout UI | Cost breakdown + progress tracker + Success/Partial/Failed | ⚠️ Success/Failed shown, **Partial status missing** |
| Mint Tracking Screen | Live feed + supply remaining + **Retry Failed Items** button | ⚠️ `RecentSalesTable.tsx` exists, **retry button missing** |
| Analytics Dashboard | Total minted + revenue + unique holders + velocity/distribution graphs | ⚠️ `CollectionAnalytics.tsx` exists, mint velocity + wallet distribution graphs missing |

#### New Gaps from Wireframe | Priority: 🟡 MEDIUM

- **"Retry Failed Items" button** on Mint Tracking / Collection Detail — currently failed batch items are silently dropped with a toast, no UI to re-attempt
- **Partial mint status** — Cart checkout only shows Success or error; no "3/10 minted (partial)" state surfaced to the user
- **Mint velocity graph** — not in `CollectionAnalytics.tsx` (total minted only, no time-series)
- **Wallet distribution graph** — not in `CollectionAnalytics.tsx`

---

### Growth + Network Effects — What's Built vs. Missing

| Feature | Blueprint | Current Status |
|---------|-----------|----------------|
| Leaderboards | Volume, streak, rarity | ✅ `Leaderboard.tsx`, `StreakLeaderboard.tsx`, `RarityLeaderboard.tsx`, `VolumeLeaderboard.tsx` |
| Referral System | Link → mint → rewards | ✅ `useReferralCode.ts` exists |
| Token Launch Loop | Top collection → community vote → token launch | ✅ `TokenLaunchMechanics.tsx` (mechanics), ❌ community vote not implemented |
| Social Minting Live Feed | Live mint activity panel | ✅ `RecentSalesTable.tsx` (partial) |
| Shareable Mint Cards | Auto-generated on mint | ❌ Not implemented |
| "Mint before it sells out" alerts | Scarcity push notifications | ❌ Not implemented |
| Referral Rewards | Fee discounts + exclusive mint access | ⚠️ Code exists, reward fulfillment not wired |
| Verified Creator Badge | For high-volume creators | ⚠️ Badge UI exists, no automated promotion logic |

#### New Gaps from Growth System | Priority: 🟢 LOW–MEDIUM

- **Auto-generated shareable mint cards** — high viral impact, not built
- **"Mint before it sells out" alerts** — scarcity urgency mechanic, not built
- **Community vote → token launch flow** — `TokenLaunchMechanics.tsx` exists but voting UI is absent
- **Referral reward fulfillment** — `useReferralCode.ts` tracks codes but fee discounts/exclusive access aren't enforced at checkout

---

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 🟡 P2 | Retry Failed Items button on mint tracking | Low | Recovers partial mints without admin help |
| 🟡 P2 | Partial mint status display in checkout | Low | Transparency for users |
| 🟡 P2 | Mint velocity + wallet distribution graphs | Medium | Analytics completeness |
| 🟢 P3 | Auto-generated shareable mint cards | Medium | Viral growth |
| 🟢 P3 | Community vote UI for token launch | Medium | Growth loop completion |
| 🟢 P4 | Sell-out alert notifications | Low | Scarcity urgency |
| 🟢 P4 | Referral reward enforcement at checkout | Medium | Referral loop completion |

---

> **v2 additions** *(April 22, 2026)*: Image optimization, metadata validator, RPC failover stub, hardcoded RPC endpoints.
> **v3 additions** *(April 22, 2026 — from Production Architecture Diagram v3)*: UI wireframe gaps (retry button, partial status, analytics graphs) and growth system gaps (shareable mint cards, community vote, referral rewards, sell-out alerts).

*Gap analysis prepared by The Lily Pad AI Assistant — April 22, 2026*
