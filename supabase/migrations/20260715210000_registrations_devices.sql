-- Optional smart-device interest captured at registration (not a connection).
-- Allowed values: 'scale' | 'watch'. NULL = not stated.

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS devices text[];

ALTER TABLE public.body_metrics
  ADD COLUMN IF NOT EXISTS devices text[];

COMMENT ON COLUMN public.registrations.devices IS
  'Optional device interest at signup: scale | watch. NULL = not stated. Connection happens later in profile.';

COMMENT ON COLUMN public.body_metrics.devices IS
  'Optional device interest at signup: scale | watch. NULL = not stated. Used to highlight connect UI in profile.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'registrations_devices_allowed'
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_devices_allowed
      CHECK (
        devices IS NULL
        OR devices <@ ARRAY['scale', 'watch']::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'body_metrics_devices_allowed'
  ) THEN
    ALTER TABLE public.body_metrics
      ADD CONSTRAINT body_metrics_devices_allowed
      CHECK (
        devices IS NULL
        OR devices <@ ARRAY['scale', 'watch']::text[]
      );
  END IF;
END $$;
