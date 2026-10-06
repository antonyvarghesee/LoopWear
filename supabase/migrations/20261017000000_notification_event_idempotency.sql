ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_type_event_id_unique_idx
  ON public.notifications (type, event_id)
  WHERE event_id IS NOT NULL;
