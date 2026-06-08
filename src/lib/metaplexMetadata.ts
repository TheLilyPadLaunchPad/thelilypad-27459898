/**
 * Shared Metaplex-standard NFT metadata builder.
 *
 * Produces the canonical Metaplex NFT JSON shape:
 *   {
 *     name, symbol?, description, image,
 *     animation_url?, external_url?,
 *     attributes: [{ trait_type, value }],
 *     properties: {
 *       files: [{ uri, type, cdn? }],
 *       category: 'image' | 'video' | 'audio' | 'vr' | 'html' | string,
 *       creators?: [...]
 *     },
 *     collection?, seller_fee_basis_points?, ...passthrough
 *   }
 */

export type MetaplexCategory = 'image' | 'video' | 'audio' | 'vr' | 'html' | string;

export interface MetaplexAttribute {
    trait_type: string;
    value: string | number;
}

export interface MetaplexCreator {
    address: string;
    share: number;
    verified?: boolean;
}

export interface MetaplexFile {
    uri: string;
    type: string;
    cdn?: boolean;
}

export interface BuildMetaplexInput {
    name: string;
    symbol?: string;
    description?: string;
    image: string;
    animationUrl?: string;
    externalUrl?: string;
    attributes?: MetaplexAttribute[];
    /** Extra files beyond the primary image/animation (e.g. thumbnail, preview, glb). */
    extraFiles?: MetaplexFile[];
    /** Override auto-detected category. */
    category?: MetaplexCategory;
    /** Optional MIME hints when extension-based inference is not enough. */
    imageMime?: string;
    animationMime?: string;
    creators?: MetaplexCreator[];
    sellerFeeBasisPoints?: number;
    collection?: { name?: string; family?: string } | string;
    /** Arbitrary extra top-level fields preserved as-is (use sparingly). */
    extra?: Record<string, unknown>;
}

// CDN host suffixes that should get `cdn: true` on file entries.
const CDN_HOSTS = [
    'watch.videodelivery.net',
    'cloudflarestream.com',
    'r2.dev',
    'lovable.app',
    'lovableproject.com',
];

/** Map a MIME type to a Metaplex `properties.category`. */
export function mimeToCategory(mime: string | undefined | null): MetaplexCategory {
    if (!mime) return 'image';
    const m = mime.toLowerCase();
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    if (m.startsWith('model/') || m === 'application/octet-stream+glb') return 'vr';
    if (m === 'text/html' || m === 'application/xhtml+xml') return 'html';
    return 'image';
}

/** Infer a MIME type from a URI/filename extension. Returns fallback when unknown. */
export function inferMime(uri: string | undefined | null, fallback = 'application/octet-stream'): string {
    if (!uri) return fallback;
    const clean = uri.split('?')[0].split('#')[0];
    const ext = clean.includes('.') ? clean.split('.').pop()?.toLowerCase() : undefined;
    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        case 'svg': return 'image/svg+xml';
        case 'avif': return 'image/avif';
        case 'bmp': return 'image/bmp';
        case 'mp4': return 'video/mp4';
        case 'webm': return 'video/webm';
        case 'mov': return 'video/quicktime';
        case 'mp3': return 'audio/mpeg';
        case 'wav': return 'audio/wav';
        case 'flac': return 'audio/flac';
        case 'ogg': return 'audio/ogg';
        case 'aac': return 'audio/aac';
        case 'm4a': return 'audio/mp4';
        case 'glb': return 'model/gltf-binary';
        case 'gltf': return 'model/gltf+json';
        case 'html':
        case 'htm': return 'text/html';
        default: return fallback;
    }
}

/** Mark a file as CDN-served when its host matches the allowlist. */
export function isCdnHost(uri: string): boolean {
    try {
        const host = new URL(uri).host.toLowerCase();
        return CDN_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
    } catch {
        return false;
    }
}

function fileEntry(uri: string, type: string): MetaplexFile {
    return isCdnHost(uri) ? { uri, type, cdn: true } : { uri, type };
}

/**
 * Build a canonical Metaplex NFT metadata object.
 *
 * Always emits `properties.files` (omitting only when empty) and
 * `properties.category` (auto-derived when not supplied).
 */
export function buildMetaplexMetadata(input: BuildMetaplexInput): Record<string, unknown> {
    const {
        name,
        symbol,
        description = '',
        image,
        animationUrl,
        externalUrl,
        attributes,
        extraFiles = [],
        category,
        imageMime,
        animationMime,
        creators,
        sellerFeeBasisPoints,
        collection,
        extra,
    } = input;

    const resolvedImageMime = imageMime || inferMime(image, 'image/png');
    const resolvedAnimationMime = animationUrl
        ? (animationMime || inferMime(animationUrl, 'application/octet-stream'))
        : undefined;

    const files: MetaplexFile[] = [];
    const seen = new Set<string>();

    if (image) {
        files.push(fileEntry(image, resolvedImageMime));
        seen.add(image);
    }
    if (animationUrl && !seen.has(animationUrl)) {
        files.push(fileEntry(animationUrl, resolvedAnimationMime!));
        seen.add(animationUrl);
    }
    for (const f of extraFiles) {
        if (!f?.uri || seen.has(f.uri)) continue;
        const type = f.type || inferMime(f.uri, 'application/octet-stream');
        const entry: MetaplexFile = isCdnHost(f.uri) ? { uri: f.uri, type, cdn: true } : { uri: f.uri, type };
        if (f.cdn) entry.cdn = true;
        files.push(entry);
        seen.add(f.uri);
    }

    // Derive category from the primary media (animation wins for audio/video NFTs).
    const primaryMime = animationUrl ? resolvedAnimationMime : resolvedImageMime;
    const resolvedCategory: MetaplexCategory = category || mimeToCategory(primaryMime);

    const properties: Record<string, unknown> = {
        files,
        category: resolvedCategory,
    };
    if (creators && creators.length > 0) {
        properties.creators = creators.map((c) => ({
            address: c.address,
            share: c.share,
            verified: c.verified ?? false,
        }));
    }

    const out: Record<string, unknown> = {
        name,
        ...(symbol ? { symbol } : {}),
        description,
        image,
        ...(animationUrl ? { animation_url: animationUrl } : {}),
        ...(externalUrl ? { external_url: externalUrl } : {}),
        attributes: attributes ?? [],
        properties,
    };

    if (typeof sellerFeeBasisPoints === 'number') {
        out.seller_fee_basis_points = sellerFeeBasisPoints;
    }
    if (collection) {
        out.collection = typeof collection === 'string' ? { name: collection } : collection;
    }
    if (extra) {
        for (const [k, v] of Object.entries(extra)) {
            if (!(k in out)) out[k] = v;
        }
    }

    return out;
}
