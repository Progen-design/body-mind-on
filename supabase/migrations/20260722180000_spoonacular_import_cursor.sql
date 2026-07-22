-- Pagination cursor for Spoonacular catalog import (per meal type).
CREATE TABLE IF NOT EXISTS public.spoonacular_import_cursor (
  meal_type text PRIMARY KEY,
  next_offset integer NOT NULL DEFAULT 0 CHECK (next_offset >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.spoonacular_import_cursor IS
  'Spoonacular complexSearch offset per meal type; advanced after each successful import batch.';

ALTER TABLE public.spoonacular_import_cursor ENABLE ROW LEVEL SECURITY;

-- Server-side only (service role); no client policies.
