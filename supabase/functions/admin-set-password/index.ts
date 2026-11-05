// One-time maintenance: sets the admin password from the ADMIN_NEW_PASSWORD secret.
import { createClient } from "npm:@supabase/supabase-js@2";

const ONE_TIME_KEY = "lp-admin-pw-4b9e2d71c0a8";
const ADMIN_ID = "6a82cbad-5ebc-43f8-8f84-cd81e85c6e16";

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body?.key !== ONE_TIME_KEY) return new Response("forbidden", { status: 403 });
  const password = Deno.env.get("ADMIN_NEW_PASSWORD") ?? "";
  if (password.length < 8) return new Response(JSON.stringify({ error: "too short" }), { status: 400 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await sb.auth.admin.updateUserById(ADMIN_ID, { password, email_confirm: true });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, email: data.user?.email }));
});
