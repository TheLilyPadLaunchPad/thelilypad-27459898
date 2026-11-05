// Wallet ownership + payment-recipient helpers shared by purchase functions.
// deno-lint-ignore-file no-explicit-any

export const DEFAULT_SOLANA_TREASURY = "2cS7yyypbtxQ4qBdZRYtXDEDTQJZK34h4RPmXxz4sKHk";

/** Wallet addresses provably linked to the signed-in user (profile + linked wallets). */
export async function getCallerWallets(admin: any, userId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, wallet_address")
    .or(`user_id.eq.${userId},auth_user_id.eq.${userId}`);
  const ids: string[] = [];
  for (const p of profiles ?? []) {
    if (p.wallet_address) out.add(p.wallet_address);
    ids.push(p.id);
  }
  if (ids.length) {
    const { data: linked } = await admin.from("linked_wallets").select("wallet_address").in("profile_id", ids);
    for (const l of linked ?? []) if (l.wallet_address) out.add(l.wallet_address);
  }
  return out;
}

/** App-owned recipients for a shop item: platform treasury plus the item creator's wallets. */
export async function getShopRecipients(admin: any, creatorProfileId: string | null): Promise<Set<string>> {
  const out = new Set<string>([DEFAULT_SOLANA_TREASURY]);
  const envTreasury = Deno.env.get("TREASURY_ADDRESS");
  if (envTreasury) out.add(envTreasury);
  if (creatorProfileId) {
    const { data: p } = await admin.from("user_profiles").select("user_id, wallet_address").eq("id", creatorProfileId).maybeSingle();
    if (p?.wallet_address) out.add(p.wallet_address);
    if (p?.user_id) {
      const { data: pw } = await admin.from("user_payout_wallets").select("payout_wallet_address").eq("user_id", p.user_id);
      for (const w of pw ?? []) if (w.payout_wallet_address) out.add(w.payout_wallet_address);
    }
  }
  return out;
}
