-- Pantry logika: tuky a sladidla ven, zanedbatelnost prestava zaviset na jednotce.
--
-- ===========================================================================
-- CHYBA 1 (data): olej, maslo, cukr, mouka a med byly vedene jako "koreni"
-- ===========================================================================
-- KRITERIUM, KTERE JSEM POUZIL. kcal na 100 g je pro tohle rozhodnuti
-- nepouzitelne — koreni ma 250-380 kcal/100 g a pritom se davkuje po gramu.
-- Spravna otazka je, KOLIK kcal ta vec pridava v REALNE DAVCE, kterou v
-- receptech opravdu ma. Zmereno nad aktivnimi recepty (medianova davka
-- prepoctena na kcal):
--
--   olivovy olej   220 receptu   median  10,0 g  ->  88 kcal   (max 332)
--   olej            21 receptu   median   7,5 g  ->  66 kcal   (max 371)
--   butter           4 recepty   median  18,8 g  -> 135 kcal   (max 215)
--   olive oil       15 receptu   median   7,5 g  ->  66 kcal   (max 203)
--   cukr            31 receptu   median   7,5 g  ->  30 kcal   (max 1600!)
--   ---------------------------------------------- zlom -----------------
--   kari koreni      4 recepty   median   3,3 g  ->  11 kcal
--   paprika         41 receptu   median  25,1 g  ->   8 kcal
--   cesnek          59 receptu   median   2,5 g  ->   4 kcal
--   pepr            64 receptu   median   0,8 g  ->   2 kcal
--   sul, voda, jedla soda                        ->   0 kcal
--
-- Mezi cukrem (30) a kari korenim (11) je ostry zlom a nic mezi tim. Beru
-- tedy: do pantry patri jen to, co ani v nejvetsi realne davce nehraje roli,
-- a NIKDY koncentrovany zdroj energie (tuk, sladidlo, mouka) — u toho je
-- rozptyl davek prilis velky (cukr od 7,5 g do 400 g).
--
-- SUBSTRING MATCHING TO ZVETSUJE. is_pantry_ingredient() paruje viceslovne
-- polozky pres hranice slov, takze jeden radek spolkne celou rodinu:
--   'olive oil' -> extra virgin olive oil, olive oil extra virgin
--   'olej'      -> repkovy, sezamovy, lneny, arasidovy, rostlinny,
--                  slunecnicovy, mazola olej, olej z hroznovych jader
--   'cukr'      -> krystalovy, kokosovy, praskovy, mouckovy cukr, vanilla sugar
--   'olivovy olej' -> extra panensky olivovy olej, kapka olivoveho oleje,
--                  olivovy olej na potreni
--
-- ===========================================================================
-- CHYBA 2 (navrh): pantry se uplatnilo jen kdyz NESLA prevest jednotka
-- ===========================================================================
--   (sg.gramu is null and public.is_pantry_ingredient(sg.rn)) as zanedbatelna
--
-- Dusledek: PRIDANI PREVODU JEDNOTKY MOHLO ROZBIT FUNKCNI RECEPT. Dokud
-- jednotka neslo prevest, byla pantry polozka zanedbatelna; jak se prevod
-- pridal, gramu prestalo byt NULL, zanedbatelnost zmizela — a pokud surovina
-- nebyla ve slovniku, recept spadl mezi nespocitatelne.
--
-- Realne se to uz stalo: migrace 20260804210000 pridala do pantry
-- 'almond extract', 'vanilkova pasta', 'ruzova voda' a 'koreni na dynovy kolac'
-- s tim, ze prestanou blokovat. NEPRESTALY — tsp/Tbsp se prevest da, takze se
-- pantry vubec neuplatnilo. Ta cast PR #43 byla bez efektu a nikdo to nezmeril.
-- Tady se to napravuje.
--
-- PROC NE ZVLASTNI SLOUPEC ("opravdu nulove" vs "male, ale nenulove")
-- Zvazoval jsem to a nedelam to. Clenstvi v pantry uz TEN PREDIKAT JE:
-- "kdyz tuhle vec neumime spocitat, je nula prijatelna nahrada". Druhy sloupec
-- by tu samou informaci ulozil dvakrat a mohl by se rozejit. Co chybelo, nebyl
-- sloupec, ale (a) kuratorovany seznam a (b) zabradli, ktere ho udrzi
-- kuratorovany — to je krok 3 nize.

-- ---------------------------------------------------------------------------
-- Stav PRED zmenou, aby ho kontroly na konci mely s cim srovnat.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _pred ON COMMIT DROP AS
SELECT r.id, c.complete
FROM public.recipes_catalog r
CROSS JOIN LATERAL public.compute_nutrition_for_ingredients(r.ingredients) c
WHERE r.active;

-- ---------------------------------------------------------------------------
-- KROK 1a. Tuky a sladidla z pantry ven
--
-- 'flour', 'honey' a 'sugar' uz aliasy MAJI (-> mouka, med, cukr), takze se
-- do dictionary dostanou uz pres alias a jejich pantry radky jsou jen mrtva
-- zataz s rizikem. Ostatni potrebuji alias, doplnuje se v 1b.
-- ---------------------------------------------------------------------------
DELETE FROM public.pantry_ingredients
WHERE name_normalized IN (
  'olive oil',    -- 884 kcal/100 g pres 'olivovy olej'
  'oil',          -- 884
  'olej',         -- 884
  'olivovy olej', -- 884
  'butter',       -- 717 pres 'maslo'
  'flour',        -- 364 pres 'mouka', alias uz existuje
  'honey',        -- 304 pres 'med',   alias uz existuje
  'sugar',        -- 400 pres 'cukr',  alias uz existuje
  'cukr'          -- 400
);

-- ---------------------------------------------------------------------------
-- KROK 1b. Aliasy misto pantry
--
-- Kriterium z davky 4: "alias miri vzdycky na surovinu, ktera z prave te
-- potraviny vznikla". Tady je to trivialne splneno — je to ta sama potravina,
-- jen anglicky nebo s privlastkem. Zadny z nich nemazne rozdil v tuku.
-- ---------------------------------------------------------------------------
INSERT INTO public.ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs)
VALUES
  ('olive oil',               'olivovy olej', 'olivový olej'),
  ('extra virgin olive oil',  'olivovy olej', 'extra panenský olivový olej'),
  ('olive oil extra virgin',  'olivovy olej', 'olivový olej extra panenský'),
  ('olivovy olej na potreni', 'olivovy olej', 'olivový olej na potření'),
  ('butter',                  'maslo',        'máslo')
ON CONFLICT (alias_normalized) DO NOTHING;

-- ---------------------------------------------------------------------------
-- KROK 2. Zanedbatelnost uz nezavisi na prevoditelnosti jednotky
--
-- Zmena je jen v jednom vyrazu, zbytek funkce je bez uprav (poradi hledani
-- jednotek vcetne zabradli T/t zustava presne jak bylo).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_nutrition_for_ingredients(p_ingredients jsonb)
 RETURNS TABLE(kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric, ingredients_total integer, ingredients_matched integer, ingredients_unmatched text[], complete boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with rozpad as (
  select lower(extensions.unaccent(regexp_replace(trim(i->>'name'),'\s+',' ','g'))) as n_raw,
         (i->>'amount')::numeric as mnozstvi,
         i->>'unit'              as jednotka
  from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) i
),
res as (
  select rz.mnozstvi, rz.jednotka,
    coalesce(
      (select a.canonical_normalized from public.ingredient_aliases a
        where a.alias_normalized = rz.n_raw),
      rz.n_raw
    ) as rn
  from rozpad rz
),
s_gramy as (
  select res.rn,
    coalesce(
      -- 1) presna jednotka + konkretni surovina
      (select uc.grams from public.unit_conversions uc
        where uc.unit = res.jednotka
          and lower(extensions.unaccent(uc.ingredient_match)) = res.rn),
      -- 2) jina velikost pismen + konkretni surovina, jen kdyz je jednoznacna
      (select max(uc.grams) from public.unit_conversions uc
        where lower(uc.unit) = lower(res.jednotka)
          and lower(extensions.unaccent(uc.ingredient_match)) = res.rn
        having count(distinct uc.grams) = 1),
      -- 3) presna jednotka + obecny fallback
      (select uc.grams from public.unit_conversions uc
        where uc.unit = res.jednotka and uc.ingredient_match is null),
      -- 4) jina velikost pismen + obecny fallback, jen kdyz je jednoznacny
      (select max(uc.grams) from public.unit_conversions uc
        where lower(uc.unit) = lower(res.jednotka) and uc.ingredient_match is null
        having count(distinct uc.grams) = 1)
    ) * res.mnozstvi as gramu
  from res
),
spojeno as (
  select sg.rn as surovina, sg.gramu,
    inu.kcal_per_100g, inu.protein_g_per_100g, inu.carbs_g_per_100g, inu.fat_g_per_100g,
    (inu.name_cs is not null and sg.gramu is not null) as ok,
    -- ZMENA: zanedbatelnost uz nezavisi na tom, jestli jednotku umime prevest.
    -- Pantry vec, kterou z jakehokoli duvodu neumime spocitat, se bere jako
    -- nulova. Podminka 'gramu is null' tady drive delala to, ze pridani
    -- prevodu jednotky rozbilo dosud funkcni recept.
    (not (inu.name_cs is not null and sg.gramu is not null)
      and public.is_pantry_ingredient(sg.rn)) as zanedbatelna
  from s_gramy sg
  left join lateral (
    select name_cs, kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g
    from public.ingredients_nutrition
    where lower(extensions.unaccent(name_cs)) = sg.rn
    limit 1
  ) inu on true
)
select
  round(sum(kcal_per_100g        * gramu / 100.0) filter (where ok), 1),
  round(sum(protein_g_per_100g   * gramu / 100.0) filter (where ok), 1),
  round(sum(carbs_g_per_100g     * gramu / 100.0) filter (where ok), 1),
  round(sum(fat_g_per_100g       * gramu / 100.0) filter (where ok), 1),
  count(*)::integer,
  count(*) filter (where ok)::integer,
  coalesce(array_agg(surovina) filter (where not ok and not zanedbatelna), '{}'::text[]),
  (count(*) filter (where not ok and not zanedbatelna) = 0)
from spojeno;
$function$;

COMMENT ON FUNCTION public.compute_nutrition_for_ingredients(jsonb) IS
  'Nutrice ze surovin. Jednotka se hleda nejdriv presne, pak case-insensitive a jen kdyz je jednoznacna (T=15 g vs t=5 g se nesmi slit). Pantry surovina, kterou neumime spocitat, se bere jako nulova — nezavisle na prevoditelnosti jednotky.';

-- ---------------------------------------------------------------------------
-- KROK 3. Zabradli, aby se kaloricky vyznamna surovina do pantry uz nedostala
--
-- Tohle je presne ta trida chyby, ktera se sama vrati. Trigger porovna novy
-- radek proti ingredients_nutrition a odmitne koncentrovany zdroj energie:
--   fat   >= 50 g/100 g  -> oleje (100), maslo (81), sadlo
--   carbs >= 70 g/100 g  -> cukr (100), med (82), mouka (76)
--
-- Overeno proti dnesnimu pantry seznamu: z legitimniho koreni to nezamitne
-- nic krome dvou hranicnich, ktere jsou proto na vyjimce (skorice carbs 81,
-- mlety zazvor carbs 72 — oboji se davkuje po gramu, realna davka do 3 kcal).
-- Vyjimka je zamerne vypsana jmenovite, aby pristi pridani takove veci musel
-- clovek vedome odklepnout, ne aby propadlo.
--
-- Co zabradli NEUMI: surovinu, ktera ve slovniku jeste neni (nema s cim
-- porovnat). Kriterium "realna davka v receptech" se v triggeru zjistit neda,
-- protoze zavisi na receptech, ne na surovine. Proto je to zabradli, ne dukaz.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pantry_ingredient_neni_kaloricka()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_kcal  numeric;
  v_fat   numeric;
  v_carbs numeric;
BEGIN
  IF NEW.name_normalized IN ('skorice', 'mlety zazvor') THEN
    RETURN NEW;
  END IF;

  SELECT kcal_per_100g, fat_g_per_100g, carbs_g_per_100g
    INTO v_kcal, v_fat, v_carbs
  FROM public.ingredients_nutrition
  WHERE lower(extensions.unaccent(name_cs)) = NEW.name_normalized
  LIMIT 1;

  IF v_kcal IS NULL THEN
    RETURN NEW;
  END IF;

  IF coalesce(v_fat, 0) >= 50 THEN
    RAISE EXCEPTION
      'Do pantry nelze pridat "%": slovnik u ni hlasi % g tuku na 100 g. Koncentrovany tuk neni zanedbatelny — pouzij alias na slovnikovou surovinu.',
      NEW.name_normalized, v_fat;
  END IF;

  IF coalesce(v_carbs, 0) >= 70 THEN
    RAISE EXCEPTION
      'Do pantry nelze pridat "%": slovnik u ni hlasi % g sacharidu na 100 g (% kcal). Sladidla a mouky nejsou zanedbatelne — pouzij alias na slovnikovou surovinu.',
      NEW.name_normalized, v_carbs, v_kcal;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pantry_ingredient_neni_kaloricka ON public.pantry_ingredients;
CREATE TRIGGER trg_pantry_ingredient_neni_kaloricka
  BEFORE INSERT OR UPDATE ON public.pantry_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.pantry_ingredient_neni_kaloricka();

-- ===========================================================================
-- CO SE ZAMERNE NERESILO
-- ===========================================================================
--   * Ulozene kcal u receptu se neprepocitava (samostatne rozhodnuti).
--   * 8 receptu ztraci spocitatelnost a je to zamer, ne regrese — viz
--     kontrola 3 nize. Vsechny maji olej BEZ UVEDENEHO MNOZSTVI
--     ("olive oil", "Oil - for frying", unit 'servings'/'ks'). Dnes se tvari
--     spocitatelne jen proto, ze se jim olej zahodi, tedy chybi jim 66-332
--     kcal. Po zmene poctive rikaji, ze to spocitat neumime. Odemkne je az
--     rozhodnuti o priznaku 'unquantified' z 20260804180000, ne hadani gramaze.
--   * 'paprika' je v pantry koreni, ale ve slovniku zelenina (31 kcal/100 g,
--     az 450 g v receptu). Kolize nazvu, ne kaloricky problem — nechavam.

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_pred      integer;
  v_po        integer;
  v_regrese   integer;
  v_bez_duvodu integer;
  v_tuk_v_pantry integer;
BEGIN
  -- 1) V pantry uz nesmi zustat nic kaloricky vyznamneho.
  SELECT count(*) INTO v_tuk_v_pantry
  FROM public.pantry_ingredients p
  JOIN public.ingredients_nutrition i ON lower(extensions.unaccent(i.name_cs)) = p.name_normalized
  WHERE (coalesce(i.fat_g_per_100g,0) >= 50 OR coalesce(i.carbs_g_per_100g,0) >= 70)
    AND p.name_normalized NOT IN ('skorice','mlety zazvor');
  IF v_tuk_v_pantry > 0 THEN
    RAISE EXCEPTION 'V pantry zustalo % kaloricky vyznamnych surovin.', v_tuk_v_pantry;
  END IF;

  CREATE TEMP TABLE _po ON COMMIT DROP AS
  SELECT r.id, c.complete, c.ingredients_unmatched
  FROM public.recipes_catalog r
  CROSS JOIN LATERAL public.compute_nutrition_for_ingredients(r.ingredients) c
  WHERE r.active;

  SELECT count(*) FILTER (WHERE complete) INTO v_pred FROM _pred;
  SELECT count(*) FILTER (WHERE complete) INTO v_po   FROM _po;

  -- 2) Pocet spocitatelnych receptu musi STOUPNOUT.
  IF v_po <= v_pred THEN
    RAISE EXCEPTION 'Pocet spocitatelnych receptu nestoupl: % -> %.', v_pred, v_po;
  END IF;

  -- 3) Kazdy recept, ktery spocitatelnost ZTRATIL, ji smel ztratit JEN kvuli
  --    tuku/sladidlu bez uvedeneho mnozstvi. Cokoli jineho je skutecna regrese.
  SELECT count(*) INTO v_regrese
  FROM _pred p JOIN _po n ON n.id = p.id
  WHERE p.complete AND NOT n.complete;

  SELECT count(*) INTO v_bez_duvodu
  FROM _pred p JOIN _po n ON n.id = p.id
  WHERE p.complete AND NOT n.complete
    AND NOT (n.ingredients_unmatched && ARRAY['olivovy olej','olej','maslo','cukr','mouka','med']);
  IF v_bez_duvodu > 0 THEN
    RAISE EXCEPTION
      'U % receptu se spocitatelnost ztratila z jineho duvodu nez neuvedene mnozstvi tuku/sladidla.', v_bez_duvodu;
  END IF;

  -- 4) Zabradli musi opravdu drzet.
  BEGIN
    INSERT INTO public.pantry_ingredients (name_normalized, category, is_vegetarian, is_vegan)
    VALUES ('olivovy olej', 'seasoning', true, true);
    RAISE EXCEPTION 'Zabradli nezabralo: olivovy olej se do pantry vlozit podarilo.';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF sqlerrm LIKE 'Zabradli nezabralo%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'Spocitatelnych receptu: % -> % (+%). Spocitatelnost ztratilo % receptu, vsechny kvuli neuvedenemu mnozstvi tuku.',
    v_pred, v_po, v_po - v_pred, v_regrese;
END $$;
