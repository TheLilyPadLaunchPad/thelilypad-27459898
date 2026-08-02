import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { buildSrcSet, thumbnailUrl, DEFAULT_WIDTHS } from "@/lib/imageOptimize";

export interface SmartImageProps
    extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "srcSet"> {
    /** Original image URL (already resolved from ipfs:// / ar:// if needed). */
    src?: string | null;
    /** Rendered width hint used to pick the default variant. */
    displayWidth?: number;
    /** Candidate widths for the generated srcSet. */
    widths?: number[];
    /** Compression quality for generated variants (1-100). */
    quality?: number;
    /** Image shown when loading fails. */
    fallbackSrc?: string;
    /** Mark as the LCP image: eager + high priority, no lazy loading. */
    priority?: boolean;
}

/**
 * Drop-in <img> replacement that:
 *  - emits responsive srcSet/sizes (WebP served automatically by the CDN)
 *  - lazy-loads and decodes off the main thread by default
 *  - fades in on load to avoid layout jank
 *  - degrades to the original URL if a transformed variant fails
 */
export const SmartImage: React.FC<SmartImageProps> = ({
    src,
    alt = "",
    displayWidth = 480,
    widths = DEFAULT_WIDTHS,
    quality = 72,
    fallbackSrc = "/placeholder.svg",
    priority = false,
    sizes,
    className,
    onError,
    onLoad,
    ...rest
}) => {
    // "variant" -> optimized srcSet, "raw" -> original URL, "failed" -> fallback
    const [stage, setStage] = useState<"variant" | "raw" | "failed">("variant");
    const [loaded, setLoaded] = useState(false);

    const url = src || "";

    const srcSet = useMemo(
        () => (stage === "variant" ? buildSrcSet(url, widths, quality) : undefined),
        [url, widths, quality, stage],
    );

    const resolvedSrc = useMemo(() => {
        if (!url || stage === "failed") return fallbackSrc;
        if (stage === "raw") return url;
        return thumbnailUrl(url, displayWidth, quality);
    }, [url, displayWidth, quality, stage, fallbackSrc]);

    return (
        <img
            {...rest}
            src={resolvedSrc}
            srcSet={srcSet}
            sizes={sizes ?? `${displayWidth}px`}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            decoding={priority ? "sync" : "async"}
            {...(priority ? { fetchPriority: "high" as const } : {})}
            className={cn(
                "transition-opacity duration-300",
                loaded ? "opacity-100" : "opacity-0",
                className,
            )}
            onLoad={(e) => {
                setLoaded(true);
                onLoad?.(e);
            }}
            onError={(e) => {
                // Optimized variant failed -> retry original -> then placeholder
                setStage((prev) => (prev === "variant" ? "raw" : "failed"));
                if (stage !== "variant") setLoaded(true);
                onError?.(e);
            }}
        />
    );
};

export default SmartImage;
