-- Dietní příznaky surovin + brána, která je vynutí.
--
-- PROBLÉM, KTERÝ TO ŘEŠÍ: generátor dostával do promptu celý slovník včetně
-- masa a vajec i pro položky s diet_tags = ['vegan'], a diet_tags se do
-- katalogu zapisovaly tak, jak je vrátil model. Nic v DB ani v JS nekontrolovalo,
-- že recept označený jako vegan opravdu vegan je. Jediná pojistka bylo ruční
-- schvalování, což je přesně ten typ kontroly, který selže se zvyšujícím se
-- objemem — a u gluten_free nebo alergenů by nešlo o důvěru, ale o zdraví.
--
-- ŘEŠENÍ: deterministické příznaky na surovinách + kontrola v triggeru,
-- stejný princip jako u nutrice. Model může tvrdit cokoli; aktivní bude jen
-- recept, jehož všechny suroviny příznak skutečně mají.
--
-- ZÁMĚRNÁ ROZHODNUTÍ U HRANIČNÍCH PŘÍPADŮ:
--   * Chléb, toast, těstoviny, mouka, strouhanka a kuskus jsou vedené jako
--     vegan. V ČR je běžný pultový výrobek bez vajec a mléka; vaječné těstoviny
--     jsou samostatná surovina, kterou lze doplnit zvlášť. Bez tohoto
--     rozhodnutí by nešlo postavit prakticky žádný vegan oběd.
--   * Cukr je vegan — v EU se vyrábí z řepy, kostní uhel je americká specialita.
--   * Víno a ocet jsou vegan; čiřidla živočišného původu se u běžných
--     kuchyňských vín neuvádějí a nelze je z názvu suroviny poznat.
--   * Proteinový prášek je vedený jako NEvegetariánský, protože ze samotného
--     názvu nejde poznat syrovátku od rostlinné směsi. Raději zbytečně přísně.
--   * Müsli je vegetariánské, ne vegan — med a sušené mléko jsou v běžných
--     směsích časté.
--   * Worcesterská omáčka není ani vegetariánská (ančovičky).

ALTER TABLE public.ingredients_nutrition
  ADD COLUMN IF NOT EXISTS is_vegan      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_vegetarian boolean NOT NULL DEFAULT false;

ALTER TABLE public.pantry_ingredients
  ADD COLUMN IF NOT EXISTS is_vegan      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_vegetarian boolean NOT NULL DEFAULT false;

-- Vegan bez vegetariánského je nesmysl; ať to nejde ani omylem zapsat.
ALTER TABLE public.ingredients_nutrition
  DROP CONSTRAINT IF EXISTS ingredients_nutrition_vegan_implies_vegetarian;
ALTER TABLE public.ingredients_nutrition
  ADD CONSTRAINT ingredients_nutrition_vegan_implies_vegetarian
  CHECK (NOT is_vegan OR is_vegetarian);

ALTER TABLE public.pantry_ingredients
  DROP CONSTRAINT IF EXISTS pantry_ingredients_vegan_implies_vegetarian;
ALTER TABLE public.pantry_ingredients
  ADD CONSTRAINT pantry_ingredients_vegan_implies_vegetarian
  CHECK (NOT is_vegan OR is_vegetarian);

-- ---------------------------------------------------------------------------
-- Klasifikace surovin. Tři seznamy, ručně projité, žádný odhad modelu.
-- Co v žádném seznamu není, zůstává false/false — bezpečný default pro
-- suroviny, které do tabulky přibudou později (import ze Spoonacularu).
-- ---------------------------------------------------------------------------

UPDATE public.ingredients_nutrition SET is_vegan = true, is_vegetarian = true
WHERE name_cs = ANY (ARRAY[
  'agáve','ananas','arašídové máslo','avokádo','balsamico ocet','banán','bazalka',
  'bílé víno','bobkový list','borůvky','brambory','brokolice','broskev','brusinky',
  'bulgur','celer','celozrnný chléb','celozrnný toast','čerstvé ovoce','červené víno',
  'červený vinný ocet','česnek','česnekový prášek','chia semínka','chili papričky',
  'chili prášek','chřest','cibule','cibulový prášek','citron','citronová kůra',
  'citronová šťáva','cizrna','čočka','cuketa','cukr','dijonská hořčice','dýňová semínka',
  'edamame','fazole','fenykl','garam masala','hnědý cukr','hořčice','houby','hrášek',
  'hummus','jablečná omáčka','jablečný ocet','jablko','jáhly','jahody','jalapeño',
  'jarní cibulka','javorový sirup','jedlá soda','kakaový prášek','kapusta','kari koření',
  'kečup','kešu','kiwi','kmín','kokosové mléko','kokosový olej','kopr','koriandr',
  'kukuřice','kukuřičný škrob','kurkuma','kuskus','květák','lilek','limetka',
  'lněná semínka','maliny','mandle','mandlové mléko','mango','marinara omáčka',
  'máslová dýně','máta','mletá kurkuma','mletý kmín','mletý koriandr','mletý zázvor',
  'mouka','mrkev','muškátový oříšek','ocet','okurka','olej','olivový olej','ořechy',
  'oregano','ovesné mléko','ovesné vločky','paprika','paprika (červená)','pažitka',
  'pekany','pepř','petržel','pinové oříšky','pohanka','pomerančová šťáva','pórek',
  'prášek do pečiva','quinoa','rajčatová omáčka','rajče','rostlinný jogurt','rýže',
  'rýže (bílá)','rýžový ocet','salát (např. ledový)','šalotka','seitan',
  'sezamová semínka','skořice','sladké brambory','slunečnicová semínka','směs salátů',
  'sojová omáčka','sójové maso','sójové mléko','špenát','sriracha','strouhanka','sůl',
  'švýcarský mangold','tahini','tempeh','těstoviny','tofu','třešně','tymián',
  'vanilkový extrakt','vařené ovesné vločky','vlašské ořechy','voda','zázvor',
  'zelené fazolky','zelenina','zeleninový vývar'
]);

-- Vegetariánské, ale ne vegan: mléčné, vejce, med.
UPDATE public.ingredients_nutrition SET is_vegan = false, is_vegetarian = true
WHERE name_cs = ANY (ARRAY[
  'bílek','bílý jogurt','cheddar','cottage','kefír','majonéza','máslo','med','mléko',
  'mozzarella','müsli','nízkotučné mléko','parmezán','řecký jogurt','ricotta',
  'slazené kondenzované mléko','smetana','smetanový sýr','sýr','tvaroh','vejce','žloutky'
]);

-- Ani jedno. Vyjmenované schválně, aby bylo vidět, že přes ně někdo přemýšlel,
-- a aby kontrola níž mohla ohlásit surovinu, která propadla mezi seznamy.
UPDATE public.ingredients_nutrition SET is_vegan = false, is_vegetarian = false
WHERE name_cs = ANY (ARRAY[
  'bílá ryba','hovězí maso','krabí maso','krevety','krůtí prsa','krůtí prso',
  'kuřecí prsa','kuřecí prso','kuřecí vývar','libové hovězí maso',
  'libové maso (např. vepřové)','losos','proteinový prášek','ryba (např. losos)',
  'ryba (např. treska)','slanina','šunka','tuňák (v konzervě)','vepřová panenka',
  'worcesterská omáčka'
]);

-- Pantry (koření, olej, voda...) se do nutrice nezapočítává, ale do dietní
-- kontroly patří — jsou v něm máslo, med i worcesterská omáčka.
UPDATE public.pantry_ingredients SET is_vegan = true, is_vegetarian = true;
UPDATE public.pantry_ingredients SET is_vegan = false, is_vegetarian = true
WHERE name_normalized IN ('butter', 'honey');
UPDATE public.pantry_ingredients SET is_vegan = false, is_vegetarian = false
WHERE name_normalized = 'worcestershire sauce';

-- Kontrola pokrytí. Neshazuje deploy — false/false je bezpečný default a
-- zablokovat nasazení kvůli surovině, která mezitím přibyla z importu, by
-- bylo horší než ji nechat mimo vegan recepty. Ale ať je to vidět v logu.
DO $kontrola$
DECLARE
  neklasifikovane text;
BEGIN
  SELECT string_agg(name_cs, ', ' ORDER BY name_cs) INTO neklasifikovane
  FROM public.ingredients_nutrition
  WHERE name_cs IS NOT NULL AND btrim(name_cs) <> ''
    AND is_vegan = false AND is_vegetarian = false
    AND name_cs <> ALL (ARRAY[
      'bílá ryba','hovězí maso','krabí maso','krevety','krůtí prsa','krůtí prso',
      'kuřecí prsa','kuřecí prso','kuřecí vývar','libové hovězí maso',
      'libové maso (např. vepřové)','losos','proteinový prášek','ryba (např. losos)',
      'ryba (např. treska)','slanina','šunka','tuňák (v konzervě)','vepřová panenka',
      'worcesterská omáčka'
    ]);

  IF neklasifikovane IS NOT NULL THEN
    RAISE WARNING 'DIETNI PRIZNAKY: neklasifikovane suroviny zustavaji mimo vegan i vegetarianske recepty: %', neklasifikovane;
  END IF;
END;
$kontrola$;

-- ---------------------------------------------------------------------------
-- Které suroviny receptu odporují dietnímu tagu.
--
-- Páruje suroviny stejně jako compute_nutrition_for_ingredients — normalizace,
-- aliasy, pak shoda na name_cs — aby brána nikdy nehodnotila jinou surovinu,
-- než ze které se počítá nutrice.
--
-- Neznámá surovina = konflikt. Je to přísné schválně: recept, jehož surovinu
-- neumíme zařadit, nemá co dělat v jídelníčku někoho, kdo si vybral dietu.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recipe_diet_conflicts(p_ingredients jsonb, p_tag text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
with rozpad as (
  select lower(extensions.unaccent(regexp_replace(trim(i->>'name'), '\s+', ' ', 'g'))) as n_raw
  from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) i
),
res as (
  select coalesce(
    (select a.canonical_normalized from public.ingredient_aliases a
      where a.alias_normalized = rz.n_raw),
    rz.n_raw
  ) as rn
  from rozpad rz
),
posouzeno as (
  select res.rn,
    (select case when p_tag = 'vegan' then inu.is_vegan else inu.is_vegetarian end
       from public.ingredients_nutrition inu
      where lower(extensions.unaccent(inu.name_cs)) = res.rn
      limit 1) as flag_nutrice,
    (select bool_and(case when p_tag = 'vegan' then pi.is_vegan else pi.is_vegetarian end)
       from public.pantry_ingredients pi
      where pi.name_normalized = res.rn
         or (position(' ' in pi.name_normalized) > 0
             and res.rn ~ ('(^|[[:space:]])'
                 || regexp_replace(pi.name_normalized, '([.^$|?*+(){}\[\]\\-])', '\\\1', 'g')
                 || '([[:space:]]|$)'))) as flag_pantry
  from res
)
select coalesce(
  array_agg(distinct rn) filter (where coalesce(flag_nutrice, flag_pantry) is distinct from true),
  '{}'::text[]
)
from posouzeno;
$function$;

-- ---------------------------------------------------------------------------
-- Brána. Přibylo pravidlo f). Zbytek beze změny, jen doplněn search_path —
-- trigger běží v právech zapisujícího a bez něj by šlo podstrčit vlastní
-- count_main_ingredients přes search_path volajícího.
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

  -- 0) čeká na schválení člověkem
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

  -- b) Atwater podle MACRO_KCAL_GATE_TOLERANCE (10 %), high_fiber bránu obchází.
  IF NOT (
    'high_fiber' = ANY(NEW.diet_tags)
    OR (
      round(NEW.kcal) > 0
      AND round(4*NEW.protein_g + 4*NEW.carbs_g + 9*NEW.fat_g) > 0
      AND round(abs((round(NEW.kcal)::numeric - round(4*NEW.protein_g + 4*NEW.carbs_g + 9*NEW.fat_g)::numeric)
                    / round(NEW.kcal)::numeric) * 100, 1) <= 10.0
    )
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

  -- e) ČAS — ZÁMĚRNĚ ZATÍM NEVYNUCOVÁN.
  --
  -- Zapne se po slotech, až denní import doplní katalog: nejdřív obed+vecere
  -- (deaktivovaly by ~21 %), snidane+svacina později (~34-36 %). Limity slotů
  -- jsou snidane 20, svacina 15, obed 30, vecere 30.
  --
  -- IF coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) IS NULL
  --    OR coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) > CASE NEW.meal_type
  --         WHEN 'snidane' THEN 20 WHEN 'svacina' THEN 15 ELSE 30 END THEN
  --   NEW.active := false;
  --   RETURN NEW;
  -- END IF;

  -- f) dietní tag musí sedět se surovinami
  --
  -- Model může vrátit diet_tags jaké chce; aktivní bude jen recept, jehož
  -- všechny suroviny mají příznak skutečně nastavený. Neznámá surovina
  -- se počítá jako konflikt.
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

-- Sweeper deaktivuje recepty, které přestaly vyhovovat. Ať pravidlo f) platí
-- i zpětně na to, co je v katalogu dnes — bez tohohle by se stará data
-- projevila až při první změně řádku.
COMMENT ON FUNCTION public.recipe_diet_conflicts(jsonb, text) IS
  'Vrací suroviny receptu, které odporují dietnímu tagu (vegan/vegetarian). Prázdné pole = v pořádku.';

-- ---------------------------------------------------------------------------
-- Sweeper. Ten umí jen aktivovat (false -> true), takže bez stejné podmínky
-- by při nejbližším běhu vrátil zpátky do provozu přesně ty recepty, které
-- trigger právě vypnul. Brána musí platit na obou místech, jinak neplatí nikde.
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
        OR (
          round(r.kcal) > 0
          AND round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g) > 0
          AND round(abs((round(r.kcal)::numeric - round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g)::numeric)
                        / round(r.kcal)::numeric) * 100, 1) <= 10.0
        )
      )
      AND NOT (
        'vegan' = ANY(r.diet_tags)
        AND array_length(public.recipe_diet_conflicts(r.ingredients, 'vegan'), 1) IS NOT NULL
      )
      AND NOT (
        'vegetarian' = ANY(r.diet_tags)
        AND array_length(public.recipe_diet_conflicts(r.ingredients, 'vegetarian'), 1) IS NOT NULL
      )
      -- ČAS zatím nevynucován — shodně s triggerem, viz 20260801081000.
      -- Až se zapne, platí limity slotů snidane 20, svacina 15, obed 30, vecere 30.
    RETURNING r.id
  )
  SELECT count(*) INTO v_aktivovano FROM zmeneno;

  SELECT count(*) INTO v_aktivnich FROM public.recipes_catalog WHERE active;

  RETURN jsonb_build_object(
    'activated', v_aktivovano,
    'active_total', v_aktivnich,
    'swept_at', now()
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Jednorázový průchod přes to, co v katalogu leží dnes.
--
-- Trigger se pouští jen při zápisu, takže staré řádky by zůstaly aktivní až
-- do první změny. Zpětný průchod je proto nutný — ale záměrně NESYMETRICKÝ:
--
--   vegan       přísně (i neznámá surovina = konflikt). Vegan je dnes vypnutý
--               v registraci, takže deaktivace nikomu nerozbije jídelníček,
--               a mezi zasaženými jsou tři recepty, které mají dairy uvnitř:
--               „Ovesná kaše přes noc“ (smetana), „Pečená švestková ovesná
--               kaše“ (milk) a „Polévka z bílých fazolí a kapusty“
--               (parmazánová kůra). Poslední dva se navíc tváří jako dairy_free.
--
--   vegetarian  jen prokazatelné případy, tedy surovina, kterou máme ve
--               slovníku a víme o ní, že vegetariánská není. Přísná varianta
--               by vypnula přes 100 ze 127 aktivních vegetariánských receptů —
--               ne proto, že by v nich bylo maso, ale protože jejich suroviny
--               nemáme namapované („eggs“, „greek yogurt“, „bell pepper“).
--               To je problém chybějících aliasů, ne diety, a vyřeší se
--               doplněním slovníku. Do té doby by přísná verze rozbila
--               generování jídelníčků živým uživatelům.
--
-- Až budou aliasy doplněné, stačí spustit stejný UPDATE bez omezení na
-- známé suroviny a vegetarian se dorovná na stejnou přísnost jako vegan.
-- ---------------------------------------------------------------------------
UPDATE public.recipes_catalog r
SET active = false
WHERE r.active
  AND 'vegan' = ANY(r.diet_tags)
  AND array_length(public.recipe_diet_conflicts(r.ingredients, 'vegan'), 1) IS NOT NULL;

UPDATE public.recipes_catalog r
SET active = false
WHERE r.active
  AND 'vegetarian' = ANY(r.diet_tags)
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(r.ingredients, '[]'::jsonb)) i
    JOIN public.ingredients_nutrition inu
      ON lower(extensions.unaccent(inu.name_cs)) = coalesce(
           (SELECT a.canonical_normalized FROM public.ingredient_aliases a
             WHERE a.alias_normalized = lower(extensions.unaccent(regexp_replace(trim(i->>'name'), '\s+', ' ', 'g')))),
           lower(extensions.unaccent(regexp_replace(trim(i->>'name'), '\s+', ' ', 'g')))
         )
    WHERE inu.is_vegetarian = false
  );
