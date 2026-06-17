/**
 * Joey Wallet Configuration for XRPL WalletConnect integration
 */

import type { Config } from '@joey-wallet/wc-client';
import core from '@joey-wallet/wc-client/core';

const chains = core.constants.chains;

export const joeyWalletConfig: Config = {
  /**
   * WalletConnect Project ID from Reown Cloud
   * @see https://cloud.reown.com
   */
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'YOUR_WALLETCONNECT_PROJECT_ID',
  
  /**
   * Enhanced namespaces for the provider communication
   * Client needs a little more information for the chain information required by AppKit
   * Defaults to xrpl namespace
   */
  namespaces: chains.xrplNamespace,
  
  /**
   * Default chain for connection - set to active chain on initialization
   * If the network is changed, a new chain will need to be set (ie. setActive)
   * Defaults to first detected chain in namespaces
   */
  defaultChain: chains.xrpl.testnet.id, // Default to testnet for safety
  
  /**
   * Wallet details for the preferred wallets for the modal and other interactions
   * Client required more information for deeplinking optimizations
   * Joey wallet will be included in this list if not provided
   */
  walletDetails: [{
    name: 'Joey Wallet',
    projectId: 'd9f5432e932c6fad8e19a0cea9d4a3372a84aed16e98a52e6655dd2821a63404',
    deeplinkFormat: 'joey://settings/wc?uri=',
  }],
  
  /**
   * Enable logging for troubleshooting.
   * @default false
   */
  verbose: import.meta.env.DEV, // Enable debug logging in development
  
  /**
   * Configure session data persistence.
   * The client uses persists session data using IndexDB
   * @default undefined
   */
  storage: {
    enabled: true, // Persist session data
    custom: null, // Optional: Custom storage implementation
  },
  
  /**
   * Project metadata for connection details - shown within the WalletKit
   * @see https://cloud.reown.com
   */
  metadata: {
    name: 'The Lily Pad',
    description: 'Multi-chain NFT Launchpad & Marketplace for Solana, XRPL, and Monad',
    url: 'https://thelilypad.io',
    icons: ['https://thelilypad.io/icon.png'],
    redirect: {
      universal: 'https://thelilypad.io',
    },
  },
} as Config;
