/**
 * Pinata IPFS uploader — DEVNET ONLY.
 *
 * Goes through the `pinata-upload` edge function so the PINATA_JWT secret
 * never touches the browser. Used as the preferred path for collection
 * metadata + assets while testing on Solana devnet. Mainnet still uses
 * Arweave/Irys for permanence.
 */
import { supabase } from "@/integrations/supabase/client";

const GATEWAY = "https://gateway.pinata.cloud/ipfs/";

export interface PinResult {
  cid: string;
  url: string;
}

export function ipfsUrl(cid: string): string {
  return `${GATEWAY}${cid}`;
}

/** Upload a JSON object to IPFS via Pinata. Returns gateway URL + CID. */
export async function pinJson(
  json: Record<string, any>,
  name?: string,
): Promise<PinResult> {
  const { data, error } = await supabase.functions.invoke("pinata-upload", {
    body: { kind: "json", name, json },
  });
  if (error) throw new Error(`Pinata JSON pin failed: ${error.message}`);
  if (!data?.cid) throw new Error("Pinata returned no CID");
  return { cid: data.cid, url: ipfsUrl(data.cid) };
}

/** Upload a File/Blob to IPFS via Pinata. Returns gateway URL + CID. */
export async function pinFile(file: File | Blob, name?: string): Promise<PinResult> {
  const buf = await file.arrayBuffer();
  // base64 encode in chunks to avoid call-stack overflow on big files
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    );
  }
  const b64 = btoa(binary);
  const contentType =
    (file as File).type || "application/octet-stream";
  const filename = name || (file as File).name || `upload-${Date.now()}`;

  const { data, error } = await supabase.functions.invoke("pinata-upload", {
    body: { kind: "file", name: filename, contentType, base64: b64 },
  });
  if (error) throw new Error(`Pinata file pin failed: ${error.message}`);
  if (!data?.cid) throw new Error("Pinata returned no CID");
  return { cid: data.cid, url: ipfsUrl(data.cid) };
}

/** True when the app is currently targeting Solana devnet. */
export function isDevnet(): boolean {
  try {
    const n = localStorage.getItem("solanaNetwork");
    return !n || n === "devnet";
  } catch {
    return false;
  }
}
