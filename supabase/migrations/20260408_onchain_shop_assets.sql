-- On-Chain Shop Assets Migration
-- Adds columns to support cNFT-backed sticker/emote/emoji packs
-- Each pack gets a Metaplex Core Collection + Bubblegum Tree
-- Each sticker image gets a permanent Arweave URI + metadata JSON URI

-- shop_items: add on-chain collection and tree addresses
ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS collection_address TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tree_address TEXT DEFAULT NULL;

COMMENT ON COLUMN shop_items.collection_address IS 'Metaplex Core Collection address for on-chain cNFT pack';
COMMENT ON COLUMN shop_items.tree_address IS 'Bubblegum Merkle Tree address for compressed NFT minting';

-- shop_item_contents: add Arweave URIs for permanent on-chain storage
ALTER TABLE shop_item_contents
  ADD COLUMN IF NOT EXISTS arweave_uri TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS metadata_uri TEXT DEFAULT NULL;

COMMENT ON COLUMN shop_item_contents.arweave_uri IS 'Permanent Arweave image URI (Irys gateway)';
COMMENT ON COLUMN shop_item_contents.metadata_uri IS 'Permanent Arweave metadata JSON URI for cNFT minting';

-- Index for quick lookup of on-chain packs
CREATE INDEX IF NOT EXISTS idx_shop_items_collection_address
  ON shop_items (collection_address) WHERE collection_address IS NOT NULL;
