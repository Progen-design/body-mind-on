-- Dokonceni skalovani Spoonacular receptu na jednu porci.
--
-- ===========================================================================
-- CO JE INVARIANT A KDO HO PORUSUJE
-- ===========================================================================
-- Puvodni hypoteza znela, ze v katalogu koexistuji dve legitimni konvence pole
-- `amount` — Spoonacular na porci, ceske generovane na cely recept — a ze je
-- treba naucit vypocet je rozlisovat. Data ani kod to nepotvrzuji. Je to jinak:
--
-- Projekt ma JEDEN invariant a ma ho zapsany v lib/recipeGeneratorRun.js:210
--   "Katalog drzi kcal NA PORCI a suroviny prepoctene na jednu porci — tak to
--    pro Spoonacular srovnala migrace recovered_spoonacular_scale_to_one_serving
--    a 466 z 516 receptu ma servings = 1."
-- Generator ho aktivne vynucuje: kdyz model vrati vic porci, sam gramaze podeli
-- a zapise servings = 1.
--
-- Rozdeleni podle zdroje to potvrzuje — na cely recept NEJSOU ceske recepty,
-- ale naopak zbytek Spoonacularu:
--   coach_seed_v1  153 receptu, VSECHNY servings = 1
--   meal_cache      30 receptu, VSECHNY servings = 1
--   simple_start    24 receptu, VSECHNY servings = 1
--   llm_generated   23 receptu, VSECHNY servings = 1
--   spoonacular    188 receptu  servings = 1  +  36 receptu servings > 1  <- diry
--
-- Tech 36 jsou pozustatek migrace 20260721231759, ktera skalovani udelala
-- SPRAVNE, ale jen pro hardcoded seznam 13 id (`WHERE r.id IN (31,32,...)`).
-- Na zbytek nedosla a od te doby porusuji invariant.
--
-- ===========================================================================
-- MERENI PRED ZMENOU (aktivni recepty, jen ty s kompletni nutrici)
-- ===========================================================================
--   servings > 1   16 z 36 ma kompletni nutrici, a VSECH 16 ma odchylku > 50 %
--                  median odchylky 359 %, max 878 %
--                  median pomeru suma/ulozene = 4,59
--   servings = 1   median pomeru 1,00; u coach_seed_v1, meal_cache,
--                  simple_start a llm_generated je odchylka presne 0 %
--
-- Pomer sedi na `servings`, coz je ten dukaz. Po vydeleni poctem porci:
--   id 259 servings 4, pomer 3,99 -> odchylka  0 %
--   id 172 servings 4, pomer 4,08 -> odchylka  2 %
--   id 206 servings 8, pomer 8,36 -> odchylka  5 %
--   id 246 servings 6, pomer 5,45 -> odchylka  9 %
-- Zbytkova odchylka je nepresnost samotneho souctu ze surovin (obecne gramaze,
-- chybejici prevody), ne dalsi chyba v konvenci.
--
-- ===========================================================================
-- PROC OPRAVA DAT A NE VYPOCTU
-- ===========================================================================
-- Zadani preferovalo opravu na urovni vypoctu. Tady by byla horsi:
--   * compute_nutrition_for_ingredients(p_ingredients) DOSTAVA JEN SUROVINY.
--     O `servings` nevi a vedet nema — jeho kontrakt je "seclti, co dostanes".
--     Aby delil, musel by se zmenit podpis i vsichni volajici.
--   * lib/mealPortionIngredients.js uz dnes deli amount / servings pri
--     zobrazeni. Po normalizaci deli jednickou, takze zobrazeni zustava spravne.
--   * Nejde o dva navrhy, ale o invariant a jeho porusovatele. Srovnat 36 radku
--     do invariantu je mensi zasah nez ucit celou codebase dve konvence.
-- Auditovatelnost resi zalohy — puvodni stav se uklada do ingredients_original,
-- servings_original a kcal_original, stejne jako to delala migrace z 21. 7.
-- (Vsech 36 ma dnes tyhle sloupce prazdne, takze se nic neprepise.)
--
-- ULOZENE kcal SE ZAMERNE NEPREPOCITAVA. Neni chybne — pochazi z nutricnich dat
-- Spoonacularu a uz dnes je NA PORCI. Chybne bylo jen skalovani surovin.
-- Prepocet ze surovin by spolehlive cislo nahradil horsim odhadem (zbytkova
-- odchylka az 50 %).

-- ---------------------------------------------------------------------------
-- Skalovani. Zaminovane recepty se VYNECHAVAJI.
--
-- 6 z tech 36 ma jeste nevyreseny konflikt diet_tags (viz migrace
-- 20260804190000 — zbyva 33 receptu, kde konfliktni surovina vubec neni ve
-- slovniku). Trigger enforce_recipe_catalog_rules bezi BEFORE UPDATE, takze
-- update by je tise deaktivoval. Radeji poruseny invariant nez recept vyrazeny
-- z katalogu; dodela se po doplneni slovniku.
-- ---------------------------------------------------------------------------
-- Cilove recepty se nejdriv vyberou do temp tabulky. Kontroly pak overuji
-- PRESNE tyhle radky.
--
-- Marker `servings_original > 1` na to nestaci, jak jsem zjistil az za chodu:
-- pouziva ho i jina cesta zapisu, takze v katalogu uz dnes lezi 11 NEAKTIVNICH
-- receptu s servings_original > 1 a servings = 1, ktere s touhle migraci
-- nemaji nic spolecneho. Prvni verze kontroly je spocitala jako "deaktivovane
-- timhle updatem" a migraci zbytecne zastavila.
CREATE TEMP TABLE _cil ON COMMIT DROP AS
SELECT r.id
FROM public.recipes_catalog r
WHERE r.active
  AND r.servings > 1
  AND NOT (
       ('vegan' = ANY(r.diet_tags)
         AND array_length(public.recipe_diet_conflicts(r.ingredients,'vegan'),1) IS NOT NULL)
    OR ('vegetarian' = ANY(r.diet_tags)
         AND array_length(public.recipe_diet_conflicts(r.ingredients,'vegetarian'),1) IS NOT NULL)
  );

UPDATE public.recipes_catalog r SET
  ingredients_original = coalesce(r.ingredients_original, r.ingredients),
  servings_original    = coalesce(r.servings_original, r.servings),
  kcal_original        = coalesce(r.kcal_original, r.kcal),
  ingredients = (
    SELECT jsonb_agg(
             CASE WHEN jsonb_typeof(t.elem->'amount') = 'number'
                  THEN jsonb_set(t.elem, '{amount}',
                         to_jsonb(round((t.elem->>'amount')::numeric / r.servings, 3)))
                  ELSE t.elem END
             ORDER BY t.ord)
    FROM jsonb_array_elements(r.ingredients) WITH ORDINALITY AS t(elem, ord)
  ),
  servings = 1
WHERE r.id IN (SELECT id FROM _cil);

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_zbyva        integer;
  v_zbyva_nemin  integer;
  v_bez_zalohy   integer;
  v_pocet_prvku  integer;
  v_spatnych     integer;
  v_deaktivovano integer;
BEGIN
  -- 1) Zbyt smi jen zaminovane recepty, nic jineho.
  SELECT count(*) INTO v_zbyva FROM public.recipes_catalog WHERE active AND servings > 1;
  SELECT count(*) INTO v_zbyva_nemin FROM public.recipes_catalog r
  WHERE r.active AND r.servings > 1
    AND NOT (
         ('vegan' = ANY(r.diet_tags) AND array_length(public.recipe_diet_conflicts(r.ingredients,'vegan'),1) IS NOT NULL)
      OR ('vegetarian' = ANY(r.diet_tags) AND array_length(public.recipe_diet_conflicts(r.ingredients,'vegetarian'),1) IS NOT NULL));
  IF v_zbyva_nemin > 0 THEN
    RAISE EXCEPTION 'Zustalo % nezaminovanych receptu se servings > 1 — mely se opravit.', v_zbyva_nemin;
  END IF;

  -- 2) Vsechny cilove recepty maji zalohu a servings = 1.
  SELECT count(*) INTO v_bez_zalohy FROM public.recipes_catalog r JOIN _cil c ON c.id = r.id
  WHERE r.ingredients_original IS NULL OR r.kcal_original IS NULL
     OR r.servings_original IS NULL OR r.servings <> 1;
  IF v_bez_zalohy > 0 THEN
    RAISE EXCEPTION 'U % cilovych receptu chybi zaloha nebo neni servings = 1.', v_bez_zalohy;
  END IF;

  -- 3) jsonb_agg nesmel zahodit ani pridat surovinu.
  SELECT count(*) INTO v_pocet_prvku FROM public.recipes_catalog r JOIN _cil c ON c.id = r.id
  WHERE jsonb_array_length(r.ingredients) <> jsonb_array_length(r.ingredients_original);
  IF v_pocet_prvku > 0 THEN
    RAISE EXCEPTION 'U % receptu se zmenil pocet surovin.', v_pocet_prvku;
  END IF;

  -- 4) Trigger nesmel zadny opravovany recept deaktivovat.
  SELECT count(*) INTO v_deaktivovano FROM public.recipes_catalog r JOIN _cil c ON c.id = r.id
  WHERE NOT r.active;
  IF v_deaktivovano > 0 THEN
    RAISE EXCEPTION 'Update deaktivoval % receptu.', v_deaktivovano;
  END IF;

  -- 5) TO PODSTATNE: po skalovani uz soucet ze surovin nesmi byt nasobkem
  --    porci. Pred opravou byl median odchylky 359 %, po ni musi kazdy
  --    opravovany recept s kompletni nutrici sednout do 60 %.
  SELECT count(*) INTO v_spatnych
  FROM public.recipes_catalog r
  JOIN _cil cc ON cc.id = r.id
  CROSS JOIN LATERAL public.compute_nutrition_for_ingredients(r.ingredients) c
  WHERE c.complete AND r.kcal > 0 AND abs(c.kcal - r.kcal) / r.kcal > 0.6;
  IF v_spatnych > 0 THEN
    RAISE EXCEPTION 'U % receptu je soucet ze surovin i po skalovani mimo (>60 %%).', v_spatnych;
  END IF;

  RAISE NOTICE 'Skalovani hotovo. Aktivnich se servings > 1 zbyva % (vse zaminovane, ceka na slovnik).', v_zbyva;
END $$;
