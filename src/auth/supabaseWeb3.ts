/**
 * Supabase Web3 (Solana) authentication bridge.
 *
 * Uses `supabase.auth.signInWithWeb3({ chain: 'solana', wallet })` so every
 * authenticated request carries a real Supabase JWT and `auth.uid()` is set
 * server-side (enabling proper RLS).
 *
 * The signing wallet is provided by Reown AppKit's Solana provider — we wrap
 * it in a Wallet-Standard-shaped object so supabase-js can call
 * `wallet.signMessage(encoded)` against it.
 */

import { supabase } from "@/integrations/supabase/client";

const SIGN_IN_STATEMENT =
  "Sign in to The Lily Pad to authenticate with your Solana wallet.";

interface ReownLikeSolanaProvider {
  publicKey?: { toBase58?: () => string; toString: () => string };
  signMessage?: (msg: Uint8Array, encoding?: string) => Promise<Uint8Array | { signature: Uint8Array }>;
}

/**
 * Adapt a Reown/Phantom-style Solana provider into the shape supabase-js
 * expects for `signInWithWeb3` (Wallet Standard `signMessage`-compatible).
 */
function adaptWallet(provider: ReownLikeSolanaProvider) {
  const address = provider.publicKey?.toBase58?.() ?? provider.publicKey?.toString();
  if (!address) throw new Error("Wallet has no publicKey");
  if (typeof provider.signMessage !== "function") {
    throw new Error("Wallet does not support signMessage");
  }
  return {
    address,
    signMessage: async (message: Uint8Array) => {
      const res = await provider.signMessage!(message);
      // Phantom returns { signature }, others return Uint8Array directly
      const signature =
        res instanceof Uint8Array ? res : (res as { signature: Uint8Array }).signature;
      return { signature };
    },
  };
}

/**
 * Sign the user into Supabase using their connected Solana wallet.
 * Idempotent — returns the existing session if it already matches the wallet.
 */
export async function signInWithSolana(
  provider: ReownLikeSolanaProvider,
): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
  try {
    const wallet = adaptWallet(provider);

    // Skip if a Supabase session for this wallet already exists.
    const { data: existing } = await supabase.auth.getSession();
    const existingAddr =
      existing.session?.user?.user_metadata?.address ??
      existing.session?.user?.user_metadata?.wallet_address;
    if (existing.session && existingAddr === wallet.address) {
      return { ok: true, address: wallet.address };
    }

    // If a session exists for a different wallet, sign out first.
    if (existing.session) {
      await supabase.auth.signOut();
    }

    const { data, error } = await (supabase.auth as any).signInWithWeb3({
      chain: "solana",
      statement: SIGN_IN_STATEMENT,
      wallet,
    });

    if (error) {
      console.error("[supabaseWeb3] signInWithWeb3 failed:", error);
      return { ok: false, error: error.message ?? String(error) };
    }

    return { ok: true, address: wallet.address };
  } catch (e: any) {
    console.error("[supabaseWeb3] sign-in error:", e);
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/** Sign out of Supabase. (Wallet disconnect handled by the caller.) */
export async function signOutSupabase() {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.error("[supabaseWeb3] signOut error:", e);
  }
}
