/**
 * Reown AppKit singleton — initialised once on app boot.
 *
 * Provides a WalletConnect/AppKit modal that can connect users to either:
 *   • EVM-compatible Monad (via the ethers adapter), or
 *   • Solana mainnet (via the solana adapter).
 *
 * This sits alongside the existing native Phantom integration — it does not
 * replace it. Trigger the modal from anywhere by calling `openWalletModal()`
 * or by rendering `<WalletConnectButton />`.
 */

import { createAppKit, type AppKit } from "@reown/appkit";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { solana } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { REOWN_APP_METADATA, REOWN_PROJECT_ID } from "@/config/reown";
import { MONAD_NETWORKS } from "@/config/monad";

// Monad isn't in @reown/appkit/networks yet — define it inline. AppKit
// accepts any object matching the AppKitNetwork shape.
const monadMainnet: AppKitNetwork = {
  id: MONAD_NETWORKS.mainnet.chainId,
  name: MONAD_NETWORKS.mainnet.name,
  nativeCurrency: MONAD_NETWORKS.mainnet.currency,
  rpcUrls: {
    default: { http: [MONAD_NETWORKS.mainnet.url] },
  },
  blockExplorers: {
    default: { name: "Monad Explorer", url: MONAD_NETWORKS.mainnet.explorer },
  },
};

const monadTestnet: AppKitNetwork = {
  id: MONAD_NETWORKS.testnet.chainId,
  name: MONAD_NETWORKS.testnet.name,
  nativeCurrency: MONAD_NETWORKS.testnet.currency,
  rpcUrls: {
    default: { http: [MONAD_NETWORKS.testnet.url] },
  },
  blockExplorers: {
    default: { name: "Monad Testnet Explorer", url: MONAD_NETWORKS.testnet.explorer },
  },
  testnet: true,
};

let appKitInstance: AppKit | null = null;

/** Initialise the AppKit modal. Safe to call multiple times — only inits once. */
export function initReownAppKit(): AppKit {
  if (appKitInstance) return appKitInstance;
  if (typeof window === "undefined") {
    throw new Error("Reown AppKit must be initialised in the browser.");
  }

  appKitInstance = createAppKit({
    adapters: [new EthersAdapter(), new SolanaAdapter()],
    networks: [monadMainnet, monadTestnet, solana],
    defaultNetwork: monadMainnet,
    projectId: REOWN_PROJECT_ID,
    metadata: { ...REOWN_APP_METADATA },
    features: {
      analytics: true,
      email: false,
      socials: false,
    },
    themeMode: "light",
  });

  return appKitInstance;
}

/** Get the live AppKit instance, initialising it on first call. */
export function getReownAppKit(): AppKit {
  return appKitInstance ?? initReownAppKit();
}

/** Open the WalletConnect modal. */
export function openWalletModal(view?: "Connect" | "Account" | "Networks") {
  const kit = getReownAppKit();
  kit.open(view ? { view } : undefined);
}

/** Close the WalletConnect modal. */
export function closeWalletModal() {
  appKitInstance?.close();
}
