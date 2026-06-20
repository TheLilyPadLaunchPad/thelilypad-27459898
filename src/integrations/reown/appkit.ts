/**
 * Reown AppKit singleton — initialised ONCE on app boot.
 *
 * IMPORTANT: There must be exactly one `createAppKit()` call in the entire
 * app. Calling it twice triggers the runtime warning:
 *   "WalletConnect Core is already initialized … Init() was called 2 times."
 * and causes pairing / session bugs. All other modules (including the
 * React hooks from `@reown/appkit/react`) read from this same singleton.
 *
 * Adapters: Ethers (Monad EVM) + Solana (web3.js).
 * Trigger the modal via `openWalletModal()` or `<WalletConnectButton />`.
 */

import { createAppKit, type AppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { solana, solanaTestnet, solanaDevnet } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { REOWN_APP_METADATA, REOWN_PROJECT_ID } from "@/config/reown";
import { MONAD_NETWORKS } from "@/config/monad";

const monadMainnet: AppKitNetwork = {
  id: MONAD_NETWORKS.mainnet.chainId,
  name: MONAD_NETWORKS.mainnet.name,
  nativeCurrency: MONAD_NETWORKS.mainnet.currency,
  rpcUrls: { default: { http: [MONAD_NETWORKS.mainnet.url] } },
  blockExplorers: {
    default: { name: "Monad Explorer", url: MONAD_NETWORKS.mainnet.explorer },
  },
};

const monadTestnet: AppKitNetwork = {
  id: MONAD_NETWORKS.testnet.chainId,
  name: MONAD_NETWORKS.testnet.name,
  nativeCurrency: MONAD_NETWORKS.testnet.currency,
  rpcUrls: { default: { http: [MONAD_NETWORKS.testnet.url] } },
  blockExplorers: {
    default: { name: "Monad Testnet Explorer", url: MONAD_NETWORKS.testnet.explorer },
  },
  testnet: true,
};

// Module-scope guard. Vite HMR can re-evaluate this module; the guard
// prevents a second createAppKit() call when that happens. We also stash
// the instance on globalThis so a duplicate copy of this module (rare,
// but possible via mixed import paths) still shares the singleton.
const globalKey = "__lilypad_reown_appkit__" as const;
type GlobalWithKit = typeof globalThis & { [globalKey]?: AppKit };
let appKitInstance: AppKit | null =
  (typeof globalThis !== "undefined" && (globalThis as GlobalWithKit)[globalKey]) || null;

export function initReownAppKit(): AppKit {
  if (appKitInstance) return appKitInstance;
  if (typeof window === "undefined") {
    throw new Error("Reown AppKit must be initialised in the browser.");
  }

  appKitInstance = createAppKit({
    adapters: [new EthersAdapter(), new SolanaAdapter()],
    networks: [monadMainnet, monadTestnet, solana, solanaTestnet, solanaDevnet],
    defaultNetwork: solana,
    projectId: REOWN_PROJECT_ID,
    metadata: { ...REOWN_APP_METADATA, icons: [...REOWN_APP_METADATA.icons] },
    features: {
      analytics: true,
      email: false,
      socials: false,
    },
    themeMode: "light",
  });

  (globalThis as GlobalWithKit)[globalKey] = appKitInstance;
  return appKitInstance;
}

export function getReownAppKit(): AppKit {
  return appKitInstance ?? initReownAppKit();
}

export function openWalletModal(view?: "Connect" | "Account" | "Networks") {
  const kit = getReownAppKit();
  kit.open(view ? { view } : undefined);
}

export function closeWalletModal() {
  appKitInstance?.close();
}
