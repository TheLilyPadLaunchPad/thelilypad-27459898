/**
 * Joey Wallet Connection Utility for XRPL
 * Handles WalletConnect integration with Joey Wallet for XRPL
 */

import { joeyWalletConfig } from '@/config/joeyWallet';
import core from '@joey-wallet/wc-client/core';

let providerInstance: any = null;
let providerPromise: Promise<any> | null = null;

/**
 * Initialize Joey Wallet provider
 */
export async function initJoeyWalletProvider() {
  if (providerInstance) {
    return providerInstance;
  }

  if (providerPromise) {
    return providerPromise;
  }

  providerPromise = (async () => {
    try {
      const advanced: any = await import('@joey-wallet/wc-client/react');
      const { Provider } = (advanced.default || advanced) as any;
      const provider = new Provider(joeyWalletConfig);
      providerInstance = provider;
      return provider;
    } catch (error) {
      console.error('Failed to initialize Joey Wallet provider:', error);
      throw error;
    }
  })();

  return providerPromise;
}

/**
 * Connect to Joey Wallet using WalletConnect
 */
export async function connectJoeyWallet() {
  try {
    const provider = await initJoeyWalletProvider();
    
    // Connect using WalletConnect through the provider
    if (provider.connect) {
      const session = await provider.connect();
      return {
        address: session?.accounts?.[0]?.replace('xrpl:', '') || '',
        chainId: session?.chainId || 'xrpl:testnet',
        session,
      };
    } else {
      // Fallback to using core methods
      const session = await (core as any).methods.connect({ provider });
      return {
        address: session?.accounts?.[0]?.replace('xrpl:', '') || '',
        chainId: session?.chainId || 'xrpl:testnet',
        session,
      };
    }
  } catch (error) {
    console.error('Failed to connect to Joey Wallet:', error);
    throw error;
  }
}

/**
 * Disconnect from Joey Wallet
 */
export async function disconnectJoeyWallet() {
  try {
    if (providerInstance) {
      if (providerInstance.disconnect) {
        await providerInstance.disconnect();
      } else {
        await (core as any).methods.disconnect({ provider: providerInstance });
      }
      providerInstance = null;
      providerPromise = null;
    }
  } catch (error) {
    console.error('Failed to disconnect from Joey Wallet:', error);
    throw error;
  }
}

/**
 * Sign transaction using Joey Wallet
 */
export async function signTransactionWithJoey(txJson: any, chainId: string = 'xrpl:testnet') {
  try {
    const provider = await initJoeyWalletProvider();
    
    const result = await (core as any).methods.signTransaction({
      provider,
      chainId,
      request: {
        tx_json: txJson,
        options: { autofill: true, submit: false }, // Don't auto-submit, let app handle it
      },
    });
    
    return result;
  } catch (error) {
    console.error('Failed to sign transaction with Joey Wallet:', error);
    throw error;
  }
}

/**
 * Get current session from Joey Wallet
 */
export async function getJoeyWalletSession() {
  try {
    const provider = await initJoeyWalletProvider();
    
    // Try to get session from provider
    if (provider.session) {
      return {
        session: provider.session,
        accounts: provider.session?.accounts || [],
        chain: provider.session?.chainId || 'xrpl:testnet',
        address: provider.session?.accounts?.[0]?.replace('xrpl:', '') || '',
      };
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get Joey Wallet session:', error);
    return null;
  }
}

/**
 * Check if Joey Wallet is connected
 */
export async function isJoeyWalletConnected(): Promise<boolean> {
  try {
    const session = await getJoeyWalletSession();
    return session !== null && session.address !== '';
  } catch {
    return false;
  }
}
