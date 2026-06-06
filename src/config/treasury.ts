// Platform Treasury Configuration for On-Chain Transactions
import { PublicKey } from '@solana/web3.js';

export const PLATFORM_WALLETS = {
  solana: {
    treasury: import.meta.env.VITE_TREASURY_ADDRESS || '2cS7yyypbtxQ4qBdZRYtXDEDTQJZK34h4RPmXxz4sKHk',
    team: 'FuvA3GMUtCjDXJgFJPZnAAru2cmK3fG3dNjBhTXodsFH',
    creator: '5m1ANTPnTsfQCDp8TyDKJYx8BWiEzt1Gomshsc2V3HNe',
    buybackPool: 'CRg5KBtoxtHPmHcGDMiCqPrCLe8edKTiUyaHHowYhyvV',
  },
  monad: {
    treasury: '0x54Ac7Bcaba9A41b701066B7D8b204Ec14b72C96E',
    team: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    creator: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    buybackPool: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  },
} as const;

export function getPlatformWallet(
  wallet: keyof typeof PLATFORM_WALLETS.solana,
  chain: 'solana' | 'monad' = 'solana'
): string {
  return (PLATFORM_WALLETS as any)[chain]?.[wallet] || PLATFORM_WALLETS.solana[wallet];
}

export function getPlatformWalletPubkey(wallet: keyof typeof PLATFORM_WALLETS.solana): PublicKey {
  return new PublicKey(PLATFORM_WALLETS.solana[wallet]);
}

// Platform Treasury Configuration for On-Chain Transactions
export const TREASURY_CONFIG = {
  // Main treasury wallet for receiving platform fees (legacy, use PLATFORM_WALLETS.solana.treasury)
  treasuryWallet: PLATFORM_WALLETS.solana.treasury,
  
  // Fee percentages (in basis points, 100 = 1%)
  fees: {
    // NFT Marketplace (primary direct sales / fixed-price)
    marketplace: {
      platformFee: 200, // 2.0% platform fee on sales (unified)
      creatorRoyalty: 500, // 5% max creator royalty (configurable per collection)
    },

    // Secondary marketplace (resales) — same headline 2.0%
    secondary: {
      platformFee: 200, // 2.0%
      premiumFee: 125,  // 1.25% for sales >= 0.3 SOL
      buybackAllocation: 25, // 0.25%
      teamAllocation: 25,    // 0.25%
    },

    // Shop purchases (stickers, emotes, bundles)
    shop: {
      platformFee: 1000, // 10% platform fee on shop sales
      creatorShare: 9000, // 90% goes to creator
    },

    // Raffles
    raffle: {
      platformFee: 500, // 5% platform fee on raffle entries
      prizePool: 9500, // 95% goes to prize pool
    },

    // Blind boxes
    blindBox: {
      platformFee: 1000, // 10% platform fee
    },

    // Tips/donations
    tips: {
      platformFee: 0, // 0% fee on tips - 100% goes to creator
    },

    // Launchpad/Minting fees (Undercutting LaunchMyNFT - they take 2.5% / 1.5% > 0.3 SOL)
    launchpad: {
      platformFee: 200, // 2.0% platform fee on mints
      premiumFee: 125,  // 1.25% platform fee for mints >= 0.3 SOL
      buybackAllocation: 25, // 0.25% goes to buyback (at 2% total)
      teamAllocation: 25,    // 0.25% goes to team (at 2% total)
    },
  },

  
  // Minimum transaction amounts (in SOL)
  minimums: {
    listing: 0.001,
    offer: 0.001,
    shopPurchase: 0.0001,
    raffleEntry: 0.001,
    blindBox: 0.01,
    tip: 0.001,
    mint: 0.001,
  },
};

// Calculate platform fee from amount
export function calculatePlatformFee(
  amount: number,
  feeType: keyof typeof TREASURY_CONFIG.fees
): number {
  const feeConfig = TREASURY_CONFIG.fees[feeType];
  const feeBps = 'platformFee' in feeConfig ? feeConfig.platformFee : 0;
  return (amount * feeBps) / 10000;
}

// Calculate creator share from amount
export function calculateCreatorShare(
  amount: number,
  feeType: keyof typeof TREASURY_CONFIG.fees
): number {
  const platformFee = calculatePlatformFee(amount, feeType);
  return amount - platformFee;
}

// Get split amounts for a transaction
export function getTransactionSplit(
  amount: number,
  feeType: keyof typeof TREASURY_CONFIG.fees
): { platformAmount: number; creatorAmount: number; total: number } {
  const platformAmount = calculatePlatformFee(amount, feeType);
  const creatorAmount = amount - platformAmount;
  
  return {
    platformAmount,
    creatorAmount,
    total: amount,
  };
}

// Get detailed launchpad fee breakdown
export function getLaunchpadFeeSplit(mintPrice: number): {
  creatorAmount: number;
  treasuryAmount: number;
  teamAmount: number;
  buybackAmount: number;
  total: number;
} {
  const { launchpad } = TREASURY_CONFIG.fees;
  
  // Use tiered fee based on price to undercut competition
  const isPremium = mintPrice >= 0.3;
  const platformFeeBps = isPremium ? launchpad.premiumFee : launchpad.platformFee;
  
  const platformFeeAmount = (mintPrice * platformFeeBps) / 10000;
  
  // Scale allocations proportionately
  const scale = platformFeeBps / launchpad.platformFee;
  const teamAmount = (mintPrice * launchpad.teamAllocation * scale) / 10000;
  const buybackAmount = (mintPrice * launchpad.buybackAllocation * scale) / 10000;
  
  const treasuryAmount = platformFeeAmount - teamAmount - buybackAmount;
  const creatorAmount = mintPrice - platformFeeAmount;
  
  return {
    creatorAmount,
    treasuryAmount,
    teamAmount,
    buybackAmount,
    total: mintPrice,
  };
}

// Validate minimum transaction amount
export function validateMinimumAmount(
  amount: number,
  transactionType: keyof typeof TREASURY_CONFIG.minimums
): { valid: boolean; minimum: number; message?: string } {
  const minimum = TREASURY_CONFIG.minimums[transactionType];
  
  if (amount < minimum) {
    return {
      valid: false,
      minimum,
      message: `Minimum amount is ${minimum} SOL`,
    };
  }
  
  return { valid: true, minimum };
}
