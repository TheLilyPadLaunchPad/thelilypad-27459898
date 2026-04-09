import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/** Serializable subset of wizard state that can be saved to localStorage */
export interface DraftCollectionData {
    name: string;
    symbol: string;
    description: string;
    royaltyPercent: number;
    targetSupply: number;
    mode: 'basic' | 'advanced' | '1of1' | 'music';
    currentStep: number;
    treasuryWallet: string;
    phases: any[];
    /** Cover image URL from storage (not data URL) */
    coverImageUrl?: string;
    /** Edition counts for 1/1 mode */
    editionCounts?: Record<string, number>;
    /** Folder asset names (for display, files must be re-uploaded) */
    folderAssetNames?: string[];
    /** Artwork metadata (without file blobs) */
    artworkMeta?: { name: string; description?: string; attributes?: any[] }[];
    /** ISO timestamp of last save */
    savedAt: string;
}

const DRAFT_PREFIX = 'lilypad_draft_';
const DRAFT_BUCKET = 'collection-drafts';

function getDraftKey(chain: string, type: string): string {
    return `${DRAFT_PREFIX}${chain}_${type}`;
}

function getDraftStoragePath(chain: string, type: string): string {
    return `drafts/${chain}_${type}`;
}

/**
 * Upload the cover image to the collection-drafts bucket.
 * Returns the public URL on success, null on failure.
 */
async function uploadDraftCover(
    chain: string,
    type: string,
    file: File | Blob
): Promise<string | null> {
    const path = `${getDraftStoragePath(chain, type)}/cover`;
    try {
        const { error } = await supabase.storage
            .from(DRAFT_BUCKET)
            .upload(path, file, { upsert: true });
        if (error) {
            console.warn('[draft] Cover upload failed:', error.message);
            return null;
        }
        const { data } = supabase.storage.from(DRAFT_BUCKET).getPublicUrl(path);
        return data.publicUrl;
    } catch (err) {
        console.warn('[draft] Cover upload error:', err);
        return null;
    }
}

/**
 * Upload folder assets to collection-drafts bucket for persistence.
 * Returns array of { name, url } on success.
 */
async function uploadDraftAssets(
    chain: string,
    type: string,
    assets: { name: string; file: File }[]
): Promise<{ name: string; url: string }[]> {
    const basePath = `${getDraftStoragePath(chain, type)}/assets`;
    const results: { name: string; url: string }[] = [];

    // Upload in batches of 5
    const batchSize = 5;
    for (let i = 0; i < assets.length; i += batchSize) {
        const batch = assets.slice(i, i + batchSize);
        const uploads = await Promise.allSettled(
            batch.map(async (asset) => {
                const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const path = `${basePath}/${safeName}`;
                const { error } = await supabase.storage
                    .from(DRAFT_BUCKET)
                    .upload(path, asset.file, { upsert: true });
                if (error) throw error;
                const { data } = supabase.storage.from(DRAFT_BUCKET).getPublicUrl(path);
                return { name: asset.name, url: data.publicUrl };
            })
        );
        for (const result of uploads) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            }
        }
    }
    return results;
}

/**
 * Clean up draft assets from storage bucket.
 */
async function cleanupDraftStorage(chain: string, type: string) {
    const basePath = getDraftStoragePath(chain, type);
    try {
        const { data: files } = await supabase.storage
            .from(DRAFT_BUCKET)
            .list(basePath, { limit: 1000 });
        if (files?.length) {
            await supabase.storage
                .from(DRAFT_BUCKET)
                .remove(files.map(f => `${basePath}/${f.name}`));
        }
        // Also clean assets subfolder
        const { data: assetFiles } = await supabase.storage
            .from(DRAFT_BUCKET)
            .list(`${basePath}/assets`, { limit: 1000 });
        if (assetFiles?.length) {
            await supabase.storage
                .from(DRAFT_BUCKET)
                .remove(assetFiles.map(f => `${basePath}/assets/${f.name}`));
        }
    } catch {
        // ignore cleanup errors
    }
}

/**
 * Hook for auto-saving and restoring draft collection wizard state.
 * Persists text/config state to localStorage and images to Supabase storage.
 */
export function useDraftCollection(chain: string, type: string) {
    const draftKey = getDraftKey(chain, type);
    const [hasDraft, setHasDraft] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Check if a draft exists on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(draftKey);
            setHasDraft(!!stored);
        } catch {
            setHasDraft(false);
        }
    }, [draftKey]);

    /** Load a saved draft (returns null if none exists) */
    const loadDraft = useCallback((): DraftCollectionData | null => {
        try {
            const stored = localStorage.getItem(draftKey);
            if (!stored) return null;
            const data = JSON.parse(stored) as DraftCollectionData;
            return data;
        } catch {
            return null;
        }
    }, [draftKey]);

    /** Save the current wizard state (debounced internally) */
    const saveDraft = useCallback(
        (data: Omit<DraftCollectionData, 'savedAt'>) => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                try {
                    const payload: DraftCollectionData = {
                        ...data,
                        savedAt: new Date().toISOString(),
                    };
                    localStorage.setItem(draftKey, JSON.stringify(payload));
                    setHasDraft(true);
                } catch (err) {
                    console.warn('[draft] Failed to save:', err);
                }
            }, 800); // 800ms debounce
        },
        [draftKey],
    );

    /** Upload cover image to draft storage and return URL */
    const saveDraftCover = useCallback(
        async (file: File | Blob): Promise<string | null> => {
            return uploadDraftCover(chain, type, file);
        },
        [chain, type],
    );

    /** Upload folder assets to draft storage */
    const saveDraftAssets = useCallback(
        async (assets: { name: string; file: File }[]): Promise<{ name: string; url: string }[]> => {
            return uploadDraftAssets(chain, type, assets);
        },
        [chain, type],
    );

    /** Clear the draft (e.g. after successful deploy) */
    const clearDraft = useCallback(() => {
        try {
            localStorage.removeItem(draftKey);
            setHasDraft(false);
            // Clean up storage in background
            cleanupDraftStorage(chain, type);
        } catch {
            // ignore
        }
    }, [draftKey, chain, type]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return { hasDraft, loadDraft, saveDraft, saveDraftCover, saveDraftAssets, clearDraft };
}
