## Mobile Audit & Optimization Plan

Scope: full mobile audit + refactor, focused on three deliverables you called out — the floating admin toolbar button, the homepage NFT showcase, and broader mobile layout polish.

### 1. Move the floating "bug" (Admin Toolbar) button

File: `src/components/admin/AdminToolbar.tsx`

Current: button is `fixed bottom-20 right-4`, panel is `bottom-36 right-4 w-[360px]`. On mobile the `MobileBottomNav` is 64px tall, so `bottom-20` (80px) leaves only ~16px clearance, and the 360px panel overflows the 390px viewport. The sibling `DevConsole` button sits at the exact same coords, so they overlap.

Changes:
- Button: move to `bottom-[88px] right-3` on mobile, `bottom-6 right-6` on desktop (clear of `MobileBottomNav` + safe-area inset). Shrink to `w-11 h-11` on mobile.
- Stagger vs DevConsole: offset AdminToolbar button left by 56px on mobile (`right-[68px]`) so the two floating buttons sit side-by-side instead of stacking on top of each other.
- Panel: use `w-[min(92vw,360px)] right-3 bottom-[148px]`, `max-h-[65vh]` with safe-area-aware padding, and add `pb-[env(safe-area-inset-bottom)]`.
- Add `aria-label="Admin controls"` and increase tap target padding.

(Same `bottom` / width adjustments applied to `src/components/admin/DevConsole.tsx` so the pair stays consistent.)

### 2. Homepage NFT showcase — mobile polish

Files: `src/components/sections/FeaturedCardStack.tsx`, `FeaturedCollectionsSection.tsx`, `TopCollectionsHighlights.tsx`, `HeroSection.tsx`, `pages/Index.tsx`.

Audit findings to fix:
- **FeaturedCardStack** stacked layout often clips on small screens and the absolutely-positioned cards overlap the section above. Switch to a horizontal snap-scroll carousel on `<md` (`flex overflow-x-auto snap-x snap-mandatory gap-3 px-4 -mx-4`) with one card per viewport and a pagination dot row. Keep the existing stacked layout on `md+`.
- **FeaturedCollectionsSection** grid: enforce `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` with `gap-4`, ensure card image uses `aspect-square` and `object-cover` so heights line up, truncate name with `line-clamp-1` and stats with `line-clamp-1`.
- **TopCollectionsHighlights**: convert the side-by-side rank list to vertical stack on mobile, font sizes down to `text-sm`, condense secondary metrics into a single row of pill badges. Hide the desktop-only sparkline on `<sm`.
- **Section rhythm in `Index.tsx`**: reduce vertical spacing between sections on mobile (`py-8` instead of `py-16`), add `space-y-10 md:space-y-20` wrapper.
- Add `loading="lazy"` and explicit `width`/`height` on all NFT card `<img>` tags to stop CLS jank while scrolling.

### 3. Broader mobile layout audit

Sweep these high-traffic pages at 390×844 and fix the recurring issues below. No business-logic changes — presentation only.

Pages: `Index`, `Marketplace`, `Streams`, `CollectionDetail`, `PublicProfile`, `Wallet`, `Launchpad`, `Auth`.

Recurring fixes:
- **Bottom-nav clearance**: every page main container gets `pb-24 md:pb-12` so the 64px `MobileBottomNav` never covers content (currently several pages stop at `pb-12`).
- **Container padding**: standardize `px-4 md:px-6 lg:px-8` (some pages jump straight from `px-4` to `container mx-auto` losing edge padding on small screens).
- **Navbar**: confirm mobile menu drawer height accounts for safe-area top inset; hide secondary nav items behind the existing hamburger.
- **Tap targets**: minimum 44×44 for icon buttons (chain-filter chips on Marketplace are currently 32px tall — bump to `py-2.5 text-sm`).
- **Modals**: `Dialog` content gets `max-h-[90dvh] overflow-y-auto` and `w-[95vw] sm:max-w-lg` so checkout/buy modals don't get cut off (apply to `BuyNFTModal`, `BidAuctionModal`, `CartCheckoutModal`).
- **Horizontal scroll bleed**: add `overflow-x-hidden` to `<main>` wrappers that currently allow rogue children to push the viewport wider.
- **Typography**: cap page H1 at `text-2xl md:text-4xl`, body at `text-sm md:text-base`. Several hero/section headers currently use `text-5xl` which wraps awkwardly at 390px.
- **Safe area**: add `pb-[env(safe-area-inset-bottom)]` to `MobileBottomNav` (already in CSS class — verify) and `pt-[env(safe-area-inset-top)]` to the navbar.

### Verification

After each batch of edits, capture mobile screenshots via Playwright at 390×844 of: `/`, `/marketplace`, `/streams`, `/collection/:id` (one live collection), and a profile page. Confirm visually that:
1. AdminToolbar + DevConsole buttons sit above the bottom nav with no overlap.
2. Homepage showcase scrolls cleanly with no clipped cards.
3. No horizontal scroll, no content hidden behind the bottom nav, modals fit the viewport.

### Out of scope
- No backend / RLS / data changes.
- No new features, no design redesign of desktop.
- No changes to wallet flow, checkout business logic, or smart-contract code.

### Technical notes
- All color/spacing changes via existing tokens — no hardcoded hex.
- Use the `useIsMobile()` hook only where Tailwind responsive prefixes can't express the behavior (e.g. the `FeaturedCardStack` layout swap).
- Reuse existing `cn()` utility and shadcn variants; no new dependencies.
