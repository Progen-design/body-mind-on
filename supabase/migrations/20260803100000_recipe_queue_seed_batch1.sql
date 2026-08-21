-- Seed dávka č. 1 do fronty generátoru.
--
-- Čísla vycházejí z reálných děr v katalogu k 2. 8. 2026 — aktivní recepty
-- V ČASOVÉM LIMITU SLOTU (relevantní, jakmile se zapne časová podmínka):
--
--   slot      vegan v limitu   cíl   objednat
--   večeře          3           9       +6
--   svačina         4          11       +7
--   snídaně        10          12       +2
--   oběd           10          12       +2
--
-- Proč svačina potřebuje 11 a ne 7: při šesti jídlech denně jsou 3 svačiny
-- × 7 dní = 21 výběrů a MAX_MEAL_USES_PER_WEEK = 2, takže je potřeba aspoň
-- 11 různých. Se čtyřmi to spadne na opakování.
--
-- kcal_min/kcal_max je ZÁKLADNÍ kcal receptu, ne cíl slotu — porce se škálují
-- 0,5-2,0x, takže pásmo 450-700 pokryje cíle zhruba 350-1100 kcal.
--
-- POZOR: vegan položky nemá smysl generovat, dokud nedorazí zbytek slovníku
-- (viz 20260803080000 — chybí cizrna, rostlinná mléka, mandle, kešu, tahini,
-- tempeh, hummus). Proto jsou tady, ale generátor je pustí až po doplnění;
-- do té doby by odpadly na kontrole surovin mimo seznam.

INSERT INTO public.recipe_generation_queue
  (meal_type, diet_tags, kcal_min, kcal_max, max_active_min, pozadovano, priorita, zdroj)
VALUES
  -- nejhorší díra: vegan večeře, 3 v limitu
  ('vecere',  ARRAY['vegan'], 450, 700, 30, 6, 10, 'seed'),
  -- 3 sloty/den × 7 dní při max. 2 použitích = aspoň 11 různých
  ('svacina', ARRAY['vegan'], 150, 320, 15, 7, 10, 'seed'),
  -- svačin do 15 min je 29 celkem, ale na 21 výběrů týdně je to málo
  ('svacina', '{}',           150, 320, 15, 6, 20, 'seed'),
  ('snidane', ARRAY['vegan'], 300, 550, 20, 2, 30, 'seed'),
  ('obed',    ARRAY['vegan'], 450, 700, 30, 2, 30, 'seed')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Kontrola: 5 položek, celkem 23 receptů, a unikátní index drží.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_polozek integer;
  v_receptu integer;
BEGIN
  SELECT count(*), coalesce(sum(pozadovano), 0) INTO v_polozek, v_receptu
  FROM public.recipe_generation_queue WHERE zdroj = 'seed' AND stav = 'pending';

  IF v_polozek <> 5 THEN
    RAISE EXCEPTION 'Seed polozek je %, cekali jsme 5.', v_polozek;
  END IF;
  IF v_receptu <> 23 THEN
    RAISE EXCEPTION 'Objednanych receptu je %, cekali jsme 23.', v_receptu;
  END IF;

  -- Druhý zápis téže specifikace musí spadnout na unikátním indexu.
  BEGIN
    INSERT INTO public.recipe_generation_queue
      (meal_type, diet_tags, kcal_min, kcal_max, pozadovano, priorita, zdroj)
    VALUES ('vecere', ARRAY['vegan'], 450, 700, 1, 10, 'demand');
    RAISE EXCEPTION 'Duplicitni objednavka prosla, cekali jsme unique_violation.';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'Unikatni index drzi.';
  END;
END $$;
