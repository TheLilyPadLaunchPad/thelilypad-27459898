# UI/UX & Performance Improvements — Desktop + Mobile

Audit found a handful of clear mismatches and runtime issues. This plan only changes what's needed to fix them — no redesigns.

## Critical layout fixes (visible on every page)

1. **Hoist `<Navbar />` out of the `md:pl-16` wrapper in `src/App.tsx`.**
   Currently the fixed navbar lives inside the desktop-sidebar offset wrapper, which causes a hydration flash and offsets it incorrectly. Render `<Navbar />` and `<MobileBottomNav />` at the same level, with only `<Routes>` inside the `md:pl-16` div.

2. **Fix the desktop sidebar starting position in `src/components/MobileBottomNav.tsx`.**
   Change the desktop branch from `top-0 md:top-20` to a clean `top-20` (the branch only renders when `!isMobile`, so the responsive override is unnecessary and causes a brief overlap with the navbar).

3. **Replace `pt-16` with `pt-20 sm:pt-24` in:**
   - `src/pages/ArtistProfile.tsx:276`
   - `src/pages/LaunchpadCreate.tsx:1118`
   Navbar is `h-20` on desktop, so `pt-16` hides 16 px of content behind it.

4. **`src/pages/Streams.tsx:149`** — change hero from `px-6` to `px-4 sm:px-6 lg:px-8` so it scales like the rest of the site once the desktop sidebar offset is applied.

## Runtime performance

5. **Make the mobile/desktop nav split CSS-only** in `src/components/MobileBottomNav.tsx` — render both branches and toggle with `flex md:hidden` / `hidden md:flex`. Removes the `useIsMobile()` JS gate and the first-paint flash.

6. **Optimize `.nft-frame::after` hover animation in `src/index.css`.**
   - Animate `transform: translateX()` instead of `left` (compositor-only, no layout/paint).
   - Add `will-change: transform` only on hover.
   - Wrap motion in `@media (prefers-reduced-motion: reduce) { … none }`.
   This removes scroll jank on Marketplace grids.

7. **Gate the Supabase token purge in `src/main.tsx:35–43`** behind a single check so it only runs when needed (or move it into a post-mount effect). Stops 1–5 ms of sync localStorage work on every cold load.

8. **Split `vendor-motion` chunk in `vite.config.ts:185`** into `vendor-framer` (framer-motion) and `vendor-gsap` (gsap). GSAP is only used on a few pages and shouldn't ship with framer-motion everywhere.

9. **Dedupe `useIsAdmin()` calls.** It runs three times per render (`AppContent`, `AdminRoute`, `Navbar`). Lift it into a small `AdminContext` provider in `src/App.tsx` and consume from there.

## Polish

10. **Add `loading="lazy"`, `decoding="async"`, and explicit `width`/`height`** to `<img>` tags on the heaviest pages: `src/pages/Streams.tsx`, `src/components/sections/TopCollectionsHighlights.tsx`, `src/pages/StreamerCollections.tsx`. Biggest CLS/LCP win.

11. **Swap hardcoded Tailwind colors for semantic tokens** in `src/components/Navbar.tsx:282–284` (the chain indicator badge) — use `--primary` / `--accent` / chain-theme tokens already defined in `src/index.css`.

12. **Hoist `<Navbar />` above the conditional branches in `src/pages/CollectionDetail.tsx`** so it isn't unmounted/remounted on loading/error/success state changes.

## Out of scope (flagged but not changed)

- Heavy blockchain libs (Metaplex/Solana/XRPL) bundle weight — would need deeper refactor.
- Auth flow / wallet-only mode redesign.
- The new glass-frame visual itself — only the animation property is changed for perf.

## Verification

After changes: load `/`, `/marketplace`, `/streams`, `/artist/:id`, `/launchpad/create` on desktop (≥1024 px) and mobile (375 px) preview, confirm no navbar overlap, no content cut off, and scroll stays smooth on the marketplace grid.
