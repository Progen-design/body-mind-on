-- Doplňkové sloupce pro /api/profile na dev preview
ALTER TABLE public.user_habits ADD COLUMN IF NOT EXISTS is_positive boolean DEFAULT true;
ALTER TABLE public.user_habits ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.ai_tasks ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.ai_tasks ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 0;
ALTER TABLE public.ai_tasks ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE public.ai_tasks ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE public.ai_generated_plans ADD COLUMN IF NOT EXISTS plan_html text;
ALTER TABLE public.ai_generated_plans ADD COLUMN IF NOT EXISTS generated_by text;
ALTER TABLE public.ai_generated_plans ADD COLUMN IF NOT EXISTS plan_type text;
ALTER TABLE public.ai_generated_plans ADD COLUMN IF NOT EXISTS valid_from date;
ALTER TABLE public.ai_generated_plans ADD COLUMN IF NOT EXISTS valid_until date;
ALTER TABLE public.ai_generated_plans ADD COLUMN IF NOT EXISTS daily_calories integer;
ALTER TABLE public.ai_generated_plans ADD COLUMN IF NOT EXISTS macros jsonb;
