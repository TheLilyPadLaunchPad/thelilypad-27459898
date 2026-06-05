# The Lily Pad — Project Memory
> **AI Agent: Read this file at the start of every session before writing any code.**
> Last updated: 2026-03-01

---

## 1. What We Are Building

**The Lily Pad** is a multi-chain NFT Launchpad & Marketplace.

| Aspect | Detail |
|--------|--------|
| **Domain** | `thelilypad.io` |
| **Tagline** | "Create, stream, launch, and thrive" |
| **Chains** | Solana · XRPL (XRP Ledger) · Monad |
| **Primary users** | NFT creators (launchpad) + collectors (marketplace) |
| **Admin features** | Toolbar, user management, IPFS upload (admin-only) |
| **In-progress features** | Creator Beta Program (application form + admin approval + video interview room) |

---

## 2. Tech Stack

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | **Vite + React 18 + TypeScript** |
| Routing | `react-router-dom` v7 |
| State | React Context + `@tanstack/react-query` v5 |
| Styling | **Tailwind CSS** v3 + shadcn/ui (Radix primitives) |
| Animation | `framer-motion` v12 + `gsap` v3 |
| Forms | `react-hook-form` + `zod` |
| Toasts | `sonner` |
| Icons | `lucide-react` |

### Backend / Services
| Layer | Technology |
|-------|-----------|
| **Primary platform** | **Lovable.dev** (cloud host + CI/CD) |
| **App DB + Auth** | Supabase project #1 (`VITE_SUPABASE_URL`) |
| **NFT Storage** | Supabase project #2 (`VITE_STORAGE_SUPABASE_URL`) — images + metadata only |
| **IPFS** | Pinata — admin-only, NOT used in creator flow |
| **Mobile** | Capacitor (iOS/Android wrapper) |

### Blockchain Libraries
| Chain | Library |
|-------|---------|
| All wallets | `@phantom/browser-sdk` v1 |
| XRPL | `xrpl` v4.5 |
| Solana | `@solana/web3.js` + `@metaplex-foundation/*` (Metaplex Core, Candy Machine, Hybrid) |
| Monad | ethers.js / EVM (via monad client) |

---

## 3. Repository Structure

```
thelilypad-20f4382f/
├── src/
│   ├── App.tsx                    ← root routes
│   ├── main.tsx                   ← entry point + providers
│   ├── providers/
│   │   ├── WalletProvider.tsx     ← MULTI-CHAIN wallet (Solana/XRPL/Monad via Phantom)
│   │   ├── AuthProvider.tsx       ← state machine auth (CONNECTING→CONNECTED→PROFILE)
│   │   ├── ChainProvider.tsx      ← active chain context
│   │   └── AudioPlayerProvider.tsx
│   ├── chains/
│   │   ├── index.ts               ← barrel re-exports for all chains
│   │   ├── xrpl/
│   │   │   ├── nft.ts             ← XLS-20 primitives (mint/offer/accept/burn)
│   │   │   ├── domain.ts          ← deploy collection + batch mint (high-level)
│   │   │   ├── marketplace.ts     ← list/buy/offer/broker wrappers
│   │   │   ├── client.ts          ← WebSocket client factory
│   │   │   ├── types.ts           ← all XRPL TypeScript types
│   │   │   ├── validate.ts        ← address + royalty validation
│   │   │   └── BattleService.ts   ← ⚠️ PLACEHOLDER — not implemented
│   │   ├── solana/                ← Metaplex Core, candy machine, hybrid
│   │   └── monad/                 ← EVM contracts
│   ├── hooks/
│   │   ├── useXRPLMint.ts         ← single-mint hook (fixed all 4 bugs Mar 2026)
│   │   ├── useXRPLLaunch.ts       ← deploy + batch mint hook (returns XRPLMintResult[])
│   │   ├── useUserProfile.ts      ← Supabase profile fetch
│   │   └── useMarketplaceData.ts  ← marketplace query hook
│   ├── lib/
│   │   ├── xrpl-wallet.ts         ← AES-GCM encrypted wallet storage
│   │   ├── nftStorageService.ts   ← Supabase upload + ZIP download
│   │   ├── assetBundler.ts        ← canvas compositing + XLS-20 metadata
│   │   ├── payloadMapper.ts       ← deterministic Supabase URL generators
│   │   └── ipfsUtils.ts           ← ipfsToHttp() gateway resolver
│   ├── integrations/supabase/
│   │   ├── client.ts              ← main Supabase client (auth + app DB)
│   │   └── storageClient.ts       ← NFT storage-only Supabase client
│   ├── config/
│   │   ├── chains.ts              ← SupportedChain type, chain config
│   │   └── phantom.ts             ← Phantom SDK init
│   ├── components/
│   │   ├── admin/AdminToolbar.tsx ← fixed React hooks violation Mar 2026
│   │   ├── Navbar.tsx
│   │   └── ...shadcn/ui components
│   └── pages/
│       ├── Auth.tsx               ← wallet connect UI (Solana/XRPL/Monad)
│       ├── XRPLEasyGenerator.tsx  ← 3-step XRPL NFT creation wizard
│       ├── LaunchpadCreate.tsx    ← full launchpad creation (trait layers)
│       ├── Index.tsx              ← landing page
│       └── ...
├── supabase/
│   └── migrations/                ← SQL migration files
├── public/                        ← static assets
├── vite.config.ts                 ← Vite + PWA + node polyfills config
└── PROJECT_MEMORY.md              ← THIS FILE
```

---

## 4. Key Architecture Decisions

### 4.1 Dual Supabase Setup
```
VITE_SUPABASE_URL          → Main Supabase (auth, profiles, collections, minted_nfts, marketplace)
VITE_STORAGE_SUPABASE_URL  → NFT Storage Supabase (nft-images, nft-metadata, collection-images buckets)
```
- Import main client: `import { supabase } from '@/integrations/supabase/client'`
- Import storage client: `import { storageClient, NFT_BUCKETS } from '@/integrations/supabase/storageClient'`

### 4.2 IPFS Strategy
- **Creators**: Upload to Supabase Storage (no IPFS). Supabase URLs used as metadata URIs on XRPL.
- **Admins only**: Can pin to Pinata/IPFS via the admin panel.
- **Display**: `ipfsToHttp(url)` converts `ipfs://Qm...` → `https://cloudflare-ipfs.com/ipfs/Qm...`

### 4.3 XRPL "Collection" Model
XRPL has no native collection concept. We simulate it with:
1. **Account Domain** = Supabase metadata root URI (set via `AccountSet` tx)
2. **NFTokenTaxon** = groups tokens (timestamp-seeded integer, same per collection)
3. **issuer wallet address** = stored as `contract_address` in `collections` DB table

### 4.4 Wallet Architecture
```
WalletProvider
  ├── connectSolana()    → Phantom SDK (Solana)
  ├── connectXRPL()      → Phantom SDK (XRPL) or local encrypted wallet
  ├── connectMonad()     → Phantom SDK (EVM)
  └── signXRPLTransaction() → loads seed from localStorage (AES-GCM encrypted)
```

### 4.5 PWA
`vite-plugin-pwa` with `devOptions.enabled: true` — `sw.js` served in dev mode.
Fixed: `injectRegister: 'auto'`, `navigateFallback: 'index.html'`, full glob patterns.

---

## 5. Database Schema (Key Tables)

```sql
collections
  id uuid PK
  name, symbol, description text
  chain text                   -- 'solana' | 'xrpl' | 'xrpl-testnet' | 'monad'
  total_supply int
  minted int
  status text                  -- 'draft' | 'active' | 'minted'
  creator_id uuid FK auth.users
  creator_address text
  contract_address text        -- XRPL: issuer wallet address; Solana: candy machine pubkey
  image_url text
  base_ipfs_cid text           -- optional, admin-only IPFS CID

minted_nfts
  id uuid PK
  collection_id uuid FK
  token_id int                 -- sequential index (0-based)
  nft_token_id text            -- XRPL: real 64-char hex NFTokenID
  name, description text
  image_url text
  owner_address text
  owner_id uuid FK auth.users
  tx_hash text
  is_revealed bool
  minted_at timestamptz

creator_beta_applications      -- Added Feb 2026
  id uuid PK
  user_id uuid FK auth.users
  status text                  -- 'pending' | 'reviewing' | 'interview_scheduled' | 'approved' | 'rejected'
  display_name, handle, email text
  primary_platform text
  portfolio_urls text[]
  social_links jsonb
  content_description text
  interview_room_url text      -- filled by admin on approval
  reviewed_by uuid
  reviewed_at timestamptz
  created_at, updated_at timestamptz
```

---

## 6. Completed Work Log

### Session: Jun 5, 2026
- ✅ **Publish unblock** — removed corrupted `WalletProvider.backup.tsx` from `src/providers` so source scans/type checks no longer fail on an invalid backup file.

### Session: Feb 2026
- ✅ Fixed IPFS image rendering (`ipfsToHttp()`) in marketplace + collection pages
- ✅ Solana/Monad wallet connection debugging
- ✅ Creator Beta Program plan + DB schema designed

### Session: Mar 1, 2026 (morning)
- ✅ **AdminToolbar.tsx** — React hooks violation fixed (early `return null` before hooks)
  - Moved to `shouldShow` variable, all `useQuery { enabled: shouldShow }` pattern
- ✅ **XRPL Full Audit** — 17 bugs identified, documented in `xrpl_audit_report.md`
- ✅ **PWA Fix** — `sw.js` MIME type error resolved
  - `injectRegister: 'auto'`, `devOptions: { enabled: true }`, full glob patterns
- ✅ **XRPL All-Bugs Fixed** (Grok's plan implemented):
  - XRPL-001: `Buffer.from` → `convertStringToHex` (browser-safe)
  - XRPL-002: `safeExtractNFTokenId()` from correct meta path
  - XRPL-003: `assertSuccess()` on every write tx
  - XRPL-004: Real 64-char NFTokenID stored as `nft_token_id` string in DB
  - XRPL-006: No more fake mock address — throws if client/wallet missing
  - XRPL-009: `batchMintNFTokensParallel()` using XRPL Tickets (~30s for 500 NFTs)
  - XRPL-013: `getXRPLNetwork()` used instead of Solana network var
  - XRPL-015: `getAccountNFTs()` fully paginated with marker cursor

---

## 7. Known Remaining Issues / TODOs

| Priority | Area | Issue |
|----------|------|-------|
| 🔴 HIGH | `BattleService.ts` | Entire file is a non-functional placeholder — will produce invalid txs if called |
| 🔴 HIGH | `xrpl-wallet.ts` | AES-GCM encryption key derived from public info (address + hardcoded salt) — documented "obfuscation not true encryption" |
| 🟡 MED | Creator Beta | Application form + admin approval UI not yet built |
| 🟡 MED | Creator Beta | Jitsi video interview room not yet integrated |
| 🟡 MED | `useXRPLMint` | `nft_token_id` column may not exist in `minted_nfts` yet — run migration |
| 🟡 MED | Streamer Profile | IPFS image fallbacks missing on some components |
| 🟢 LOW | `assetBundler.ts` | `nftToSolanaMetadata` defaults to `ipfs://YOUR_IMAGE_CID` placeholder |
| 🟢 LOW | `BattleService.ts` | `DestinationTag: 12345` hardcoded — needs session-based battle IDs |

---

## 8. Code Conventions

### Naming
- Toast IDs: `'easy-mint'`, `'xrpl-mint'`, `'xrpl-deploy'`, `'zip-download'`
- Chain value in DB: `'solana'` | `'xrpl'` | `'xrpl-testnet'` | `'monad'`
- IPFS gateway: always `cloudflare-ipfs.com` (not `ipfs.io`)

### XRPL-Specific
- TransferFee: `0–50000` (multiply % by `1000`, e.g. `5% → 5000`)
- URI field: must be hex-encoded, ≤ 256 bytes (`convertStringToHex` from xrpl.js)
- NFTokenID: always stored as full 64-char hex string — never `parseInt`
- Result check: always assert `meta.TransactionResult === 'tesSUCCESS'`

### Error Handling Pattern
```typescript
try {
  toast.loading('...', { id: 'toast-id' });
  // ... operation
  toast.success('Done!', { id: 'toast-id' });
} catch (err: any) {
  console.error('[context]', err);
  toast.error(err.message || 'Failed', { id: 'toast-id' });
  throw err;
} finally {
  // cleanup (disconnect client, setLoading(false))
}
```

### Import Aliases
```typescript
'@/'  → 'src/'       // e.g. @/components/Navbar
```

### Supabase Auth Pattern
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) throw new Error('Authentication required');
```

---

## 9. Environment Variables

```bash
# Main Supabase (auth, DB, app data)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...

# Dedicated NFT Storage Supabase (separate project: jlkupdukwgsadvzxafed)
VITE_STORAGE_SUPABASE_URL=https://jlkupdukwgsadvzxafed.supabase.co
VITE_STORAGE_SUPABASE_KEY=eyJ...

# Pinata (admin-only IPFS)
VITE_PINATA_JWT=...
VITE_PINATA_GATEWAY=...

# Phantom SDK
VITE_PHANTOM_APP_ID=...
```

---

## 10. Running the App

```bash
# Development (port 5173 — NOT 8080 which is the vite.config default)
npx vite --port 5173

# Type check (should always be 0 errors before committing)
npx tsc --noEmit

# Build for production
npm run build
```

> **Note:** The vite.config.ts `server.host` port is `8080` but we always run on `5173` via the manual `--port` flag to avoid conflicts.

---

## 11. Next Planned Features

1. **Creator Beta Program** (partially designed)
   - Multi-step application form (`/apply`)
   - Admin approval dashboard (`/admin/creator-applications`)
   - Jitsi Meet video interview room (private, auto-created on approval)
   - Auto-promotion to creator role on final approval

2. **Streamer Profile Fixes**
   - IPFS fallback images
   - Parallax scroll improvements
   - Proper metadata linking

3. **XRPL Marketplace**
   - Live listings from `getNFTSellOffers` (paginated)
   - Buy flow using `buyNFTNow` from `marketplace.ts`

4. **BattleService Implementation**
   - Escrow-based gamified NFT floor swaps
   - Crypto-condition preimage for trustless unlock
