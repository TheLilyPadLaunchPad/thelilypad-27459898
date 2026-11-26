import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyMessage, isAddress } from "npm:viem@2";
import bs58 from "npm:bs58@6";
import { decideWalletLink, validateWalletLinkMessage } from "../_shared/walletLinkPolicy.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function verifySolana(address: string, message: string, signatureB64: string): Promise<boolean> {
  const publicKey = bs58.decode(address);
  if (publicKey.length !== 32) return false;
  const signature = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
  if (signature.length !== 64) return false;
  const key = await crypto.subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify("Ed25519", key, signature, new TextEncoder().encode(message));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer /i, "");
    if (!token) return json({ error: "Sign in first" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: caller, error: callerError } = await admin.auth.getUser(token);
    const user = caller?.user;
    if (callerError || !user || user.is_anonymous || !user.email) return json({ error: "Sign in with your email first" }, 401);

    const { chain, address, message, signature } = await req.json();
    if ((chain !== "solana" && chain !== "evm") || typeof address !== "string" || address.length > 64 ||
        typeof message !== "string" || message.length > 400 || typeof signature !== "string" || signature.length > 300)
      return json({ error: "Invalid request" }, 400);

    const messageError = validateWalletLinkMessage(message, { userId: user.id, wallet: address, now: Date.now() });
    if (messageError) return json({ error: messageError }, 400);

    let valid = false;
    try {
      valid = chain === "solana"
        ? await verifySolana(address, message, signature)
        : isAddress(address) && await verifyMessage({ address, message, signature: signature as `0x${string}` });
    } catch { valid = false; }
    if (!valid) return json({ error: "Signature does not match this wallet" }, 401);

    let { data: walletProfile, error: walletError } = await admin.from("user_profiles")
      .select("id, user_id").eq("wallet_address", address).maybeSingle();
    if (walletError) throw walletError;
    if (!walletProfile && chain === "evm") {
      const { data } = await admin.from("user_profiles").select("id, user_id").ilike("wallet_address", address).limit(1);
      walletProfile = data?.[0] ?? null;
    }
    const { data: mine, error: mineError } = await admin.from("user_profiles")
      .select("wallet_address").eq("user_id", user.id).limit(1);
    if (mineError) throw mineError;

    let ownerIsGuest = false;
    if (walletProfile?.user_id && walletProfile.user_id !== user.id) {
      const { data: owner } = await admin.auth.admin.getUserById(walletProfile.user_id);
      ownerIsGuest = !owner?.user || (owner.user.is_anonymous === true && !owner.user.email);
    }

    const decision = decideWalletLink({
      callerId: user.id,
      walletProfile: walletProfile ? { user_id: walletProfile.user_id, ownerIsGuest } : null,
      callerProfileWallet: mine?.[0]?.wallet_address ?? null,
      wallet: address,
    });

    if (decision === "wallet_taken") return json({ error: "This wallet is already linked to another account." }, 409);
    if (decision === "account_has_other_wallet") return json({ error: "Your account already has a different wallet linked." }, 409);
    if (decision === "claim") {
      let update = admin.from("user_profiles").update({ user_id: user.id }).eq("id", walletProfile!.id);
      // Guard against a concurrent claim changing the owner between read and write.
      update = walletProfile!.user_id === null ? update.is("user_id", null) : update.eq("user_id", walletProfile!.user_id);
      const { data: moved, error: moveError } = await update.select("id");
      if (moveError) throw moveError;
      if (!moved?.length) return json({ error: "This wallet was just linked elsewhere. Please try again." }, 409);
    }
    return json({ status: decision });
  } catch (e) {
    console.error("link-wallet failed", e instanceof Error ? e.message : "unknown");
    return json({ error: "Could not link this wallet. Please try again." }, 500);
  }
});
