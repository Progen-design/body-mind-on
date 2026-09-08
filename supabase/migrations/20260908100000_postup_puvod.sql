-- Puvod postupu receptu — kdo/co ho napsal a kdy.
--
-- 38 % receptu v katalogu (420 z 1104, mereno 8. 9. 2026) melo postup pod
-- laťku kvality (lib/plan/kvalitaPostupu.js): min. 4 kroky, min. 200 znaku,
-- rozkazovaci zpusob, bez vaty typu "Priprav brambory (syrove)."
-- scripts/doplneni-postupu-receptu.mjs tyhle recepty doplni zpetne a MUSI
-- vedet, CO postup napsalo a KDY — jinak nejde odlisit rucne saze
-- (coach_seed_v1), preklad ze Spoonacularu a dopisek timhle skriptem, a pri
-- dalsim mereni by zase nebylo poznat, odkud pochazi.
--
-- Migrace jen PRIDAVA sloupce, nic neprepocitava a nic nemaze. Existujici
-- recepty maji obe pole NULL — puvod jejich postupu (spoonacular_api/
-- coach_seed_v1/llm) uz nese sloupec `source`, tohle je novy zdroj pravdy jen
-- pro postup dopsany/prepsany TIMHLE skriptem.

ALTER TABLE public.recipes_catalog
  ADD COLUMN IF NOT EXISTS instructions_source text,
  ADD COLUMN IF NOT EXISTS instructions_generated_at timestamptz;

COMMENT ON COLUMN public.recipes_catalog.instructions_source IS
  'Puvod textu v instructions_cs, kdyz ho (pre)zapsal scripts/doplneni-postupu-receptu.mjs — napr. "model_gpt4o_metoda" (coach_seed_v1, jedna metoda na skupinu variant) nebo "model_gpt4o_jednotlivy" (ostatni zdroje). NULL = postup pochazi z puvodniho importu/generatoru, nikdy nebyl timhle skriptem dotcen.';
COMMENT ON COLUMN public.recipes_catalog.instructions_generated_at IS
  'Kdy vznikl text v instructions_cs pres scripts/doplneni-postupu-receptu.mjs. NULL stejne jako u instructions_source.';

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_sloupcu integer;
  v_receptu integer;
BEGIN
  SELECT count(*) INTO v_sloupcu FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'recipes_catalog'
    AND column_name IN ('instructions_source', 'instructions_generated_at');
  IF v_sloupcu <> 2 THEN
    RAISE EXCEPTION 'sloupce instructions_source/instructions_generated_at nevznikly (nalezeno %)', v_sloupcu;
  END IF;

  SELECT count(*) INTO v_receptu FROM public.recipes_catalog;
  RAISE NOTICE 'recipes_catalog: % receptu, instructions_source/instructions_generated_at pridany jako NULL.', v_receptu;
END $$;
