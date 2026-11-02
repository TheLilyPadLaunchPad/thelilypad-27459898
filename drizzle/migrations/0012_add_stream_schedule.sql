ALTER TABLE public.streams ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone;

COMMENT ON COLUMN public.streams.scheduled_at IS 'Planned start time for a stream announced before it goes live; NULL when the stream starts immediately.';

CREATE INDEX IF NOT EXISTS streams_scheduled_at_idx ON public.streams (scheduled_at) WHERE scheduled_at IS NOT NULL;

DROP POLICY IF EXISTS "Public can view live streams" ON public.streams;

CREATE POLICY "Public can view live, scheduled and finished streams" ON public.streams
  FOR SELECT
  USING (
    is_live = true
    OR scheduled_at IS NOT NULL
    OR ended_at IS NOT NULL
  );