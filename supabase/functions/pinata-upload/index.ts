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

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: jsonHeaders });

const PINATA_BASE = "https://api.pinata.cloud";
const GATEWAY = "https://gateway.pinata.cloud/ipfs/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
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

      // decode base64 → bytes
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

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

    return json({ error: `Unknown kind: ${kind}` }, 400);
  } catch (e: any) {
    console.error("[pinata-upload] error:", e?.message || e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});
