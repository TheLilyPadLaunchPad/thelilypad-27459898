import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Smile, Sticker, Loader2, ShoppingBag, Clock, Sparkles } from 'lucide-react';
import { usePurchasedStickers } from '@/hooks/usePurchasedStickers';
import { useChannelEmotes } from '@/hooks/useChannelEmotes';
import { Link } from 'react-router-dom';
import { availableRecentStickers } from '@/lib/chatInventory';

interface SelectedSticker {
  url: string;
  name: string;
  itemId: string;
}

interface StickerEmojiPickerProps {
  userId: string | null;
  onSelect: (sticker: SelectedSticker) => void;
  disabled?: boolean;
}

export const StickerEmojiPicker = ({ userId, onSelect, disabled = false }: StickerEmojiPickerProps) => {
  const [open, setOpen] = useState(false);
  const { stickerPacks, emojiPacks, emotePacks, recentStickers: storedRecent, isLoading, error, refetch, addToRecent } = usePurchasedStickers(userId);
  const { streamerEmotes, loading: emotesLoading } = useChannelEmotes(userId);
  const recentStickers = availableRecentStickers(storedRecent, [...stickerPacks, ...emojiPacks, ...emotePacks], streamerEmotes);

  const handleSelect = (sticker: SelectedSticker) => {
    if (disabled) return;
    addToRecent(sticker);
    onSelect(sticker);
    setOpen(false);
  };

  const hasStickers = stickerPacks.length > 0;
  const hasEmojis = emojiPacks.length > 0;
  const hasChannelEmotes = streamerEmotes.length > 0;
  const hasEmotes = emotePacks.length > 0;
  const hasRecent = recentStickers.length > 0;
  const hasPacks = hasStickers || hasEmojis || hasChannelEmotes || hasEmotes;
  const isLoadingAny = isLoading || emotesLoading;

  const getDefaultTab = () => {
    if (hasChannelEmotes) return "channel";
    if (hasEmotes) return "emotes";
    if (hasStickers) return "stickers";
    if (hasEmojis) return "emojis";
    return "stickers";
  };

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (nextOpen) refetch(); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 flex-shrink-0"
          disabled={!userId || disabled}
          aria-label="Stickers, emojis and emotes"
          title="Stickers, emojis and emotes"
        >
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-72 p-0" 
        side="top" 
        align="start"
        sideOffset={8}
      >
        {isLoadingAny ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-4 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Couldn’t load your packs.</p>
            <Button variant="outline" size="sm" onClick={refetch}>Try again</Button>
          </div>
        ) : !hasPacks ? (
          <div className="p-4 text-center">
            <Sticker className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">
              No sticker packs yet
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/marketplace" onClick={() => setOpen(false)}>
                <ShoppingBag className="h-4 w-4 mr-2" />
                Browse Marketplace
              </Link>
            </Button>
          </div>
        ) : (
          <Tabs defaultValue={getDefaultTab()} className="w-full">
            <TabsList className="w-full grid grid-cols-4 rounded-none border-b bg-transparent h-10">
              <TabsTrigger 
                value="channel" 
                className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs"
                disabled={!hasChannelEmotes}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Channel
              </TabsTrigger>
              <TabsTrigger 
                value="stickers" 
                className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs"
                disabled={!hasStickers}
              >
                <Sticker className="h-3.5 w-3.5 mr-1" />
                Stickers
              </TabsTrigger>
              <TabsTrigger 
                value="emojis"
                className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs"
                disabled={!hasEmojis}
              >
                <Smile className="h-3.5 w-3.5 mr-1" />
                Emojis
              </TabsTrigger>
              <TabsTrigger value="emotes" className="rounded-none text-xs" disabled={!hasEmotes}>
                Emotes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="emotes" className="mt-0">
              <ScrollArea className="h-64">
                <div className="p-2 space-y-3">
                  {emotePacks.map(pack => (
                    <div key={pack.itemId}>
                      <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5">{pack.name}</p>
                      <div className="grid grid-cols-4 gap-1">
                        {pack.contents.map(emote => (
                          <Button key={emote.id} type="button" variant="ghost" className="aspect-square h-auto p-1" title={emote.name} aria-label={emote.name}
                            onClick={() => handleSelect({ url: emote.file_url, name: emote.name, itemId: pack.itemId })}>
                            <img src={emote.file_url} alt={emote.name} className="w-full h-full object-contain" loading="lazy" />
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="channel" className="mt-0">
              <ScrollArea className="h-64">
                <div className="p-2 space-y-3">
                  {streamerEmotes.map((streamer) => (
                    <div key={streamer.streamerId}>
                      <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5">
                        {streamer.streamerName}
                      </p>
                      <div className="grid grid-cols-5 gap-1">
                        {streamer.emotes.map((emote) => (
                          <button
                            key={emote.id}
                            onClick={() => handleSelect({
                              url: emote.image_url,
                              name: emote.name,
                              itemId: `emote-${emote.id}`,
                            })}
                            className="aspect-square rounded-md hover:bg-accent p-1 transition-colors"
                            title={`:${emote.name}:`}
                          >
                            <img
                              src={emote.image_url}
                              alt={emote.name}
                              className="w-full h-full object-contain"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!hasChannelEmotes && (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">
                        Follow streamers to unlock their custom emotes!
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="stickers" className="mt-0">
              <ScrollArea className="h-64">
                <div className="p-2 space-y-3">
                  {hasRecent && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Recently Used
                      </p>
                      <div className="grid grid-cols-4 gap-1">
                        {recentStickers.map((sticker, index) => (
                          <button
                            key={`recent-${index}`}
                            onClick={() => handleSelect({
                              url: sticker.url,
                              name: sticker.name,
                              itemId: sticker.itemId,
                            })}
                            className="aspect-square rounded-md hover:bg-accent p-1 transition-colors"
                            title={sticker.name}
                          >
                            <img
                              src={sticker.url}
                              alt={sticker.name}
                              className="w-full h-full object-contain"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {stickerPacks.map((pack) => (
                    <div key={pack.itemId}>
                      <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5">
                        {pack.name}
                      </p>
                      <div className="grid grid-cols-4 gap-1">
                        {pack.contents.map((sticker) => (
                          <button
                            key={sticker.id}
                            onClick={() => handleSelect({
                              url: sticker.file_url,
                              name: sticker.name,
                              itemId: pack.itemId,
                            })}
                            className="aspect-square rounded-md hover:bg-accent p-1 transition-colors"
                            title={sticker.name}
                          >
                            <img
                              src={sticker.file_url}
                              alt={sticker.name}
                              className="w-full h-full object-contain"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="emojis" className="mt-0">
              <ScrollArea className="h-64">
                <div className="p-2 space-y-3">
                  {emojiPacks.map((pack) => (
                    <div key={pack.itemId}>
                      <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5">
                        {pack.name}
                      </p>
                      <div className="grid grid-cols-6 gap-1">
                        {pack.contents.map((emoji) => (
                          <button
                            key={emoji.id}
                            onClick={() => handleSelect({
                              url: emoji.file_url,
                              name: emoji.name,
                              itemId: pack.itemId,
                            })}
                            className="aspect-square rounded-md hover:bg-accent p-0.5 transition-colors"
                            title={emoji.name}
                          >
                            <img
                              src={emoji.file_url}
                              alt={emoji.name}
                              className="w-full h-full object-contain"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default StickerEmojiPicker;
