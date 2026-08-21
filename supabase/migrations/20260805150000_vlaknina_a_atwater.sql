-- Vlaknina ve slovniku + Atwaterova kontrola, ktera ji umi odecist.
--
-- ===========================================================================
-- CO MERENI UKAZALO — ZADANI MELO PRAVDU V DIAGNOZE, ALE NE V RECEPTU NA LEK
-- ===========================================================================
-- Zadani: Atwater pocita 4 kcal/g na vsechny sacharidy vcetne vlakniny, takze
-- rostlinna strava neprojde. To plati — recepty 830 (avokadova pomazanka,
-- 11,0 %) a 833 (chia salat, 11,2 %) padaly presne takhle.
--
-- Navrzene reseni "odecti vlakninu vzdy" ale zmerene NEFUNGUJE. Zkusil jsem ho
-- na vsech 568 receptech: 10 by odblokovalo, ale SEDM DALSICH by naopak
-- ROZBILO, z toho 5 aktivnich:
--   id 317 Fazole s ryzi          653 kcal, 4/4/9 = 648 (0,8 %) -> po odecteni 586 (10,3 %)
--   id 347 Fazole s ryzi velka    807 kcal, 4/4/9 = 799 (1,0 %) -> 705 (12,6 %)
--   id 483 Fazole s ryzi extra   1004 kcal, 4/4/9 = 995 (0,9 %) -> 886 (11,8 %)
--   id 835 Ovesna kase s ovocem   255 kcal, 4/4/9 = 246 (3,5 %) -> 227 (11,0 %)
--   id 860 Kruti platky           467 kcal, 4/4/9 = 468 (0,2 %) -> 420 (10,1 %)
--
-- PROC: nase kcal_per_100g jsou z USDA a USDA pouziva DVE RUZNE konvence.
-- U vetsiny potravin obecne Atwaterovy faktory (4/4/9 na celkove sacharidy
-- vcetne vlakniny), u nekterych specificke, ktere vlakninu uz zohlednuji:
--   fazole   kcal  90  vs 4/4/9 =  91   sedi   -> obecne faktory
--   cocka    kcal 352  vs        350    sedi   -> obecne faktory
--   ryze     kcal 360  vs        350    sedi   -> obecne faktory
--   avokado  kcal 160  vs        177    NESEDI -> specificke faktory
--   chia     kcal 486  vs        515    NESEDI -> specificke faktory
--
-- Kontrola tedy nemeri fyziologii, ale VNITRNI KONZISTENCI mezi ulozenymi kcal
-- a ulozenymi makry. Kdyz odectu vlakninu jen na jedne strane, u potravin
-- s obecnymi faktory tu konzistenci rozbiju.
--
-- ===========================================================================
-- ZVOLENE RESENI: PROJDE, KDYZ SEDI KTERAKOLI Z OBOU KONVENCI
-- ===========================================================================
--   4*B + 4*S + 9*T                (obecne faktory, jak to bylo)
--   4*B + 4*S + 9*T - 2*vlaknina   (vlaknina po 2 kcal/g, EU 1169/2011)
-- Recept je nekonzistentni, jen kdyz mine OBOJI. To odpovida tomu, ze oba
-- referencni ramce jsou legitimni — zalezi na potravine.
--
-- ZMERENY DOPAD na 568 receptech:
--   pada dnes (4/4/9)                17
--   padalo by pri "vzdy odecist"     14  (ale 7 jinych receptu nez dnes!)
--   pada pri "kterakoli z obou"       7  <- zvolene
--   odblokuje                        10  (vcetne 830 a 833)
--   regrese                           0
-- Ze 17 na 7, bez jedine regrese. Zbylych 7 uz nejsou o vlaknine.
--
-- 2 kcal/g pro vlakninu je evropska konvence (EU 1169/2011, priloha XIV).
-- V repu zadna jina konvence pro vlakninu nebyla — lib/macroKcalConsistency.js
-- mel jen obchazku pres tag high_fiber, coz je naplast, ne konvence.
--
-- ===========================================================================
-- JEDNA IMPLEMENTACE PRO VSECHNA MISTA
-- ===========================================================================
-- Atwater je v repu na TRECH mistech: brana enforce_recipe_catalog_rules,
-- sweeper sweep_recipe_catalog_activation a JS lib/macroKcalConsistency.js
-- (pouzity ve vyberu kandidatu, lib/recipesCatalog.js:319). Presne ten vzorec
-- "dve mista nad stejnymi daty, hlida jen jedno", ktery nas tady chytil uz
-- petkrat. Proto se logika dava do JEDNE funkce public.atwater_ok() a brana
-- i sweeper ji jen volaji. JS zrcadlo se upravuje zvlast (nemuze volat SQL),
-- ale pouziva stejny vzorec i stejnou toleranci.

-- ---------------------------------------------------------------------------
-- 1. Sloupec pro vlakninu
-- ---------------------------------------------------------------------------
ALTER TABLE public.ingredients_nutrition
  ADD COLUMN IF NOT EXISTS fiber_g_per_100g numeric;

COMMENT ON COLUMN public.ingredients_nutrition.fiber_g_per_100g IS
  'Vlaknina na 100 g z USDA (nutrient 1079, Fiber total dietary). NULL = nezname, NE nula.';

-- ---------------------------------------------------------------------------
-- 2. Hodnoty z USDA
--
-- Stazeno pres scripts/fetch-usda-fiber.mjs, cache .cache/usda-fiber.json.
-- Ke kazdemu radku patri FDC ID a presny nazev polozky, stejne jako u zbytku
-- slovniku. Nic se nedopocitava.
--
-- Skript overuje, ze USDA vratilo TU SAMOU potravinu: porovna kcal a sacharidy
-- proti nasemu radku a pri rozchodu nad mez zaznam NEZAPISE. Zachytilo to tri
-- spatne trefy (pita misto celozrnneho chleba, odtucnene arasidove maslo,
-- mrazene batatove krouzky) — ty se pak dohledaly presnejsim dotazem.
-- ---------------------------------------------------------------------------
UPDATE public.ingredients_nutrition i SET fiber_g_per_100g = v.fiber, updated_at = now()
FROM (VALUES
  -- lusteniny a obiloviny
  ('fazole',               15.5),  -- FDC 173734 SR Legacy: Beans, black, mature seeds, raw
  ('čočka',                10.7),  -- FDC 172420 SR Legacy: Lentils, raw
  ('ovesné vločky',         9.4),  -- FDC 172989 SR Legacy: Cereals, QUAKER, Quick Oats, Dry
  ('quinoa',                7.0),  -- FDC 168874 SR Legacy: Quinoa, uncooked
  ('celozrnný chléb',       6.0),  -- FDC 172688 SR Legacy: Bread, whole-wheat, commercially prepared
  ('kuskus',                5.0),  -- FDC 169699 SR Legacy: Couscous, dry
  ('těstoviny',             3.2),  -- FDC 168927 SR Legacy: Pasta, dry, unenriched
  ('mouka',                 2.7),  -- FDC 169761 SR Legacy: Wheat flour, white, all-purpose, unenriched
  ('rýže',                  0.149),-- FDC 2512381 Foundation: Rice, white, long grain, unenriched, raw
  -- seminka a orechy
  ('chia semínka',         34.4),  -- FDC 170554 SR Legacy: Seeds, chia seeds, dried
  ('lněná semínka',        23.1),  -- FDC 2262075 Foundation: Flaxseed, ground
  ('mandle',               10.8),  -- FDC 2346393 Foundation: Nuts, almonds, whole, raw
  ('slunečnicová semínka',  8.6),  -- FDC 170562 SR Legacy: Seeds, sunflower seed kernels, dried
  ('dýňová semínka',        6.0),  -- FDC 170556 SR Legacy: Seeds, pumpkin and squash seed kernels, dried
  ('vlašské ořechy',        5.21), -- FDC 2346394 Foundation: Nuts, walnuts, English, halves, raw
  ('arašídové máslo',       5.0),  -- FDC 172470 SR Legacy: Peanut butter, smooth style, without salt
  -- ovoce
  ('avokádo',               6.8),  -- FDC 171706 SR Legacy: Avocados, raw, California
  ('maliny',                6.5),  -- FDC 167755 SR Legacy: Raspberries, raw
  ('banán',                 2.6),  -- FDC 173944 SR Legacy: Bananas, raw
  ('borůvky',               2.4),  -- FDC 171711 SR Legacy: Blueberries, raw
  ('jablko',                2.08), -- FDC 1750340 Foundation: Apples, fuji, with skin, raw
  ('jahody',                2.0),  -- FDC 167762 SR Legacy: Strawberries, raw
  ('broskev',               1.5),  -- FDC 325430 Foundation: Peaches, yellow, raw
  -- zelenina
  ('česnek',                2.7),  -- FDC 1104647 Foundation: Garlic, raw
  ('mrkev',                 2.8),  -- FDC 170393 SR Legacy: Carrots, raw
  ('brokolice',             2.4),  -- FDC 747447 Foundation: Broccoli, raw
  ('špenát',                2.2),  -- FDC 168462 SR Legacy: Spinach, raw
  ('brambory',              2.1),  -- FDC 170026 SR Legacy: Potatoes, flesh and skin, raw
  ('paprika',               2.1),  -- FDC 170108 SR Legacy: Peppers, sweet, red, raw
  ('květák',                1.95), -- FDC 2685573 Foundation: Cauliflower, raw
  ('cibule',                1.7),  -- FDC 170000 SR Legacy: Onions, raw
  ('celer',                 1.6),  -- FDC 169988 SR Legacy: Celery, raw
  ('rajče',                 1.2),  -- FDC 170457 SR Legacy: Tomatoes, red, ripe, raw
  ('cuketa',                1.1),  -- FDC 168565 SR Legacy: Squash, zucchini, baby, raw
  ('houby',                 1.0),  -- FDC 169251 SR Legacy: Mushrooms, white, raw
  ('citronová šťáva',       0.3)   -- FDC 167747 SR Legacy: Lemon juice, raw
) AS v(nazev, fiber)
WHERE lower(extensions.unaccent(i.name_cs)) = lower(extensions.unaccent(v.nazev));

-- ---------------------------------------------------------------------------
-- 3. Vlaknina receptu ze surovin
--
-- Gramaze se resi presne stejnym poradim jako v compute_nutrition_for_ingredients
-- (presna jednotka -> case-insensitive jednoznacna -> obecny fallback), aby se
-- vlaknina pocitala nad tim samym mnozstvim jako sacharidy.
--
-- Scita se JEN tam, kde vlakninu znamea gramaz jde spocitat. NULL vlaknina
-- znamena "nezname", ne nula — recept bez znamych hodnot dostane 0 a chova se
-- pak jako dosud, protoze odecteni nuly nic nezmeni.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recipe_fiber_g(p_ingredients jsonb)
RETURNS numeric
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
    coalesce((select a.canonical_normalized from public.ingredient_aliases a
               where a.alias_normalized = rz.n_raw), rz.n_raw) as rn
  from rozpad rz
),
s_gramy as (
  select res.rn,
    coalesce(
      (select uc.grams from public.unit_conversions uc
        where uc.unit = res.jednotka
          and lower(extensions.unaccent(uc.ingredient_match)) = res.rn),
      (select max(uc.grams) from public.unit_conversions uc
        where lower(uc.unit) = lower(res.jednotka)
          and lower(extensions.unaccent(uc.ingredient_match)) = res.rn
        having count(distinct uc.grams) = 1),
      (select uc.grams from public.unit_conversions uc
        where uc.unit = res.jednotka and uc.ingredient_match is null),
      (select max(uc.grams) from public.unit_conversions uc
        where lower(uc.unit) = lower(res.jednotka) and uc.ingredient_match is null
        having count(distinct uc.grams) = 1)
    ) * res.mnozstvi as gramu
  from res
)
select coalesce(sum(inu.fiber_g_per_100g * sg.gramu / 100.0), 0)
from s_gramy sg
join public.ingredients_nutrition inu
  on lower(extensions.unaccent(inu.name_cs)) = sg.rn
where sg.gramu is not null and inu.fiber_g_per_100g is not null;
$function$;

COMMENT ON FUNCTION public.recipe_fiber_g(jsonb) IS
  'Vlaknina receptu v gramech, secteno ze slovniku pres stejne resene gramaze jako compute_nutrition_for_ingredients. Suroviny s neznamou vlakninou se nescitaji.';

-- ---------------------------------------------------------------------------
-- 4. JEDNA implementace Atwaterovy kontroly
--
-- Projde, kdyz sedi kterakoli z obou konvenci. Vraci true i pro high_fiber tag,
-- aby se chovani stavajicich receptu s naplasti nezmenilo skokem.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atwater_ok(
  p_kcal numeric, p_protein numeric, p_carbs numeric, p_fat numeric,
  p_fiber numeric DEFAULT 0, p_tolerance numeric DEFAULT 10.0
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  select case
    when p_kcal is null or p_kcal <= 0
      or p_protein is null or p_carbs is null or p_fat is null then false
    else
      -- obecne Atwaterovy faktory
      round(abs((round(p_kcal)::numeric - round(4*p_protein + 4*p_carbs + 9*p_fat)::numeric)
                / round(p_kcal)::numeric) * 100, 1) <= p_tolerance
      -- nebo tytez faktory s vlakninou po 2 kcal/g
      or round(abs((round(p_kcal)::numeric
                    - round(4*p_protein + 4*p_carbs + 9*p_fat - 2*coalesce(p_fiber,0))::numeric)
                / round(p_kcal)::numeric) * 100, 1) <= p_tolerance
  end;
$function$;

COMMENT ON FUNCTION public.atwater_ok(numeric,numeric,numeric,numeric,numeric,numeric) IS
  'Atwaterova kontrola. Projde, kdyz kcal sedi s 4/4/9 NEBO s 4/4/9 minus 2 kcal/g za vlakninu (EU 1169/2011). Slovnik micha obe USDA konvence, proto jsou oba ramce legitimni. Jedina implementace pro branu i sweeper.';

-- ---------------------------------------------------------------------------
-- 5. Brana — vetev (b) uz jen vola atwater_ok()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_recipe_catalog_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.pending_review THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- a) kcal a všechna tři makra vyplněná
  IF NEW.kcal IS NULL OR NEW.kcal <= 0
     OR NEW.protein_g IS NULL OR NEW.carbs_g IS NULL OR NEW.fat_g IS NULL THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- b) Atwater, tolerance 10 %. Vláknina se odečítá — viz public.atwater_ok.
  --    Tag high_fiber bránu obchází dál, ale po téhle migraci už ho většina
  --    receptů nepotřebuje.
  IF NOT (
    'high_fiber' = ANY(NEW.diet_tags)
    OR public.atwater_ok(NEW.kcal, NEW.protein_g, NEW.carbs_g, NEW.fat_g,
                         public.recipe_fiber_g(NEW.ingredients), 10.0)
  ) THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- c) počet hlavních surovin
  IF public.count_main_ingredients(NEW.ingredients) > 10 THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- d) český název
  IF NEW.name_cs IS NULL OR btrim(NEW.name_cs) = '' THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- e) ČAS — zapnuto pro obed a veceri, limit 30 minut. NULL nedeaktivuje.
  IF NEW.meal_type IN ('obed', 'vecere')
     AND coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) IS NOT NULL
     AND coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) > 30 THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- f) dietní tag musí sedět se surovinami
  IF 'vegan' = ANY(NEW.diet_tags)
     AND array_length(public.recipe_diet_conflicts(NEW.ingredients, 'vegan'), 1) IS NOT NULL THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  IF 'vegetarian' = ANY(NEW.diet_tags)
     AND array_length(public.recipe_diet_conflicts(NEW.ingredients, 'vegetarian'), 1) IS NOT NULL THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Sweeper — tatáž funkce, aby se nemohl rozejít
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_recipe_catalog_activation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aktivovano integer;
  v_aktivnich  integer;
BEGIN
  WITH zmeneno AS (
    UPDATE public.recipes_catalog r
    SET active = true
    WHERE r.active = false
      AND NOT r.pending_review
      AND r.kcal > 0
      AND r.protein_g IS NOT NULL AND r.carbs_g IS NOT NULL AND r.fat_g IS NOT NULL
      AND public.count_main_ingredients(r.ingredients) <= 10
      AND r.name_cs IS NOT NULL AND btrim(r.name_cs) <> ''
      AND (
        'high_fiber' = ANY(r.diet_tags)
        OR public.atwater_ok(r.kcal, r.protein_g, r.carbs_g, r.fat_g,
                             public.recipe_fiber_g(r.ingredients), 10.0)
      )
      AND NOT (
        'vegan' = ANY(r.diet_tags)
        AND array_length(public.recipe_diet_conflicts(r.ingredients, 'vegan'), 1) IS NOT NULL
      )
      AND NOT (
        'vegetarian' = ANY(r.diet_tags)
        AND array_length(public.recipe_diet_conflicts(r.ingredients, 'vegetarian'), 1) IS NOT NULL
      )
      AND NOT (
        r.meal_type IN ('obed', 'vecere')
        AND coalesce(r.ready_in_minutes, r.prep_minutes_estimated) IS NOT NULL
        AND coalesce(r.ready_in_minutes, r.prep_minutes_estimated) > 30
      )
    RETURNING r.id
  )
  SELECT count(*) INTO v_aktivovano FROM zmeneno;
  SELECT count(*) INTO v_aktivnich FROM public.recipes_catalog WHERE active;
  RETURN jsonb_build_object('activated', v_aktivovano, 'active_total', v_aktivnich, 'swept_at', now());
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. fiber_g na receptu — pro JS zrcadlo a pro zobrazeni
--
-- lib/macroKcalConsistency.js nemuze volat SQL, takze potrebuje vlakninu na
-- radku. lib/mealDisplayModel.js:175 uz `recipe.fiber_g` cte, takze to ma
-- uzitek i mimo kontrolu. Je to DERIVOVANA hodnota — zdroj pravdy zustava
-- slovnik a recipe_fiber_g().
--
-- Plni se s VYPNUTOU branou: UPDATE pres 568 radku by ji jinak spustil na
-- kazdem z nich a deaktivoval 14 receptu s nevyresenym konfliktem diet_tags
-- a recept 614 na hrane pocet surovin. Oboji je v transakci migrace.
-- ---------------------------------------------------------------------------
ALTER TABLE public.recipes_catalog
  ADD COLUMN IF NOT EXISTS fiber_g numeric;

COMMENT ON COLUMN public.recipes_catalog.fiber_g IS
  'Vlaknina porce v gramech, derivovana z ingredients pres recipe_fiber_g(). Zdroj pravdy je slovnik, tenhle sloupec je kopie pro JS a zobrazeni.';

ALTER TABLE public.recipes_catalog DISABLE TRIGGER trg_enforce_recipe_catalog_rules;
ALTER TABLE public.recipes_catalog DISABLE TRIGGER set_recipes_catalog_updated_at;

UPDATE public.recipes_catalog SET fiber_g = round(public.recipe_fiber_g(ingredients), 1);

ALTER TABLE public.recipes_catalog ENABLE TRIGGER set_recipes_catalog_updated_at;
ALTER TABLE public.recipes_catalog ENABLE TRIGGER trg_enforce_recipe_catalog_rules;

-- ===========================================================================
-- CO SE ZAMERNE NEDOPLNILO
-- ===========================================================================
-- cizrna          USDA na "canned drained" vraci bud surovou cizrnu (378 kcal
--                 proti nasim 137, jina potravina) nebo chrest. Kontrola to
--                 odmitla, takze zustava NULL.
-- sladke brambory USDA opakovane vraci "Sweet Potato puffs, frozen" (161 kcal
--                 proti nasim 86). Take NULL.
-- hruska          vlakninu jsem dohledal (FDC 169118, 3,1 g), ale surovina
--                 'hruska' ve slovniku VUBEC NENI — nebylo ji tedy kam zapsat.
--                 Kontrola poctu to zachytila. Az ji nekdo do slovniku prida,
--                 hodnota je v .cache/usda-fiber.json.
-- koreni          pepr, skorice, muskatovy orisek maji vlakniny hodne, ale jsou
--                 v pantry, takze se do nutrice nepocitaji vubec. Dohledavat
--                 jim vlakninu by nemelo zadny efekt.
-- cukr, med, olej mají vlákniny 0, ale radeji NULL nez zapsana nula z hlavy.
--
-- Zbylych 7 receptu, ktere padaji i po oprave, uz o vlaknine nejsou — jejich
-- ulozene kcal nesedi ani s jednou konvenci. To je jina vec k rozhodnuti.

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_surovin   integer;
  v_pred      integer;
  v_po        integer;
  v_pada      integer;
  v_830       boolean;
  v_833       boolean;
  v_fazole    boolean;
  v_bez_fiber integer;
BEGIN
  -- 1) Vlaknina se doplnila.
  SELECT count(*) INTO v_surovin FROM public.ingredients_nutrition WHERE fiber_g_per_100g IS NOT NULL;
  IF v_surovin <> 36 THEN
    RAISE EXCEPTION 'Vlakninu ma % surovin, cekali jsme 36.', v_surovin;
  END IF;

  -- 2) Migrace nesmela nic deaktivovat.
  SELECT count(*) INTO v_po FROM public.recipes_catalog WHERE active;
  IF v_po <> 463 THEN
    RAISE EXCEPTION 'Aktivnich receptu je % (cekali jsme 463) — neco se deaktivovalo.', v_po;
  END IF;

  -- 3) Brana i trigger updated_at musi byt zpatky zapnute.
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.recipes_catalog'::regclass
              AND NOT tgisinternal AND tgenabled = 'D') THEN
    RAISE EXCEPTION 'Na recipes_catalog zustal vypnuty trigger.';
  END IF;

  -- 4) TO PODSTATNE: 830 a 833 uz projdou BEZ naplasti high_fiber.
  SELECT public.atwater_ok(kcal, protein_g, carbs_g, fat_g, public.recipe_fiber_g(ingredients), 10.0)
    INTO v_830 FROM public.recipes_catalog WHERE id = 830;
  SELECT public.atwater_ok(kcal, protein_g, carbs_g, fat_g, public.recipe_fiber_g(ingredients), 10.0)
    INTO v_833 FROM public.recipes_catalog WHERE id = 833;
  IF NOT v_830 OR NOT v_833 THEN
    RAISE EXCEPTION 'Recepty 830/833 stale nesplnuji Atwater (830=%, 833=%).', v_830, v_833;
  END IF;

  -- 5) A "Fazole s ryzi" (id 317) MUSI dal projit — to je ten recept, ktery by
  --    varianta "vzdy odecist vlakninu" rozbila.
  SELECT public.atwater_ok(kcal, protein_g, carbs_g, fat_g, public.recipe_fiber_g(ingredients), 10.0)
    INTO v_fazole FROM public.recipes_catalog WHERE id = 317;
  IF NOT v_fazole THEN
    RAISE EXCEPTION 'Recept 317 (Fazole s ryzi) prestal splnovat Atwater — obousmerna kontrola nefunguje.';
  END IF;

  -- 6) Pocet receptu, ktere Atwater vyrazuje, musel klesnout ze 17 na 7.
  SELECT count(*) INTO v_pada FROM public.recipes_catalog
  WHERE kcal > 0 AND protein_g IS NOT NULL AND carbs_g IS NOT NULL AND fat_g IS NOT NULL
    AND NOT public.atwater_ok(kcal, protein_g, carbs_g, fat_g, public.recipe_fiber_g(ingredients), 10.0);
  IF v_pada <> 7 THEN
    RAISE EXCEPTION 'Atwater vyrazuje % receptu, cekali jsme 7.', v_pada;
  END IF;

  -- 7) fiber_g na receptech se naplnil.
  SELECT count(*) INTO v_bez_fiber FROM public.recipes_catalog WHERE fiber_g IS NULL;
  IF v_bez_fiber > 0 THEN
    RAISE EXCEPTION 'U % receptu se nenaplnil fiber_g.', v_bez_fiber;
  END IF;

  RAISE NOTICE 'Vlaknina u % surovin. Atwater vyrazuje uz jen % receptu (bylo 17), aktivnich %, zadna regrese.',
    v_surovin, v_pada, v_po;
END $$;
