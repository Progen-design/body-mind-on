-- Post-import catalog integrity checks (run after cron import-spoonacular).
--
-- Supabase SQL Editor: paste and run on project ipfyavvmmxmsjupmfnes.
-- Supabase CLI:  supabase db execute --file scripts/verify-catalog-after-import.sql
-- MCP (agent):   execute_sql with this file contents.
--
-- Expected: chyba_slozite = 0, overenych >= 217, chyba_anglicky_typ = 0

-- Active recipes must not exceed 6 main ingredients (DB gate parity):
SELECT count(*) AS chyba_slozite
FROM recipes_catalog
WHERE active AND public.count_main_ingredients(ingredients) > 6;

-- Verified nutrition rows must not drop below baseline:
SELECT count(*) AS overenych
FROM recipes_catalog
WHERE nutrition_source = 'computed_from_ingredients';

-- meal_type must stay Czech-only:
SELECT count(*) AS chyba_anglicky_typ
FROM recipes_catalog
WHERE meal_type NOT IN ('snidane', 'obed', 'vecere', 'svacina');
