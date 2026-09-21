-- ai_runs.cached_tokens — kolik vstupních tokenů OpenAI účtovalo cachovanou sazbou.
--
-- NEAPLIKUJI tuhle migraci — nasazuje ji až Cowork Claude po review
-- (PROMPT_NAKLADY_MINIMUM.md bod 4).
--
-- PROC. OpenAI automaticky zlevní opakovaný začátek promptu (>= 1 024 tokenu,
-- stejny prefix) a v odpovedi hlasi `usage.prompt_tokens_details.cached_tokens`.
-- `volejModel()` (lib/openai.js) od teď pocita `cost_usd` s cachovanou sazbou
-- a zapisuje pocet cachovanych tokenu, aby report odpovidal dashboardu
-- a dalo se po tydnu overit, ze prehozene poradi vstupu generatoru
-- (staticka cast napred) opravdu zabralo:
--
--   select date_trunc('day', created_at) den,
--          sum(cached_tokens)::float / nullif(sum(input_tokens), 0) as podil_cache
--     from ai_runs where purpose = 'recipe_generation' group by 1 order by 1;
--
-- KOD JE NA CHYBEJICI SLOUPEC PRIPRAVENY: kdyz insert do ai_runs spadne na
-- `cached_tokens`, zapise se ucenka bez nej. Poradi nasazeni proto nehraje roli.
--
-- `openai_daily_usage` se nemeni — cte `cost_usd`, ktery uz cachovanou sazbu nese.
-- RLS: tabulka ji uz ma (server-only, bez politik); novy sloupec ji dedi.

ALTER TABLE public.ai_runs
  ADD COLUMN IF NOT EXISTS cached_tokens integer;

COMMENT ON COLUMN public.ai_runs.cached_tokens IS
  'Cast input_tokens, kterou OpenAI ucetoval cachovanou sazbou (usage.prompt_tokens_details.cached_tokens). NULL u radku starsich nez 21. 9. 2026.';
