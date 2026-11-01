import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isChatPackCategory, availableRecentStickers } from './chatInventory';

test('chat includes purchased stickers, emojis and emotes, not unrelated shop items', () => {
  assert.equal(isChatPackCategory('sticker_pack'), true);
  assert.equal(isChatPackCategory('emoji_pack'), true);
  assert.equal(isChatPackCategory('emote_pack'), true);
  assert.equal(isChatPackCategory('loot_box'), false);
});

test('recent history cannot supply a pack or content absent from current inventory', () => {
  const recent = [{ itemId: 'owned', url: 'valid' }, { itemId: 'owned', url: 'forged' }, { itemId: 'old', url: 'valid' }, { itemId: 'emote-channel', url: 'channel-art' }];
  assert.deepEqual(availableRecentStickers(recent, [{ itemId: 'owned', contents: [{ file_url: 'valid' }] }], [{ emotes: [{ id: 'channel', image_url: 'channel-art' }] }]), [recent[0], recent[3]]);
});