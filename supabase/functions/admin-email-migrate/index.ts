// One-time maintenance: moves the existing admin account to a new email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ONE_TIME_KEY = "lp-admin-move-7f3c91e2b84d";
const ADMIN_ID = "6a82cbad-5ebc-43f8-8f84-cd81e85c6e16";
const NEW_EMAIL = "fxxkyallonsol@gmail.com";

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body?.key !== ONE_TIME_KEY) return new Response("forbidden", { status: 403 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await sb.auth.admin.updateUserById(ADMIN_ID, { email: NEW_EMAIL, email_confirm: true });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const redirectTo = body?.redirectTo || "https://th3lilypad.com/admin/reset-password";
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { error: e2 } = await anon.auth.resetPasswordForEmail(NEW_EMAIL, { redirectTo });
  return new Response(JSON.stringify({ ok: true, resetError: e2?.message ?? null }));
});
