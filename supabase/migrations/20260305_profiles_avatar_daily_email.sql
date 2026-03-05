-- Sloupce avatar_url a daily_email v profiles (pro ukládání avataru a nastavení denního e-mailu)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_email boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN public.profiles.avatar_url IS 'URL avataru uživatele (Supabase Storage nebo externí)';
COMMENT ON COLUMN public.profiles.daily_email IS 'true = posílat denní digest e-mailem, false = neposílat';
