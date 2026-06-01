/**
 * LilyPad Metaplex Agent Configuration
 *
 * After running `npx tsx scripts/mint-agent.ts`, replace the placeholder
 * values below with the real addresses printed by the script.
 */

/** The Core asset address of the registered LilyPad agent (set after minting) */
export const LILYPAD_AGENT_ADDRESS = 'GYTkz5Jmr1XuMLCtdTeRWTe2PmLNu4siPs5RVaSgusCP';

/** The Arweave URI of the agent's NFT metadata JSON (set after minting) */
export const LILYPAD_AGENT_METADATA_URI = 'https://thelilypad.app/agent-metadata.json';

/** The network the agent was minted on */
export const LILYPAD_AGENT_NETWORK = 'solana-mainnet' as const;
