-- Doplnění sloupců body_metrics pro registraci na dev (qfufvsyhlbximanxayci)
ALTER TABLE public.body_metrics ADD COLUMN IF NOT EXISTS dietary_restrictions text;
ALTER TABLE public.body_metrics ADD COLUMN IF NOT EXISTS foods_to_avoid text;
ALTER TABLE public.body_metrics ADD COLUMN IF NOT EXISTS stress_level text;
ALTER TABLE public.body_metrics ADD COLUMN IF NOT EXISTS freq_choice text;
ALTER TABLE public.body_metrics ADD COLUMN IF NOT EXISTS weekly_sessions_user integer;
ALTER TABLE public.body_metrics ADD COLUMN IF NOT EXISTS program text DEFAULT 'START';
ALTER TABLE public.body_metrics ADD COLUMN IF NOT EXISTS notes text;
