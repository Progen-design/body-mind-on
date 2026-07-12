-- Stripe webhook idempotency (server-only, no client access)
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  handler_result text,
  error_message text,
  processing_started_at timestamptz,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON public.stripe_events(processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_events_status
  ON public.stripe_events(status);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stripe_events IS 'Processed Stripe webhook event ids for idempotent handling.';
