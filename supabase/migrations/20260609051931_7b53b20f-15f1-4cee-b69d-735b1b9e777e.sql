-- Tighten realtime.messages so only authenticated users can subscribe/broadcast,
-- and remove the legacy public storage policy on the shop-items bucket (already
-- gone in the live policies list, but ensure idempotence).

-- 1. Realtime: require authentication for channel subscriptions and broadcasts.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN others THEN
  NULL;
END $$;

DROP POLICY IF EXISTS "Authenticated can read realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated can read realtime messages"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can send realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated can send realtime messages"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 2. Storage: ensure the over-permissive public SELECT policy on shop-items is gone.
DROP POLICY IF EXISTS "Anyone can view shop item files" ON storage.objects;