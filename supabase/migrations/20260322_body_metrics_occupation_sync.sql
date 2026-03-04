-- Sjednocení hodnot occupation v body_metrics: canonical hodnoty office_it | manual | teacher_sales.
-- Odstraňuje nekonzistenci (kombinovana) a staré hodnoty (driver, warehouse, ...) pro jednotné UI.

-- 1) kombinovana → teacher_sales (Kombinované)
UPDATE public.body_metrics
SET occupation = 'teacher_sales'
WHERE occupation = 'kombinovana';

-- 2) Ostatní necanonické hodnoty → teacher_sales (Kombinované jako rozumný fallback)
UPDATE public.body_metrics
SET occupation = 'teacher_sales'
WHERE occupation IN ('driver', 'warehouse', 'healthcare', 'gastronomy', 'other');

COMMENT ON COLUMN public.body_metrics.occupation IS 'Canonical: office_it | manual | teacher_sales. Sedavé | Aktivní | Kombinované.';
