/**
 * Responsive image helpers.
 *
 * Generates width-based variants (and WebP where supported) for images that
 * live on a transform-capable origin:
 *   • Lovable Cloud Storage  -> /storage/v1/render/image/public/... (auto WebP)
 *   • Magic Eden CDN         -> ?image_size=<preset>
 *
 * Everything else (IPFS / Arweave / Lovable asset CDN) is returned untouched so
 * the <img> still renders — the component keeps lazy-loading + async decoding.
 */

export const DEFAULT_WIDTHS = [160, 320, 480, 640, 960, 1280];

/** True when the URL points at Lovable Cloud (Supabase) public storage. */
function isCloudStorageUrl(url: string): boolean {
    return /\/storage\/v1\/object\/public\//.test(url);
}

function isMagicEdenUrl(url: string): boolean {
    return /(^|\.)magiceden\.(dev|io)\//.test(url) || url.includes("img-cdn.magiceden.dev");
}

/** Build a single transformed URL at a given width. Returns null when unsupported. */
export function transformImageUrl(
    url: string,
    width: number,
    quality = 72,
): string | null {
    if (!url) return null;

    if (isCloudStorageUrl(url)) {
        const rendered = url.replace(
            "/storage/v1/object/public/",
            "/storage/v1/render/image/public/",
        );
        const sep = rendered.includes("?") ? "&" : "?";
        return `${rendered}${sep}width=${width}&quality=${quality}&resize=cover`;
    }

    if (isMagicEdenUrl(url)) {
        const preset = width <= 200 ? "small" : width <= 600 ? "medium" : "large";
        const sep = url.includes("?") ? "&" : "?";
        return `${url}${sep}image_size=${preset}`;
    }

    return null;
}

/** Can this URL be resized on the fly? */
export function isOptimizable(url: string | null | undefined): boolean {
    if (!url) return false;
    return isCloudStorageUrl(url) || isMagicEdenUrl(url);
}

/**
 * Build a `srcSet` string for the given URL, or undefined when the origin
 * doesn't support transforms.
 */
export function buildSrcSet(
    url: string | null | undefined,
    widths: number[] = DEFAULT_WIDTHS,
    quality = 72,
): string | undefined {
    if (!url || !isOptimizable(url)) return undefined;
    const entries = widths
        .map((w) => {
            const variant = transformImageUrl(url, w, quality);
            return variant ? `${variant} ${w}w` : null;
        })
        .filter(Boolean) as string[];
    return entries.length ? entries.join(", ") : undefined;
}

/** A small, cheap URL suitable for thumbnails / grid cells. */
export function thumbnailUrl(
    url: string | null | undefined,
    width = 480,
    quality = 65,
): string {
    if (!url) return "";
    return transformImageUrl(url, width, quality) ?? url;
}
