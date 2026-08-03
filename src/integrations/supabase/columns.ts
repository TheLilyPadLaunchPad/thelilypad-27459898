/**
 * Column allowlists for tables where sensitive columns are not granted to
 * anon/authenticated at the database level (column-level privileges).
 * Selecting `*` on these tables fails, so always use these lists.
 */
export const PUBLIC_PROFILE_COLUMNS = [
  'id',
  'user_id',
  'wallet_address',
  'display_name',
  'bio',
  'avatar_url',
  'banner_url',
  'avatar_nft_mint',
  'avatar_source',
  'categories',
  'schedule',
  'playlist_ids',
  'is_collector',
  'is_creator',
  'is_streamer',
  'is_verified',
  'is_private',
  'profile_setup_completed',
  'referred_by',
  'social_twitter',
  'social_discord',
  'social_instagram',
  'social_youtube',
  'social_tiktok',
  'verification_attestation',
  'verification_attestation_network',
  'created_at',
  'updated_at',
].join(', ');

export const PUBLIC_CHAT_MESSAGE_COLUMNS = [
  'id',
  'playback_id',
  'user_id',
  'username',
  'message',
  'message_type',
  'sticker_url',
  'sticker_name',
  'sticker_item_id',
  'created_at',
].join(', ');
