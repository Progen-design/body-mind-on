-- Jednotný zdroj pravdy pro počet "hlavních" surovin (bez koření/oleje/vody/cukru)
CREATE OR REPLACE FUNCTION public.count_main_ingredients(p_ingredients jsonb)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(COUNT(*) FILTER (
    WHERE lower(extensions.unaccent(i->>'name')) NOT IN (
      'sul','pepr','olej','olivovy olej','voda','cukr','mlety pepr','morska sul',
      'bazalka','oregano','tymian','kmin','skorice','kurkuma','koriandr','petrzel',
      'cesnek','jedla soda','prasek do peciva','vanilkovy extrakt','ocet')
  ), 0)::int
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_ingredients) = 'array' THEN p_ingredients ELSE '[]'::jsonb END
  ) AS i;
$$;

-- Trigger: recept s více než 6 hlavními surovinami nesmí být aktivní.
-- Karanténa (active=false), nikdy nemaže data -> bezpečné a reverzibilní.
CREATE OR REPLACE FUNCTION public.enforce_recipe_catalog_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.active IS TRUE AND public.count_main_ingredients(NEW.ingredients) > 6 THEN
    NEW.active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_recipe_catalog_rules ON public.recipes_catalog;
CREATE TRIGGER trg_enforce_recipe_catalog_rules
BEFORE INSERT OR UPDATE ON public.recipes_catalog
FOR EACH ROW EXECUTE FUNCTION public.enforce_recipe_catalog_rules();;
