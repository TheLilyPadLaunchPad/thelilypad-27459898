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

/**
 * Pin multiple files sequentially with a progress callback. Each file gets
 * its own CID (not bundled). Used for per-asset image uploads on devnet.
 */
export async function pinFiles(
  files: Array<File | Blob>,
  onProgress?: (completed: number, total: number, status: string) => void,
): Promise<PinResult[]> {
  const out: PinResult[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length, `Pinning image ${i + 1}/${files.length} to IPFS…`);
    const r = await pinFile(files[i]);
    out.push(r);
  }
  onProgress?.(files.length, files.length, `Pinned ${files.length} images to IPFS`);
  return out;
}

export interface PinDirectoryFile {
  /** Filename inside the directory, e.g. "0.json", "0.png". */
  name: string;
  /** Raw bytes or a JSON-serialisable object. */
  content: Blob | ArrayBuffer | Uint8Array | object;
  contentType?: string;
}

/**
 * Pin a set of files as one IPFS directory. Returns the directory CID.
 * Individual files are then reachable at `${ipfsUrl(cid)}/${filename}`.
 * This is the IPFS analog of the Arweave path-manifest pattern in
 * scripts/deploy-cm.ts — gives the Candy Machine a single `$ID$.json` URI
 * template under hidden settings.
 */
export async function pinDirectory(
  files: PinDirectoryFile[],
  name?: string,
): Promise<PinResult> {
  const CHUNK = 0x8000;
  const encoded = await Promise.all(files.map(async (f) => {
    let bytes: Uint8Array;
    let contentType = f.contentType;
    if (f.content instanceof Blob) {
      bytes = new Uint8Array(await f.content.arrayBuffer());
      contentType = contentType || (f.content as Blob).type || "application/octet-stream";
    } else if (f.content instanceof Uint8Array) {
      bytes = f.content;
      contentType = contentType || "application/octet-stream";
    } else if (f.content instanceof ArrayBuffer) {
      bytes = new Uint8Array(f.content);
      contentType = contentType || "application/octet-stream";
    } else {
      const str = JSON.stringify(f.content);
      bytes = new TextEncoder().encode(str);
      contentType = contentType || "application/json";
    }
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    return { name: f.name, contentType, base64: btoa(binary) };
  }));

  const { data, error } = await supabase.functions.invoke("pinata-upload", {
    body: { kind: "directory", name, files: encoded },
  });
  if (error) throw new Error(`Pinata directory pin failed: ${error.message}`);
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
