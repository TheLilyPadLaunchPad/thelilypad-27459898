import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ALLOWED_ACTIONS = new Set(["creator_apply", "streamer_apply"]);
const DEFAULT_HOSTS =
  "th3lilypad.com,www.th3lilypad.com,thelilypad.lovable.app,id-preview--4fd2ea79-092f-460b-bf12-127f87e184bc.lovable.app";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false }, 405);

  const secret = Deno.env.get("TURNSTILE_SECRET");
  if (!secret) return json({ success: false, error: "not_configured" }, 500);

  const hosts = new Set(
    (Deno.env.get("TURNSTILE_HOSTNAMES") ?? DEFAULT_HOSTS)
      .split(",").map((h) => h.trim()).filter(Boolean),
  );

  let body: { token?: unknown; action?: unknown };
  try { body = await req.json(); } catch { return json({ success: false }, 400); }
  const { token, action } = body;
  if (
    typeof token !== "string" || token.length === 0 || token.length > 2048 ||
    typeof action !== "string" || !ALLOWED_ACTIONS.has(action)
  ) return json({ success: false }, 400);

  const ip = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  try {
    const params = new URLSearchParams({ secret, response: token });
    if (ip) params.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return json({ success: false }, 403);
    const result = await r.json();
    if (!result.success || result.action !== action || !hosts.has(result.hostname)) {
      return json({ success: false }, 403);
    }
    return json({ success: true });
  } catch {
    return json({ success: false }, 403);
  }
});
