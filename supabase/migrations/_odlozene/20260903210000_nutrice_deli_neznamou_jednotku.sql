-- ODLOŽENO 8.9 (re-review 4. 9. 2026) — NEAPLIKOVAT bez samostatné kontroly.
--
-- Diagnóza, ze které tahle migrace vznikla, byla vedle: `unit` má v JSON
-- schématu generátoru enum ['g','ml'] (lib/recipeGenerator.js,
-- RESPONSE_SCHEMA), model jinou jednotku vrátit NEMŮŽE — rozdělení na
-- `units_unmatched` řeší latentní chybu ve funkci, ne skutečnou příčinu
-- pádů fronty (ta byla jinde, viz 8.10).
--
-- Soubor zůstává schválně, ne jako mrtvý kód, ale protože obsah je pořád
-- věcně správný a bude potřeba, jen NE HNED: mění návratový typ
-- `compute_nutrition_for_ingredients`/`compute_recipe_nutrition`, na kterých
-- visí view `system_health_alerts_zaklad` (ALTER FUNCTION s jinou návratovou
-- tabulkou u funkce s závislými objekty typicky vyžaduje DROP/CREATE pořadí,
-- ne prosté CREATE OR REPLACE) — to chce samostatnou kontrolu, ne protlačit
-- spolu s 8.10. Přesunuto z `supabase/migrations/` do `_odlozene/`, ať ho
-- nasazovací skript nesebere jako další migraci v pořadí.
--
-- "Neznámá surovina", která není neznámá — chyba je v jednotce.
-- docs/DALSI_KROK.md 8.9.
--
-- ===========================================================================
-- CO SE DĚJE DNES
-- ===========================================================================
-- `compute_nutrition_for_ingredients` označí řádek za nedohledaný, když
-- neplatí `inu.name_cs is not null AND sg.gramu is not null`. Do
-- `ingredients_unmatched` ale jde NÁZEV SUROVINY v OBOU případech — i tehdy,
-- kdy slovník surovinu zná a spadl jen převod jednotky na gramy.
--
-- Změřeno 3. 9. na produkci, `losos` (ve slovníku JE: name_cs='losos',
-- 208 kcal/100 g):
--
--   jednotka   ingredients_unmatched   kcal
--   g          []                      2.1
--   kus        ["losos"]               null
--   kg         ["losos"]               null
--   gram       ["losos"]               null
--
-- Losos je pokaždé ve slovníku — padá to na jednotce, ne na surovině. Důsledek
-- je horší, než že recept spadne: `nedohledane` z tyhle chyby jde do dalšího
-- pokusu jako `tyhle_suroviny_neznam: ["losos"]` a modelu se zakáže surovina,
-- která byla celou dobu v pořádku. Fronta si sama zužuje prostor.
--
-- ===========================================================================
-- CO SE MĚNÍ
-- ===========================================================================
-- Návratový sloupec `units_unmatched text[]` navíc, na konci `RETURNS TABLE`:
--
--   ingredients_unmatched = jen řádky, kde `inu.name_cs IS NULL`
--                            (slovník název NEZNÁ)
--   units_unmatched       = jen řádky, kde `inu.name_cs IS NOT NULL`
--                            ale `sg.gramu IS NULL` (slovník surovinu zná,
--                            selhal převod jednotky)
--
-- Zanedbatelnost (`is_pantry_ingredient`) se chová PŘESNĚ jako dnes — pantry
-- řádek nejde do žádného z těch dvou polí, stejně jako dnes nejde do
-- `ingredients_unmatched`. `complete` je beze změny: `not ok and not
-- zanedbatelna` je pořád jediná podmínka, jen se stejná množina řádků navíc
-- rozpadá na dva výstupní seznamy MÍSTO JEDNOHO.
--
-- Zbytek těla (aliasy surovin, 4stupňové hledání jednotky včetně T/t
-- zábradlí z 20260804160000, pantry logika z 20260804230000) je BEZE ZMĚNY —
-- vychází se z aktuální verze funkce, ne z prvního zápisu z 20260803110000.
--
-- ===========================================================================
-- 'kus' / 'kusy' / 'kusů' = '' A 'ks' — PROČ NORMALIZACE UVNITŘ FUNKCE,
-- NE ALIAS TABULKA, NE DUPLICITNÍ ŘÁDKY
-- ===========================================================================
-- `unit_conversions` má dnes ~115 řádků klíčovaných na '' nebo 'ks' pro
-- konkrétní suroviny (vejce, banán, jarní cibulka, houby, ...) — a NE VŽDY
-- OBĚ: 'vejce' má jen 'ks', 'jahody' jen '', jarní cibulka OBĚ (se stejnou
-- gramáží, to hlídá kontrola v 20260804170000). Zkopírovat všech ~115 řádků
-- pod 'kus'/'kusy'/'kusů' by znamenalo tři nové zdroje pravdy pro totéž číslo.
--
-- `ingredient_aliases` (alias_normalized/canonical_normalized) NENÍ správné
-- místo — ta tabulka aliasuje NÁZVY SUROVIN ("olive oil" -> "olivový olej"),
-- ne JEDNOTKY. Přetížit ji jednotkami by smíchalo dva different alfabety
-- (názvy vs. jednotky) do jednoho sloupce a riskovalo kolizi, kdyby se
-- string, co je dnes jednotka, jednou objevil i jako název suroviny.
--
-- Řešení: nový, samostatný KROK 0 v `s_gramy`, PŘED dnešními čtyřmi kroky.
-- Pro jednotku 'kus'/'kusy'/'kusů' zkusí `unit_conversions` se stejnou
-- surovinou pod '' NEBO 'ks' — cokoli z obou existuje. `max(...) having
-- count(distinct grams) = 1` je STEJNÝ vzor jako case-insensitive kroky 2 a 4
-- níž: když by se '' a 'ks' u nějaké suroviny rozešly v gramáži (dnes se
-- neděje, kontrola v 20260804170000 to hlídá), krok 0 mlčky selže a spadne na
-- kroky 1–4 (tam neuspěje taky, protože 'kus' se doslovně nerovná '' ani
-- 'ks') — je to bezpečnější než scalar subquery, který by na dvou různých
-- hodnotách spadl na chybu "more than one row returned by a subquery".
--
-- Krok 0 nemění chování žádné jiné jednotky: pro cokoli jiného než
-- 'kus'/'kusy'/'kusů' vrátí `where` podmínka nula řádků a coalesce pokračuje
-- kroky 1–4 přesně jako dnes. OBECNÝ fallback pro 'kus' (ingredient_match is
-- null) se NEPŘIDÁVÁ — to by znamenalo hádat gramáž bez ohledu na surovinu,
-- přesně to, co 8.9 zakazuje (jeden kus lososa a jeden stroužek česneku
-- nejsou stejná gramáž).

CREATE OR REPLACE FUNCTION public.compute_nutrition_for_ingredients(p_ingredients jsonb)
 RETURNS TABLE(kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
               ingredients_total integer, ingredients_matched integer,
               ingredients_unmatched text[], complete boolean,
               units_unmatched text[])
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
      -- 0) 'kus'/'kusy'/'kusů' = '' NEBO 'ks' pro danou surovinu — viz
      --    zdůvodnění v hlavičce migrace 20260903210000.
      (select max(uc.grams) from public.unit_conversions uc
        where lower(trim(res.jednotka)) in ('kus', 'kusy', 'kusů')
          and uc.unit in ('', 'ks')
          and lower(extensions.unaccent(uc.ingredient_match)) = res.rn
        having count(distinct uc.grams) = 1),
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
    (not (inu.name_cs is not null and sg.gramu is not null)
      and public.is_pantry_ingredient(sg.rn)) as zanedbatelna,
    -- ROZDĚLENÍ CHYBY (8.9). Slovník surovinu VŮBEC NEZNÁ, vs. slovník ji zná
    -- a spadl JEN převod jednotky. Dřív obě padaly do jednoho pole a chyba
    -- obviňovala surovinu i tehdy, kdy byl problém v jednotce.
    (inu.name_cs is null) as neznama_surovina,
    (inu.name_cs is not null and sg.gramu is null) as neznama_jednotka
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
  coalesce(array_agg(surovina) filter (where neznama_surovina and not zanedbatelna), '{}'::text[]),
  (count(*) filter (where not ok and not zanedbatelna) = 0),
  coalesce(array_agg(surovina) filter (where neznama_jednotka and not zanedbatelna), '{}'::text[])
from spojeno;
$function$;

COMMENT ON FUNCTION public.compute_nutrition_for_ingredients(jsonb) IS
  'Nutrice ze surovin. Jednotka se hleda nejdriv pro "kus/kusy/kusu" jako "" '
  'nebo "ks", pak presne, pak case-insensitive a jen kdyz je jednoznacna '
  '(T=15 g vs t=5 g se nesmi slit). Pantry surovina, kterou neumime spocitat, '
  'se bere jako nulova. ingredients_unmatched = slovnik nezna nazev; '
  'units_unmatched = slovnik nazev zna, ale selhal prevod jednotky na gramy — '
  'ty dve veci se od 8.9 nemichaji, viz docs/DALSI_KROK.md.';

-- Tenka obalka: schema se musi shodovat, tela zustava `select c.*`.
CREATE OR REPLACE FUNCTION public.compute_recipe_nutrition(p_recipe_id bigint)
RETURNS TABLE(kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
              ingredients_total integer, ingredients_matched integer,
              ingredients_unmatched text[], complete boolean,
              units_unmatched text[])
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  select c.*
  from public.recipes_catalog r
  cross join lateral public.compute_nutrition_for_ingredients(r.ingredients) c
  where r.id = p_recipe_id;
$function$;

-- ---------------------------------------------------------------------------
-- Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_kcal            numeric;
  v_ingr_unmatched  text[];
  v_units_unmatched text[];
  v_complete        boolean;
  v_lzice numeric;
  v_lzicka numeric;
  v_pocet_testovano integer;
  v_rozdil          integer;
BEGIN
  -- 1) Znama surovina v NEZNAME JEDNOTCE: musí jít do units_unmatched,
  --    NIKDY do ingredients_unmatched. Losos je přesně ten případ z 3. 9.
  SELECT ingredients_unmatched, units_unmatched, complete
    INTO v_ingr_unmatched, v_units_unmatched, v_complete
  FROM public.compute_nutrition_for_ingredients(
    '[{"name":"losos","amount":1,"unit":"kg"}]'::jsonb);

  IF v_ingr_unmatched IS NULL OR v_ingr_unmatched <> '{}'::text[] THEN
    RAISE EXCEPTION 'losos v jednotce kg skoncil v ingredients_unmatched: %', v_ingr_unmatched;
  END IF;
  IF v_units_unmatched IS NULL OR NOT ('losos' = ANY(v_units_unmatched)) THEN
    RAISE EXCEPTION 'losos v jednotce kg nema skoncit v units_unmatched, ma: %', v_units_unmatched;
  END IF;
  IF v_complete IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'losos v jednotce kg ma dat complete=false, dal %', v_complete;
  END IF;

  -- 2) Skutecne neznama surovina musi zustat v ingredients_unmatched.
  SELECT ingredients_unmatched INTO v_ingr_unmatched
  FROM public.compute_nutrition_for_ingredients(
    '[{"name":"úplně vymyšlená surovina xyz","amount":1,"unit":"g"}]'::jsonb);
  IF NOT ('úplně vymyšlená surovina xyz' = ANY(v_ingr_unmatched)) THEN
    RAISE EXCEPTION 'neznama surovina se ztratila z ingredients_unmatched: %', v_ingr_unmatched;
  END IF;

  -- 3) Losos v gramech dal pracuje jako dnes (2,1 kcal na 1 g, complete=true).
  SELECT kcal, complete INTO v_kcal, v_complete
  FROM public.compute_nutrition_for_ingredients(
    '[{"name":"losos","amount":1,"unit":"g"}]'::jsonb);
  IF v_kcal IS NULL OR abs(v_kcal - 2.1) > 0.1 OR v_complete IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'losos v gramech se zmenil: kcal=%, complete=%', v_kcal, v_complete;
  END IF;

  -- 4) T/t se stale nesmi slit (zabradli z 20260804160000).
  SELECT kcal INTO v_lzice FROM public.compute_nutrition_for_ingredients(
    '[{"name":"olivový olej","amount":1,"unit":"T"}]'::jsonb);
  SELECT kcal INTO v_lzicka FROM public.compute_nutrition_for_ingredients(
    '[{"name":"olivový olej","amount":1,"unit":"t"}]'::jsonb);
  IF v_lzice IS NULL OR v_lzicka IS NULL OR v_lzice = v_lzicka THEN
    RAISE EXCEPTION 'Kontrola T/t selhala: T=%, t=%', v_lzice, v_lzicka;
  END IF;

  -- 5) 'kus'/'kusy'/'kusů' dá STEJNOU gramáž jako existující '' nebo 'ks' —
  --    testováno napříč CELÝM slovníkem, ne na jedné natvrdo vybrané surovině,
  --    protože produkci neměříme a nemůžeme si být jistí, která konkrétní
  --    surovina má který řádek. Zaroven overuje, ze se aspon neco otestovalo.
  SELECT count(*), count(*) FILTER (WHERE rozdil) INTO v_pocet_testovano, v_rozdil
  FROM (
    SELECT
      inu.name_cs,
      (
        SELECT c.kcal FROM public.compute_nutrition_for_ingredients(
          jsonb_build_array(jsonb_build_object('name', inu.name_cs, 'amount', 1, 'unit', 'kus'))
        ) c
      ) IS DISTINCT FROM (
        SELECT c.kcal FROM public.compute_nutrition_for_ingredients(
          jsonb_build_array(jsonb_build_object(
            'name', inu.name_cs, 'amount', 1, 'unit',
            (SELECT uc.unit FROM public.unit_conversions uc
              WHERE uc.unit IN ('', 'ks')
                AND lower(extensions.unaccent(uc.ingredient_match))
                    = lower(extensions.unaccent(inu.name_cs))
              LIMIT 1)
          ))
        ) c
      ) AS rozdil
    FROM public.ingredients_nutrition inu
    WHERE EXISTS (
      SELECT 1 FROM public.unit_conversions uc
      WHERE uc.unit IN ('', 'ks')
        AND lower(extensions.unaccent(uc.ingredient_match))
            = lower(extensions.unaccent(inu.name_cs))
    )
  ) t;

  IF v_pocet_testovano = 0 THEN
    RAISE EXCEPTION 'Kontrola "kus" nemela na cem testovat — zadna surovina s "" ani "ks" prevodem.';
  END IF;
  IF v_rozdil > 0 THEN
    RAISE EXCEPTION '"kus" se rozesel s existujicim "" / "ks" prevodem u % ze % surovin.', v_rozdil, v_pocet_testovano;
  END IF;

  RAISE NOTICE 'Kontroly OK. "kus" se shoduje s "" / "ks" u vsech % testovanych surovin.', v_pocet_testovano;
END $$;
