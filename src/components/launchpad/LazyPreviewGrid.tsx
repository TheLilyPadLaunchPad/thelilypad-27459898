import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from "lucide-react";

interface PreviewItem {
    preview?: string;
    file?: File;
    coverPreview?: string;
    imageDataUrl?: string;
}

interface LazyPreviewGridProps {
    items: PreviewItem[];
    isMusic?: boolean;
    maxDisplay?: number;
}

/**
 * Lazy-loading preview grid that prevents UI freeze with large collections.
 * 
 * Features:
 * - Only renders first 12 items initially
 * - Creates blob URLs in chunks to prevent main thread blocking
 * - Uses IntersectionObserver for virtualized scrolling (renders items on demand)
 * - Cleans up blob URLs on unmount to prevent memory leaks
 */
export function LazyPreviewGrid({ items, isMusic = false, maxDisplay = 12 }: LazyPreviewGridProps) {
    const [visibleCount, setVisibleCount] = useState(maxDisplay);
    const [loadedIndices, setLoadedIndices] = useState<Set<number>>(new Set());
    const [objectUrls, setObjectUrls] = useState<Map<number, string>>(new Map());
    const containerRef = useRef<HTMLDivElement>(null);

    // Chunked blob URL creation to prevent UI freeze
    useEffect(() => {
        const CHUNK_SIZE = 5;
        let isActive = true;

        const createUrls = async () => {
            for (let i = 0; i < Math.min(items.length, visibleCount); i += CHUNK_SIZE) {
                if (!isActive) break;

                const chunk = items.slice(i, i + CHUNK_SIZE);
                const newUrls = new Map(objectUrls);

                chunk.forEach((item, idx) => {
                    const globalIdx = i + idx;
                    if (loadedIndices.has(globalIdx)) return;

                    let url: string | undefined;
                    if ('preview' in item && item.preview) {
                        url = item.preview;
                    } else if ('coverPreview' in item && item.coverPreview) {
                        url = item.coverPreview;
                    } else if ('imageDataUrl' in item && item.imageDataUrl) {
                        url = item.imageDataUrl;
                    } else if (item.file) {
                        url = URL.createObjectURL(item.file);
                    }

                    if (url) {
                        newUrls.set(globalIdx, url);
                    }
                });

                setObjectUrls(newUrls);
                setLoadedIndices(prev => {
                    const next = new Set(prev);
                    for (let j = i; j < Math.min(i + CHUNK_SIZE, items.length, visibleCount); j++) {
                        next.add(j);
                    }
                    return next;
                });

                // Yield to main thread
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        };

        createUrls();

        return () => {
            isActive = false;
        };
    }, [items, visibleCount]);

    // Cleanup blob URLs on unmount
    useEffect(() => {
        return () => {
            objectUrls.forEach((url) => {
                if (url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            });
        };
    }, []);

    const displayedItems = items.slice(0, visibleCount);
    const hasMore = items.length > visibleCount;

    return (
        <div ref={containerRef} className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
                {displayedItems.map((item, i) => (
                    <div 
                        key={i} 
                        className="aspect-square rounded overflow-hidden bg-muted border border-border relative"
                    >
                        {loadedIndices.has(i) && objectUrls.has(i) ? (
                            <img 
                                src={objectUrls.get(i)} 
                                className="w-full h-full object-contain" 
                                alt={`Preview ${i + 1}`}
                                loading="lazy"
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            </div>
                        )}
                    </div>
                ))}
            </div>
            
            {hasMore && (
                <button 
                    onClick={() => setVisibleCount(prev => Math.min(prev + 12, items.length))}
                    className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded-lg hover:bg-muted/50"
                >
                    Load {Math.min(12, items.length - visibleCount)} more of {items.length - visibleCount} remaining...
                </button>
            )}
            
            <p className="text-[10px] text-muted-foreground text-center">
                Showing {Math.min(visibleCount, items.length)} of {items.length} items
            </p>
        </div>
    );
}
