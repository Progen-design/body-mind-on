-- Příprava dev DB (qfufvsyhlbximanxayci) před db push — profiles chybí v raných migracích.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  daily_email boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);
