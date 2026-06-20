/**
 * Reown (WalletConnect) configuration.
 *
 * Project ID is publishable per Reown's docs — safe to commit. The
 * server-side API key lives in the `REOWN_API_KEY` runtime secret and is
 * only ever read inside edge functions.
 */

export const REOWN_PROJECT_ID = "85d41848a86d101a418384c0008c501e";

/** App metadata shown in the WalletConnect modal and remote wallet pairings. */
export const REOWN_APP_METADATA = {
  name: "The Lily Pad",
  description: "Lily Launchpad — multi-chain NFT launchpad and creator streaming platform.",
  url: typeof window !== "undefined" ? window.location.origin : "https://thelilypad.lovable.app",
  icons: ["https://thelilypad.lovable.app/icon-192.png"],
} as const;
