import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface StickerContent {
  id: string;
  file_url: string;
  name: string;
  display_order: number;
  arweave_uri?: string | null;
  metadata_uri?: string | null;
}

interface ShopItem {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  shop_item_contents: StickerContent[];
}

interface PurchasedPack {
  itemId: string;
  name: string;
  category: 'sticker_pack' | 'emoji_pack';
  coverImage: string | null;
  contents: StickerContent[];
}

interface RecentSticker {
  url: string;
  name: string;
  itemId: string;
  usedAt: number;
}

interface UsePurchasedStickersResult {
  stickerPacks: PurchasedPack[];
  emojiPacks: PurchasedPack[];
  recentStickers: RecentSticker[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  addToRecent: (sticker: Omit<RecentSticker, 'usedAt'>) => void;
}

const RECENT_STICKERS_KEY = 'lilypad_recent_stickers';
const MAX_RECENT_STICKERS = 12;

const getStoredRecentStickers = (userId: string): RecentSticker[] => {
  try {
    const stored = localStorage.getItem(`${RECENT_STICKERS_KEY}_${userId}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveRecentStickers = (userId: string, stickers: RecentSticker[]) => {
  try {
    localStorage.setItem(`${RECENT_STICKERS_KEY}_${userId}`, JSON.stringify(stickers));
  } catch (e) {
    console.error('Failed to save recent stickers:', e);
  }
};

export const usePurchasedStickers = (userId: string | null): UsePurchasedStickersResult => {
  const [stickerPacks, setStickerPacks] = useState<PurchasedPack[]>([]);
  const [emojiPacks, setEmojiPacks] = useState<PurchasedPack[]>([]);
  const [recentStickers, setRecentStickers] = useState<RecentSticker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load recent stickers from localStorage
  useEffect(() => {
    if (userId) {
      setRecentStickers(getStoredRecentStickers(userId));
    } else {
      setRecentStickers([]);
    }
  }, [userId]);

  const addToRecent = (sticker: Omit<RecentSticker, 'usedAt'>) => {
    if (!userId) return;
    
    setRecentStickers((prev) => {
      // Remove existing entry if present
      const filtered = prev.filter((s) => s.url !== sticker.url);
      // Add to front with timestamp
      const updated = [{ ...sticker, usedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT_STICKERS);
      saveRecentStickers(userId, updated);
      return updated;
    });
  };

  const fetchPurchasedPacks = useCallback(async () => {
    if (!userId) {
      setStickerPacks([]);
      setEmojiPacks([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch user's purchased items with their contents
      const { data: purchases, error: purchaseError } = await supabase
        .from('shop_purchases')
        .select(`
          item_id,
          shop_items!inner (
            id,
            name,
            category,
            image_url,
            collection_address,
            tree_address,
            shop_item_contents (
              id,
              file_url,
              name,
              display_order,
              arweave_uri,
              metadata_uri
            )
          )
        `)
        .eq('user_id', userId);

      if (purchaseError) throw purchaseError;

      const stickers: PurchasedPack[] = [];
      const emojis: PurchasedPack[] = [];

      purchases?.forEach((purchase) => {
        const item = purchase.shop_items as unknown as ShopItem;
        if (!item) return;

        const pack: PurchasedPack = {
          itemId: item.id,
          name: item.name,
          category: item.category as 'sticker_pack' | 'emoji_pack',
          coverImage: item.image_url,
          contents: (item.shop_item_contents || []).sort(
            (a, b) => a.display_order - b.display_order
          ),
        };

        if (item.category === 'sticker_pack') {
          stickers.push(pack);
        } else if (item.category === 'emoji_pack') {
          emojis.push(pack);
        }
      });

      setStickerPacks(stickers);
      setEmojiPacks(emojis);
    } catch (err) {
      console.error('Error fetching purchased stickers:', err);
      setError('Failed to load stickers');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPurchasedPacks();
  }, [fetchPurchasedPacks]);

  return {
    stickerPacks,
    emojiPacks,
    recentStickers,
    isLoading,
    error,
    refetch: fetchPurchasedPacks,
    addToRecent,
  };
};
