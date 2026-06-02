-- Add max_editions column to shop_items
ALTER TABLE shop_items 
ADD COLUMN IF NOT EXISTS max_editions INTEGER DEFAULT NULL;

-- Update existing items to be unlimited by default
UPDATE shop_items SET max_editions = NULL WHERE max_editions IS NOT NULL;
