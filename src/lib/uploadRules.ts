/** Shared upload limits for the NFT generators. */
export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;
export const METADATA_MAX_BYTES = 10 * 1024 * 1024;

export const MEDIA_ACCEPT =
  "image/png,image/jpeg,image/gif,image/svg+xml,audio/mpeg,video/mp4,.png,.jpg,.jpeg,.gif,.svg,.mp3,.mp4";
/** Trait layers are composited on a canvas, so only still/animated images apply. */
export const LAYER_ACCEPT = "image/png,image/jpeg,image/gif,image/svg+xml,.png,.jpg,.jpeg,.gif,.svg";
export const METADATA_ACCEPT = ".csv,.json,text/csv,application/json";

const MEDIA_EXT = ["png", "jpg", "jpeg", "gif", "svg", "mp3", "mp4"];
const LAYER_EXT = ["png", "jpg", "jpeg", "gif", "svg"];

const ext = (f: File) => f.name.split(".").pop()?.toLowerCase() || "";

export function checkMedia(file: File, layerOnly = false): string | null {
  const allowed = layerOnly ? LAYER_EXT : MEDIA_EXT;
  if (!allowed.includes(ext(file)))
    return `${file.name}: use ${layerOnly ? "GIF, JPG, PNG or SVG" : "GIF, JPG, MP3, MP4, PNG or SVG"}`;
  if (file.size > MEDIA_MAX_BYTES) return `${file.name} is over 50 MB`;
  return null;
}

export function checkMetadataFile(file: File): string | null {
  if (!["csv", "json"].includes(ext(file))) return `${file.name}: use CSV or JSON`;
  if (file.size > METADATA_MAX_BYTES) return `${file.name} is over 10 MB`;
  return null;
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** OpenSea-style bulk metadata CSV: one row per token, one column per trait type. */
export function buildOpenSeaCsv(
  rows: {
    tokenId: number;
    name: string;
    description: string;
    fileName: string;
    externalUrl?: string;
    attributes: { trait_type: string; value: string }[];
  }[]
): string {
  const traitTypes = Array.from(new Set(rows.flatMap((r) => r.attributes.map((a) => a.trait_type))));
  const header = ["tokenID", "name", "description", "file_name", "external_url", ...traitTypes.map((t) => `attributes[${t}]`)];
  const lines = rows.map((r) => {
    const map = new Map(r.attributes.map((a) => [a.trait_type, a.value]));
    return [r.tokenId, r.name, r.description, r.fileName, r.externalUrl || "", ...traitTypes.map((t) => map.get(t) || "")]
      .map(csvCell)
      .join(",");
  });
  return [header.map(csvCell).join(","), ...lines].join("\n");
}
