# Social Profiles — Followers, Supporters & Activity

Add a shared social layer to all four profile pages so visitors can follow creators, see who supports their work, and watch a live activity feed.

## Scope

Profiles touched:
- `PublicProfile` (`/u/:identifier`)
- `ArtistProfile`
- Streamer profile (`/streamer/:id`)
- `DonorProfile`

Per-collection: a supporters strip on `CollectionDetail` / collection cards.

## What the user will see

### 1. Profile header — Follow & counts
- Followers count + Following count chips
- Follow / Unfollow button (only when wallet connected and viewing another user)
- Counts and button state update in realtime via Supabase Realtime channel on `followers`

### 2. Top Supporters panel
- Card listing the top 10 wallets supporting this creator, with avatar, display name, supporter score, and tier badge (Bronze → Platinum, reusing the existing donor-tier system)
- **Combined score** = SOL tipped/donated + total SOL spent on creator's NFTs (mints + secondary buys of items in collections where `creator_id = profile.user_id`)
- "View all" → links to a full leaderboard sheet
- Realtime: subscribes to `earnings` and `nft_listings` inserts to refresh

### 3. Artwork Supporters (per collection)
- Stacked-avatar row + count ("Supported by Alice, Bob +42 others") on `CollectionDetail` and on collection cards in profile grid
- Source: distinct `owner_id` from `minted_nfts` for that collection, plus distinct `buyer_id` from sold `nft_listings`
- Click → opens a sheet listing all supporters with amounts

### 4. Social Activity Feed
- Tabbed feed on each profile: All / Mints / Sales / Tips / Followers / Clips
- Items rendered with avatar, action verb, target, amount where relevant, relative time
- Realtime: subscribes to inserts on `followers`, `earnings`, `minted_nfts`, `nft_listings` (filtered to this creator)
- Infinite scroll using existing `useInfiniteScroll`

## Technical details

### Database (one migration)
- RPCs (all `SECURITY DEFINER`, `SET search_path = public`):
  - `get_profile_social_counts(target_user_id uuid)` → `{followers_count, following_count, is_following}` (is_following resolved from `auth.uid()`)
  - `get_top_supporters(target_user_id uuid, limit_count int default 10)` → table of `(supporter_user_id, wallet_address, display_name, avatar_url, tips_sol, nft_spend_sol, total_score, tier)`
  - `get_collection_supporters(collection_id uuid, limit_count int default 50)` → table of supporters with avatar + spend
  - `get_profile_activity_feed(target_user_id uuid, filter text default 'all', limit_count int default 30, before timestamptz default null)` → unified feed (UNION ALL of follows, mints, sold listings, earnings/tips) for keyset pagination
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.followers, public.earnings, public.minted_nfts, public.nft_listings;` (skip any already added — guarded via DO block)
- No new tables. RLS on existing tables is already in place; new RPCs `GRANT EXECUTE` to `authenticated, anon` (read-only) and `service_role`.

### New hooks (`src/hooks/`)
- `useFollow(targetUserId)` — `{ isFollowing, followersCount, followingCount, toggleFollow, loading }`; writes to `followers`, optimistic update, subscribes to realtime, writes a `notifications` row on follow
- `useTopSupporters(targetUserId)` — calls `get_top_supporters`, refreshes on realtime
- `useCollectionSupporters(collectionId)` — calls `get_collection_supporters`
- `useProfileActivity(targetUserId, filter)` — calls `get_profile_activity_feed`, supports filter switch and infinite scroll, realtime prepends new items

### New components (`src/components/social/`)
- `FollowButton.tsx`
- `ProfileSocialHeader.tsx` (counts + follow button, drop-in for all four profile pages)
- `TopSupportersCard.tsx` + `SupporterRow.tsx` + `SupportersSheet.tsx`
- `CollectionSupportersStrip.tsx`
- `ActivityFeed.tsx` + `ActivityItem.tsx` (renders typed feed entries with icons per source)

### Integration (presentation-only)
- `src/pages/PublicProfile.tsx`, `ArtistProfile.tsx`, `DonorProfile.tsx`, streamer profile page: mount `ProfileSocialHeader`, `TopSupportersCard`, and `ActivityFeed` in a tabbed/sidebar layout consistent with current design tokens (mint primary, floating/glow).
- `src/pages/CollectionDetail.tsx` + collection card on profile grids: add `CollectionSupportersStrip`.

## Out of scope
- New on-chain actions (tipping/minting flows unchanged)
- Direct messages / comments on profiles
- Notification UI changes beyond inserting a row on follow
- Editing the existing `useFollow`/`FollowButton` if they already exist — I'll reuse and extend rather than duplicate (confirmed during implementation)

## Files
- Migration: 1 new file under `supabase/migrations/`
- New: `src/hooks/useFollow.ts`, `useTopSupporters.ts`, `useCollectionSupporters.ts`, `useProfileActivity.ts`
- New: `src/components/social/{FollowButton,ProfileSocialHeader,TopSupportersCard,SupporterRow,SupportersSheet,CollectionSupportersStrip,ActivityFeed,ActivityItem}.tsx`
- Edited: `src/pages/PublicProfile.tsx`, `ArtistProfile.tsx`, `DonorProfile.tsx`, the streamer profile page, `CollectionDetail.tsx`
