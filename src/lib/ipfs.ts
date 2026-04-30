/**
 * IPFS Gateway Configuration & Utilities
 *
 * Uses Cloudflare's IPFS gateway as the primary resolver.
 * @see https://developers.cloudflare.com/web3/ipfs-gateway/
 *
 * Cloudflare's gateway is:
 *   • Free — no API key required for reads
 *   • Fast — backed by Cloudflare's edge network (300+ PoPs)
 *   • Reliable — automatic retries & DHT crawling
 *
 * For **uploading** (pinning) content to IPFS, use any pinning service
 * (e.g. `ipfs add`, web3.storage, Filebase) — the gateway only handles reads.
 */

// ── Gateway URLs ──────────────────────────────────────────────────────────────

/** Primary IPFS gateway (ipfs.io — free, no key required) */
export const IPFS_GATEWAY = "https://ipfs.io";

/** Fallback gateways */
export const IPFS_FALLBACK_GATEWAYS = [
    "https://dweb.link",
    "https://w3s.link",
    "https://cf-ipfs.com",
] as const;

/**
 * Resolve an Arweave transaction ID to the canonical arweave.net URL.
 * Irys/Turbo may return gateway.irys.xyz or arweave.net — normalise to arweave.net.
 */
export function arweaveToHttp(uriOrId: string): string {
    if (!uriOrId) return "";
    if (uriOrId.startsWith("https://arweave.net/")) return uriOrId;
    if (uriOrId.startsWith("https://gateway.irys.xyz/")) {
        return uriOrId.replace("https://gateway.irys.xyz/", "https://arweave.net/");
    }
    if (uriOrId.startsWith("https://devnet.irys.xyz/")) {
        return uriOrId.replace("https://devnet.irys.xyz/", "https://arweave.net/");
    }
    // Bare TX ID (43-char base64url)
    if (/^[a-zA-Z0-9_-]{43}$/.test(uriOrId)) {
        return `https://arweave.net/${uriOrId}`;
    }
    return uriOrId;
}

// ── Converters ────────────────────────────────────────────────────────────────

/**
 * Convert an `ipfs://` URI to an HTTP gateway URL.
 *
 * @example
 *   ipfsToHttp("ipfs://QmXoypiz...")
 *   // => "https://cloudflare-ipfs.com/ipfs/QmXoypiz..."
 *
 *   ipfsToHttp("ipfs://bafybeif.../0.png")
 *   // => "https://cloudflare-ipfs.com/ipfs/bafybeif.../0.png"
 *
 *   ipfsToHttp("https://example.com/image.png")
 *   // => "https://example.com/image.png"  (passthrough)
 */
export function ipfsToHttp(uri: string | null | undefined, gateway = IPFS_GATEWAY): string {
    if (!uri) return "";

    // Already an HTTP URL — pass through
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
        // Rewrite known legacy gateways to Cloudflare if desired
        return rewriteGateway(uri, gateway);
    }

    // ipfs:// protocol
    if (uri.startsWith("ipfs://")) {
        const path = uri.slice("ipfs://".length);
        return `${gateway}/ipfs/${path}`;
    }

    // Bare CID (Qm... or bafy...)
    if (uri.startsWith("Qm") || uri.startsWith("bafy")) {
        return `${gateway}/ipfs/${uri}`;
    }

    return uri;
}

/**
 * Convert an HTTP gateway URL back to the canonical `ipfs://` URI.
 *
 * @example
 *   httpToIpfs("https://cloudflare-ipfs.com/ipfs/QmXyz.../file.png")
 *   // => "ipfs://QmXyz.../file.png"
 */
export function httpToIpfs(url: string): string {
    if (!url) return "";
    const match = url.match(/\/ipfs\/(.+)$/);
    if (match) return `ipfs://${match[1]}`;
    return url;
}

// ── Internal ──────────────────────────────────────────────────────────────────

/** Rewrite old gateway URLs (Pinata, ipfs.io, etc.) to the preferred gateway */
function rewriteGateway(url: string, preferredGateway: string): string {
    const legacyPatterns = [
        /https?:\/\/gateway\.pinata\.cloud\/ipfs\//,
        /https?:\/\/[^/]+\.mypinata\.cloud\/ipfs\//,
        /https?:\/\/cloudflare-ipfs\.com\/ipfs\//,
        /https?:\/\/dweb\.link\/ipfs\//,
        /https?:\/\/w3s\.link\/ipfs\//,
        /https?:\/\/nftstorage\.link\/ipfs\//,
    ];

    for (const pattern of legacyPatterns) {
        if (pattern.test(url)) {
            return url.replace(pattern, `${preferredGateway}/ipfs/`);
        }
    }

    return url;
}

/**
 * Build a full IPFS directory URL for a collection.
 *
 * @example
 *   buildCollectionImageUrl("bafybeif...", 42)
 *   // => "https://cloudflare-ipfs.com/ipfs/bafybeif.../42.png"
 */
export function buildCollectionImageUrl(cid: string, tokenId: number, ext = "png"): string {
    return `${IPFS_GATEWAY}/ipfs/${cid}/${tokenId}.${ext}`;
}

/**
 * Unified NFT image URL resolver.
 * Handles IPFS (`ipfs://`), Arweave (`ar://`), Irys gateway, and bare CIDs/TX IDs.
 * Use this for any NFT image display to guarantee the URL is browser-fetchable.
 */
export function resolveNftImageUrl(uri: string | null | undefined): string {
    if (!uri) return "";

    // Arweave protocol shorthand
    if (uri.startsWith("ar://")) {
        const txId = uri.slice("ar://".length);
        return `https://arweave.net/${txId}`;
    }

    // Normalise known Arweave/Irys gateways to arweave.net
    const normalised = arweaveToHttp(uri);
    if (normalised !== uri) return normalised;

    // Then handle IPFS
    return ipfsToHttp(uri);
}

/**
 * Build a metadata URL for a token.
 *
 * @example
 *   buildCollectionMetadataUrl("bafybeif...", 42)
 *   // => "https://cloudflare-ipfs.com/ipfs/bafybeif.../42.json"
 */
export function buildCollectionMetadataUrl(cid: string, tokenId: number): string {
    return `${IPFS_GATEWAY}/ipfs/${cid}/${tokenId}.json`;
}
