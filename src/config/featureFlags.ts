/**
 * Feature Flags for The Lily Pad
 *
 * Toggle features on/off without code changes.
 */

/**
 * Decentralized (Arweave) chat persistence.
 *
 * Disabled under the native-Arweave migration: every chat message would be a
 * standalone L1 Arweave tx, which is uneconomical for high-frequency writes
 * and requires every viewer to have ArConnect + AR. Chat continues to work
 * via the Supabase realtime path; only the on-chain archive is gated.
 *
 * Flip to `true` only if a cheap Arweave write path returns.
 */
export const DECENTRALIZED_CHAT_ENABLED = false;
