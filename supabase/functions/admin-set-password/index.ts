// One-time maintenance: verifies the admin password from the ADMIN_NEW_PASSWORD secret signs in.
import { createClient } from "npm:@supabase/supabase-js@2";

const ONE_TIME_KEY = "lp-admin-pw-4b9e2d71c0a8";

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body?.key !== ONE_TIME_KEY) return new Response("forbidden", { status: 403 });
  const password = Deno.env.get("ADMIN_NEW_PASSWORD") ?? "";
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email: "fxxkyallonsol@gmail.com", password });
  if (error) return new Response(JSON.stringify({ signIn: false, error: error.message }));
  const { data: role } = await anon.from("user_roles").select("role")
    .eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
  await anon.auth.signOut();
  return new Response(JSON.stringify({ signIn: true, admin: !!role }));
});
