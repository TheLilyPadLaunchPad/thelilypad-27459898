// Static "Lily Pad Advantage" values surfaced next to external market data.
// Edit these to change what's compared in the Market Pulse table.

export interface AdvantageMetrics {
  platformFeePct: number; // %
  royaltyEnforced: boolean;
  buybackPct: number; // % of secondary sale that fuels token buyback
  creatorPayoutPct: number; // % share creator keeps on primary
  notes: string[];
}

export const LILY_PAD_ADVANTAGE: AdvantageMetrics = {
  platformFeePct: 2,
  royaltyEnforced: true,
  buybackPct: 5,
  creatorPayoutPct: 85,
  notes: [
    "Creator royalties enforced on-chain",
    "5% of every secondary trade fuels $L3AP buyback",
    "Lower platform fee than Magic Eden / OpenSea",
    "Volume booster — buybacks compound holder value",
  ],
};

// Per-chain comparison rows (used in the AdvantageCell).
export const COMPETITOR_FEES = {
  solana: { name: "Magic Eden", fee: 2, royaltyEnforced: false },
  monad: { name: "Magic Eden", fee: 2, royaltyEnforced: false },
} as const;
