/**
 * Feature Flags for The Lily Pad
 *
 * Toggle features on/off without code changes. Defaults are mainnet-safe:
 * anything unfinished is `false` so the production build only exposes
 * what is fully wired end-to-end.
 *
 * Override per-environment with Vite env vars (set `VITE_FLAG_<NAME>=true`).
 */

const flag = (name: string, fallback: boolean): boolean => {
  const v = (import.meta as any).env?.[`VITE_FLAG_${name}`];
  if (typeof v === "string") return v.toLowerCase() === "true";
  return fallback;
};

/**
 * Decentralized (Arweave) chat persistence.
 *
 * Disabled under the native-Arweave migration: every chat message would be a
 * standalone L1 Arweave tx, which is uneconomical for high-frequency writes.
 * Chat continues to work via Supabase realtime; only the on-chain archive
 * is gated.
 */
export const DECENTRALIZED_CHAT_ENABLED = flag("DECENTRALIZED_CHAT", false);

/**
 * Secondary marketplace (escrow-based listings, offers, buys).
 *
 * The on-chain escrow program (`useEscrowProgram`, `useMarketplaceContract`)
 * is a stub — placeholder Program ID, `isDeployed:false`. UI listing/buy
 * flows are gated until the Anchor program is deployed.
 */
export const SECONDARY_MARKETPLACE_ENABLED = flag("SECONDARY_MARKETPLACE", false);

/**
 * Limited Edition donor-tier mint page.
 *
 * Tier supplies are hardcoded and SOL payment does not trigger an on-chain
 * mint — no Candy Machine is wired. Hidden until backed.
 */
export const DONOR_TIER_MINT_ENABLED = flag("DONOR_TIER_MINT", false);

/**
 * Livepeer / RTMP-backed streaming.
 *
 * No Livepeer SDK is integrated. `useWebRTCStream` only captures a local
 * MediaStream — remote viewers cannot watch. Streaming pages stay hidden
 * until the ingest pipeline ships. Clips and WaitRoom remain available.
 */
export const LIVEPEER_STREAMING_ENABLED = flag("LIVEPEER_STREAMING", false);

/**
 * Seed-based XRPL launch path (`useXRPLLaunch`).
 *
 * Accepts raw secret seeds for batch minting — dev/testing only. Production
 * must use `useXRPLConnectedLaunch` (Joey Wallet signing).
 */
export const XRPL_SEED_LAUNCH_ENABLED = flag("XRPL_SEED_LAUNCH", false);
