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
import { createSolanaSignIn } from './solanaWalletAuth';

export const signInWithSolana = createSolanaSignIn(supabase.auth, supabase);

/** Sign out of Supabase. (Wallet disconnect handled by the caller.) */
export async function signOutSupabase() {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.error("[supabaseWeb3] signOut error:", e);
  }
}
