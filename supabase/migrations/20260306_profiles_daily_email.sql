-- Opt-out denního e-mailu: sloupec daily_email v profiles (true = posílat, false = neposílat)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_email boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.daily_email IS 'true = posílat denní digest e-mailem, false = neposílat';
