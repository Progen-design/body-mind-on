-- Device interest leads from landing #autopilot (name + device preference)
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS device_preference text;
