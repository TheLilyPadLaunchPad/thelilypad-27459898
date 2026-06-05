// Minimal type declarations for the ArConnect / Wander browser extension.
// Full docs: https://docs.wander.app/ and https://docs.arconnect.io/
// We declare only what `arweave/nativeClient.ts` and `useArweaveWallet` use.

declare global {
  interface Window {
    arweaveWallet?: ArConnectAPI;
  }

  interface WindowEventMap {
    arweaveWalletLoaded: CustomEvent;
  }
}

export type ArConnectPermission =
  | "ACCESS_ADDRESS"
  | "ACCESS_PUBLIC_KEY"
  | "ACCESS_ALL_ADDRESSES"
  | "SIGN_TRANSACTION"
  | "ENCRYPT"
  | "DECRYPT"
  | "SIGNATURE"
  | "ACCESS_ARWEAVE_CONFIG"
  | "DISPATCH";

export interface ArConnectAppInfo {
  name: string;
  logo?: string;
}

export interface ArConnectGatewayConfig {
  host: string;
  port: number;
  protocol: "http" | "https";
}

export interface ArConnectDispatchResult {
  id: string;
  type?: "BASE" | "BUNDLED";
}

export interface ArConnectAPI {
  connect: (
    permissions: ArConnectPermission[],
    appInfo?: ArConnectAppInfo,
    gateway?: ArConnectGatewayConfig
  ) => Promise<void>;
  disconnect: () => Promise<void>;
  getActiveAddress: () => Promise<string>;
  getAllAddresses: () => Promise<string[]>;
  getPermissions: () => Promise<ArConnectPermission[]>;
  getArweaveConfig: () => Promise<ArConnectGatewayConfig>;
  // `sign` mutates the tx in place and also returns it.
  sign: (transaction: unknown, options?: unknown) => Promise<unknown>;
  // `dispatch` bundles small txs (<100KB) via the wallet's bundler — preferred
  // for sub-100KB uploads because confirmation is near-instant.
  dispatch: (transaction: unknown) => Promise<ArConnectDispatchResult>;
  signature: (
    data: Uint8Array,
    options?: { name: string; saltLength?: number }
  ) => Promise<Uint8Array>;
}

export {};
