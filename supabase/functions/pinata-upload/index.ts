/**
 * Pinata IPFS upload proxy (devnet-only use from the client).
 *
 * Body:
 *   { kind: "json", name?: string, json: object }
 *   { kind: "file", name: string, contentType: string, base64: string }
 *
 * Returns: { cid: string, url: string, size?: number }
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: jsonHeaders });

// Upload limits: media per uploadRules (GIF/JPG/PNG/SVG/WEBP/MP3/MP4, JSON, CSV).
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_DIR_BYTES = 200 * 1024 * 1024;
const MAX_DIR_FILES = 10000;
const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp",
  "audio/mpeg", "audio/mp3", "video/mp4", "application/json", "text/csv",
]);
const decodeB64 = (b64: string): Uint8Array | null => {
  if (!b64 || b64.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 4) return null;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch { return null; }
};
const SAFE_NAME = /^[A-Za-z0-9._-]{1,120}$/;

const PINATA_BASE = "https://api.pinata.cloud";
const GATEWAY = "https://gateway.pinata.cloud/ipfs/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Require an authenticated Supabase user — prevents unauth abuse of the platform Pinata account.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      return json({ error: "Server auth not configured" }, 500);
    }
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const jwt = Deno.env.get("PINATA_JWT");
    if (!jwt) return json({ error: "PINATA_JWT not configured" }, 500);


    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const kind = String(body.kind || "");
    const name = body.name ? String(body.name).slice(0, 120) : undefined;

    if (kind === "json") {
      if (!body.json || typeof body.json !== "object") {
        return json({ error: "Missing 'json' field" }, 400);
      }
      const res = await fetch(`${PINATA_BASE}/pinning/pinJSONToIPFS`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pinataContent: body.json,
          pinataMetadata: name ? { name } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return json({ error: data?.error || "Pinata JSON pin failed", details: data }, res.status);
      }
      const cid = data.IpfsHash;
      return json({ cid, url: `${GATEWAY}${cid}`, size: data.PinSize });
    }

    if (kind === "file") {
      const b64 = String(body.base64 || "");
      const contentType = String(body.contentType || "application/octet-stream");
      const filename = name || `upload-${Date.now()}`;
      if (!b64) return json({ error: "Missing 'base64' field" }, 400);
      if (!ALLOWED_TYPES.has(contentType.toLowerCase())) return json({ error: "File type not allowed" }, 400);
      const bytes = decodeB64(b64);
      if (!bytes || bytes.length > MAX_FILE_BYTES) return json({ error: "File is too large (max 50 MB) or invalid" }, 400);

      const form = new FormData();
      form.append("file", new Blob([bytes], { type: contentType }), filename);
      if (name) form.append("pinataMetadata", JSON.stringify({ name }));

      const res = await fetch(`${PINATA_BASE}/pinning/pinFileToIPFS`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        return json({ error: data?.error || "Pinata file pin failed", details: data }, res.status);
      }
      const cid = data.IpfsHash;
      return json({ cid, url: `${GATEWAY}${cid}`, size: data.PinSize });
    }

    if (kind === "directory") {
      // body.files: [{ name: "0.json", contentType: "application/json", base64: "..." }, ...]
      const files = Array.isArray(body.files) ? body.files : null;
      if (!files || files.length === 0) {
        return json({ error: "Missing 'files' array" }, 400);
      }
      if (files.length > MAX_DIR_FILES) return json({ error: "Too many files" }, 400);
      let total = 0;
      const form = new FormData();
      const folder = (name || `dir-${Date.now()}`).replace(/[^a-zA-Z0-9_.-]/g, "_");
      for (const f of files) {
        const fname = String(f.name || "");
        if (!SAFE_NAME.test(fname) || fname.startsWith(".")) return json({ error: "Invalid file name" }, 400);
        const ct = String(f.contentType || "application/octet-stream");
        if (!ALLOWED_TYPES.has(ct.toLowerCase())) return json({ error: `File type not allowed: ${fname}` }, 400);
        const bytes = decodeB64(String(f.base64 || ""));
        if (!bytes || bytes.length > MAX_FILE_BYTES) return json({ error: `File too large or invalid: ${fname}` }, 400);
        total += bytes.length;
        if (total > MAX_DIR_BYTES) return json({ error: "Upload too large" }, 400);
        const blob = new Blob([bytes], { type: ct });
        // Pinata wraps when files share a top-level folder name
        form.append("file", blob, `${folder}/${fname}`);
      }
      form.append("pinataOptions", JSON.stringify({ wrapWithDirectory: false }));
      form.append("pinataMetadata", JSON.stringify({ name: folder }));

      const res = await fetch(`${PINATA_BASE}/pinning/pinFileToIPFS`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        return json({ error: data?.error || "Pinata directory pin failed", details: data }, res.status);
      }
      const cid = data.IpfsHash;
      return json({ cid, url: `${GATEWAY}${cid}`, size: data.PinSize, fileCount: files.length });
    }

    return json({ error: `Unknown kind: ${kind}` }, 400);
  } catch (e: any) {
    console.error("[pinata-upload] error:", e?.message || e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});
