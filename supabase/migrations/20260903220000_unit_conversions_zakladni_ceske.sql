-- Doplnění chybějících obecných převodů jednotek — docs/DALSI_KROK.md 8.9.
--
-- Změřeno 3. 9.: `unit_conversions` má 76 obecných převodů (ingredient_match
-- IS NULL), ale chybí `kg`, `gram`/`gramy`/`gramů`, `dkg`, `dl`, `kus`.
-- Přitom `kgs`, `l` a `ml` tam jsou — jde o mezery v pokrytí českých textových
-- tvarů, ne o chybějící koncept.
--
-- 'kus'/'kusy'/'kusů' se SCHVÁLNĚ nepřidávají jako obecný převod tady — to je
-- přesně to, co 8.9 zakazuje ("jeden kus lososa a jeden stroužek česneku
-- nejsou stejná gramáž"). Jejich chování ("stejné jako '' a 'ks', dohledat
-- přes ingredient_match") řeší migrace 20260903210000 uvnitř
-- compute_nutrition_for_ingredients, ne řádek v týhle tabulce.
--
-- IDEMPOTENCE: `unit_conversions` má `unique (unit, ingredient_match)`, ale
-- Postgres NEPOVAŽUJE dva NULLy za shodné pro účely unikátního omezení —
-- `ON CONFLICT (unit, ingredient_match) DO NOTHING` by proto u řádků s
-- `ingredient_match = NULL` nikdy nenašel konflikt a při opakovaném spuštění
-- by tiše založil duplicitní řádek. Proto `INSERT ... SELECT ... WHERE NOT
-- EXISTS`, ne `ON CONFLICT`.

INSERT INTO public.unit_conversions (unit, ingredient_match, grams, note)
SELECT v.unit, NULL, v.grams, v.note
FROM (VALUES
  ('kg',        1000::numeric, 'kilogram'),
  ('dkg',       10,            'dekagram'),
  ('dl',        100,           'decilitr'),
  ('gram',      1,             'jednotne cislo'),
  ('gramy',     1,             'mnozne cislo 2-4'),
  ('gramů',     1,             'mnozne cislo 5+'),
  ('gramu',     1,             'bez diakritiky / 2. pad'),
  ('mililitr',  1,             'jednotne cislo'),
  ('mililitrů', 1,             'mnozne cislo 5+'),
  ('mililitru', 1,             'bez diakritiky / 2. pad')
) AS v(unit, grams, note)
WHERE NOT EXISTS (
  SELECT 1 FROM public.unit_conversions uc
  WHERE uc.unit = v.unit AND uc.ingredient_match IS NULL
);

-- ---------------------------------------------------------------------------
-- Kontrola: losos v kg (přesně případ z 3. 9.) teď musí projít.
-- ---------------------------------------------------------------------------
-- POZOR: kontrola se SCHVALNE neptá na `units_unmatched`. Ten sloupec přidává
-- až migrace 20260903210000, která je vědomě odložená
-- (supabase/migrations/_odlozene/). Kdyby na něj tenhle blok sahal, migrace by
-- na produkci spadla na "column units_unmatched does not exist" — a to je
-- přesně ten druh závislosti, který vznikne, když se z hotové řady vyjme
-- prostřední krok. `complete` a shoda kg == 1000 g dokazují totéž.
DO $$
DECLARE
  v_kcal     numeric;
  v_complete boolean;
BEGIN
  SELECT kcal, complete INTO v_kcal, v_complete
  FROM public.compute_nutrition_for_ingredients(
    '[{"name":"losos","amount":1,"unit":"kg"}]'::jsonb);

  IF v_kcal IS NULL THEN
    RAISE EXCEPTION 'losos v kg se porad nespocital po doplneni prevodu.';
  END IF;
  IF v_complete IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'losos v kg ma byt complete=true, je %', v_complete;
  END IF;

  -- kg musi byt presne 1000x vic nez g na stejne surovine.
  DECLARE
    v_kcal_g numeric;
  BEGIN
    SELECT kcal INTO v_kcal_g FROM public.compute_nutrition_for_ingredients(
      '[{"name":"losos","amount":1000,"unit":"g"}]'::jsonb);
    IF v_kcal IS DISTINCT FROM v_kcal_g THEN
      RAISE EXCEPTION '1 kg lososa (%) se neshoduje s 1000 g (%).', v_kcal, v_kcal_g;
    END IF;
  END;

  RAISE NOTICE 'losos v kg spocitan: % kcal, complete=%', v_kcal, v_complete;
END $$;
