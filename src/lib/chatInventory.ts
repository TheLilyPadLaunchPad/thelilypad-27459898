export type ChatPackCategory = 'sticker_pack' | 'emoji_pack' | 'emote_pack';

export function isChatPackCategory(category: string): category is ChatPackCategory {
  return category === 'sticker_pack' || category === 'emoji_pack' || category === 'emote_pack';
}

export function availableRecentStickers<T extends { itemId: string; url: string }>(
  recent: T[],
  packs: { itemId: string; contents: { file_url: string }[] }[],
  channels: { emotes: { id: string; image_url: string }[] }[],
): T[] {
  const available = new Set([
    ...packs.flatMap(pack => pack.contents.map(content => `${pack.itemId}:${content.file_url}`)),
    ...channels.flatMap(channel => channel.emotes.map(emote => `emote-${emote.id}:${emote.image_url}`)),
  ]);
  return recent.filter(sticker => available.has(`${sticker.itemId}:${sticker.url}`));
}