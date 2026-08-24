-- Bezlepkový a nízkosacharidový tag se ODVOZUJÍ, neberou se od modelu.
--
-- PROČ. Brána dosud ověřovala dietní tag proti surovinám jen u `vegan`
-- a `vegetarian`. `gluten_free` se zapisoval tak, jak ho vrátil model, a nic
-- ho nekontrolovalo. Změřeno 24. 8. 2026: čtyři aktivní recepty označené
-- `gluten_free` obsahovaly celozrnný chléb, toast nebo müsli — id 963, 1214,
-- 1530, 1531. Celiak by od nás dostal lepek. (Tagy byly ručně sundané ještě
-- před touhle migrací; tohle řeší příčinu, ne ty čtyři řádky.)
--
-- Původní migrace 20260803130000 to předpověděla doslova: „u gluten_free nebo
-- alergenů by nešlo o důvěru, ale o zdraví“. Příznak tehdy nevznikl.
--
-- CO SE MĚNÍ:
--   1. `ingredients_nutrition.obsahuje_lepek` — deterministický příznak.
--   2. `recipe_diet_conflicts` umí i `gluten_free`.
--   3. Brána tagy `gluten_free` a `low_carb` PŘEPOČÍTÁVÁ, místo aby je
--      ověřovala. Model je tvrdit může, do katalogu se nedostanou.
--
-- NEZNÁMÁ SUROVINA BLOKUJE TAG. „Nevíme“ není „bez lepku“ — surovina, která
-- ve slovníku ani ve spíži není, tag shodí. Změřeno: 96,1 % surovin
-- v receptech s tímhle tagem se dohledá, 27 receptů ze 199 má aspoň jednu
-- neznámou a tag ztratí. To je správná strana chyby.
--
-- OVES JE VEDENÝ JAKO LEPKOVÝ, i když ho botanicky neobsahuje. Běžné vločky
-- se melou na stejné lince jako pšenice a certifikované bezlepkové jsou
-- samostatný výrobek, který z názvu suroviny nepoznáme. Stejná logika jako
-- u proteinového prášku v 20260803130000: raději zbytečně přísně. Až bude
-- ve slovníku „bezlepkové ovesné vločky“, dostane příznak false.

alter table public.ingredients_nutrition
  add column if not exists obsahuje_lepek boolean;
alter table public.pantry_ingredients
  add column if not exists obsahuje_lepek boolean;

comment on column public.ingredients_nutrition.obsahuje_lepek is
  'true = obsahuje lepek nebo u něj hrozí kontaminace (oves). false = bez lepku. '
  'NULL = neposouzeno; blokuje odvození gluten_free.';

-- Výchozí stav: všechno ve slovníku je bez lepku. Přepíše se seznamem níž.
-- Suroviny, které ve slovníku nejsou, zůstávají neznámé a tag shodí samy.
update public.ingredients_nutrition set obsahuje_lepek = false where obsahuje_lepek is null;
update public.pantry_ingredients   set obsahuje_lepek = false where obsahuje_lepek is null;

-- Zdroje lepku. Vzory, ne přesné názvy — slovník roste a „celozrnný chléb“,
-- „vícezrnný chléb“ i „challah chléb“ jsou tentýž problém.
--
-- POZOR NA FALEŠNÉ SHODY. Tyhle vzory by chytly i suroviny, které lepek
-- nemají, proto je výjimka níž:
--   kokosová mouka, pohanková mouka   — mouky bez lepku
--   kukuřičná krupice                 — polenta, ne pšeničná krupice
--   prášek do pečiva                  — chytal by se na „pečiv“
update public.ingredients_nutrition
set obsahuje_lepek = true
where name_cs ~* '(pšenic|žitn|ječmen|špalda|chléb|chleb|houska|rohlík|bageta|toast|pita|tortilla|wrap|těstovin|špagety|nudle|kuskus|bulgur|krupic|mouk|strouhank|seitan|müsli|musli|granol|palačink|knedlík|piškot|croissant|oves|ovesn|sojová omáčka|sójová omáčka|pivo)'
  and name_cs !~* '(kokosová mouka|pohanková mouka|kukuřičná krupice|prášek do pečiva|rýžová mouka|mandlová mouka|cizrnová mouka)';

update public.pantry_ingredients
set obsahuje_lepek = true
where name_normalized ~* '(psenic|zitn|jecmen|spalda|chleb|houska|rohlik|bageta|toast|pita|tortilla|wrap|testovin|spagety|nudle|kuskus|bulgur|krupic|mouk|strouhank|seitan|musli|granol|palacink|knedlik|piskot|croissant|oves|sojova omacka|pivo)'
  and name_normalized !~* '(kokosova mouka|pohankova mouka|kukuricna krupice|prasek do peciva|ryzova mouka|mandlova mouka|cizrnova mouka)';

-- ------------------------------------------------------- konflikty pro tag

-- Rozšíření o `gluten_free`. Zbytek beze změny — vegan i vegetarian se
-- vyhodnocují přesně jako dřív.
create or replace function public.recipe_diet_conflicts(p_ingredients jsonb, p_tag text)
returns text[]
language sql
stable
set search_path to ''
as $function$
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
    (select case
              when p_tag = 'vegan' then inu.is_vegan
              when p_tag = 'gluten_free' then (inu.obsahuje_lepek is false)
              else inu.is_vegetarian
            end
       from public.ingredients_nutrition inu
      where lower(extensions.unaccent(inu.name_cs)) = res.rn
      limit 1) as flag_nutrice,
    (select bool_and(case
                       when p_tag = 'vegan' then pi.is_vegan
                       when p_tag = 'gluten_free' then (pi.obsahuje_lepek is false)
                       else pi.is_vegetarian
                     end)
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

-- ------------------------------------------------------- odvozené tagy

-- Podíl sacharidů na energii. `low_carb` je čistě odvozená vlastnost maker,
-- příznak na surovinách na ni nepotřebuje.
create or replace function public.podil_sacharidu(p_kcal numeric, p_carbs_g numeric)
returns numeric
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_kcal is null or p_kcal <= 0 or p_carbs_g is null or p_carbs_g < 0 then null
    else (p_carbs_g * 4.0) / p_kcal
  end;
$$;

comment on function public.podil_sacharidu(numeric, numeric) is
  'Podíl energie ze sacharidů, 0..1. NULL když se nedá spočítat.';

-- Práh pro `low_carb`: 26 % energie ze sacharidů.
--
-- PROČ 26. Je to běžná klinická definice nízkosacharidové stravy. Změřeno
-- 24. 8. 2026, kolik aktivních receptů projde: snídaně 38, svačina 32,
-- oběd 56, večeře 73 — všude nad hranicí 7 na slot (MIN_RECEPTU_NA_SLOT),
-- takže zbývá prostor na pestrost.
--
-- Dosavadní tag od modelu měl medián 13 %, ale devadesátý percentil 40 %
-- a maximum 91 %. Tag tedy neznamenal nic spolehlivého.
create or replace function public.je_low_carb(p_kcal numeric, p_carbs_g numeric)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(public.podil_sacharidu(p_kcal, p_carbs_g) <= 0.26, false);
$$;

comment on function public.je_low_carb(numeric, numeric) is
  'Práh 0.26 = 26 % energie ze sacharidů. Zrcadlí PRAH_LOW_CARB v lib/dietTagy.js.';

-- ------------------------------------------------- přepočet odvozených tagů

-- Odvozené tagy spočítané z dat. JEDINÉ místo, kde ten přepočet žije.
--
-- PROČ FUNKCE A NE KÓD V BRÁNĚ. Potřebují ho dva volající: brána při každém
-- zápisu a backfill na konci téhle migrace. Dvě kopie by se rozešly přesně
-- v okamžiku, kdy na tom záleží — backfill by pak katalog „opravil" na jiný
-- stav, než jaký brána vynucuje.
--
-- Ostatní tagy zůstávají, jak jsou. Přepisují se jen ty dva odvozené.
create or replace function public.prepocti_odvozene_tagy(
  p_tagy text[], p_ingredients jsonb, p_kcal numeric, p_carbs_g numeric
)
returns text[]
language plpgsql
stable
set search_path to 'public'
as $function$
DECLARE
  v_tagy text[];
BEGIN
  v_tagy := coalesce(p_tagy, '{}'::text[]);

  -- gluten_free: jen když to potvrdí VŠECHNY suroviny. Neznámá surovina
  -- tag shodí — „nevíme" není „bez lepku".
  v_tagy := array_remove(v_tagy, 'gluten_free');
  IF array_length(public.recipe_diet_conflicts(p_ingredients, 'gluten_free'), 1) IS NULL THEN
    v_tagy := v_tagy || 'gluten_free';
  END IF;

  -- low_carb: čistě z maker, práh 26 % energie ze sacharidů.
  v_tagy := array_remove(v_tagy, 'low_carb');
  IF public.je_low_carb(p_kcal, p_carbs_g) THEN
    v_tagy := v_tagy || 'low_carb';
  END IF;

  RETURN v_tagy;
END;
$function$;

comment on function public.prepocti_odvozene_tagy(text[], jsonb, numeric, numeric) is
  'Prepocte gluten_free a low_carb z dat, ostatni tagy necha byt. '
  'Pouziva brana i backfill - jedine misto, kde ten prepocet zije.';

-- ------------------------------------------------------- brána

-- Brána přepočítává `gluten_free` a `low_carb` MÍSTO toho, aby je ověřovala.
--
-- Rozdíl je podstatný. Ověření by recept s falešným tagem deaktivovalo —
-- přišli bychom o dobré jídlo kvůli špatnému štítku. Recept sám v pořádku je,
-- lže jenom tag. Proto se tag přepíše a recept zůstane aktivní.
--
-- Opačný směr platí taky: recept, který podmínku splňuje a tag nemá, ho
-- dostane. Katalog tím přestává být závislý na tom, co si model vzpomene
-- napsat.
--
-- Podmínky a) až h) níž zůstávají beze změny.
create or replace function public.enforce_recipe_catalog_rules()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
BEGIN
  -- ODVOZENÉ TAGY SE PŘEPOČÍTÁVAJÍ VŽDY, i u neaktivního receptu.
  -- Jinak by řádek čekající na aktivaci nesl tvrzení od modelu, na které se
  -- pak podívá sweeper.
  NEW.diet_tags := public.prepocti_odvozene_tagy(
    NEW.diet_tags, NEW.ingredients, NEW.kcal, NEW.carbs_g
  );

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

  -- e) ČAS — ZAPNUTO PRO VŠECHNY SLOTY.
  --      snidane 20, svacina 15, obed 30, vecere 30.
  --
  -- NULL NEDEAKTIVUJE. Podmínka je "známe čas A je nad limitem".
  IF coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) IS NOT NULL
     AND coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated)
         > public.slot_time_limit(NEW.meal_type) THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- f) vegan a vegetarian se OVĚŘUJÍ, nepřepočítávají. Recept bez masa není
  --    automaticky nabídka pro vegana — u těchhle diet je tag i rozhodnutí
  --    o zařazení, ne jen popis složení.
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

  -- g) POSTUP PŘÍPRAVY. Jídlo bez návodu je horší než jídlo, které se
  --    nenabídne. Na rozdíl od času tady NULL DEAKTIVUJE.
  IF NOT public.recipe_ma_postup(NEW.instructions_cs) THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- h) SUROVINY MUSÍ BÝT PŘELOŽENÉ. Přejatá slova (quinoa, tofu, feta…)
  --    se nepočítají — viz je_prejata_surovina().
  IF public.recipe_neprelozenych_surovin(NEW.ingredients) > 0 THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------- backfill

-- ===========================================================================
-- BEZ TOHOHLE BY MIGRACE NESPRAVILA NIC, CO UŽ V KATALOGU LEŽÍ
-- ===========================================================================
-- Brána přepočítává tagy PŘI ZÁPISU. Recept, do kterého nikdo nesáhne, si
-- tvrzení od modelu nese dál. Změřeno 24. 8. 2026 na produkci — dnes, po
-- ručním sundání tagu u id 963, 1214, 1530 a 1531, je pořád 21 AKTIVNÍCH
-- receptů označených `gluten_free` se skutečným zdrojem lepku:
--   ovesné vločky   12  (31, 33, 37, 58, 70, 513, 550, 568, 569, 1012, 1529…)
--   sójová omáčka    8  (118, 169, 199, 643, 948, 949, 1028, 1532)
--   krupice          1  (528)
--   müsli            1  (39)
-- Ty čtyři ručně sundané tagy byly špička, ne celý problém. Celiak by od nás
-- dostal lepek i po nasazení brány, kdyby se data nechala být.
--
-- CO BACKFILL UDĚLÁ (změřeno suchým během 24. 8. 2026, 934 řádků katalogu):
--   přepíše 598 řádků, z toho 460 aktivních
--   gluten_free  aktivních: -46 / +298  →  199 se mění na 451
--   low_carb     aktivních: -21 / +138  →   84 se mění na 201
-- Přibývá řádově víc, než ubývá, protože přepočet tag DOPLŇUJE i tam, kde ho
-- model zapomněl. Katalog tím přestává záviset na tom, co si model vzpomene
-- napsat — to je ten samý důvod, proč se tagy odvozují.
--
-- Z 46 receptů, které o `gluten_free` přijdou: 21 má skutečný zdroj lepku
-- (viz výš) a 27 aspoň jednu surovinu, kterou slovník neumí posoudit; dva
-- recepty mají obojí. Ty s neznámou surovinou se dají získat zpátky doplněním
-- slovníku a jsou proto vidět ve watchdogu — viz 20260824130000.
--
-- ===========================================================================
-- BRÁNA SE NA DOBU BACKFILLU VYPÍNÁ
-- ===========================================================================
-- Stejný postup a stejný důvod jako v 20260805140000. UPDATE nad katalogem
-- není zdarma: brána při něm znovu vyhodnotí VŠECHNA pravidla (makra, Atwater,
-- počet surovin, čas, postup, překlad) a umí recept deaktivovat. Backfill nad
-- 598 řádky by ji spustil na každém z nich a klidně by přitom vypnul recepty,
-- které s dietními tagy nemají nic společného. Tahle migrace mění TAGY, ne
-- aktivitu — a co se má a nemá aktivovat, je věc 20260824100000, která si to
-- schválně změřila a nikoho deaktivovat nechtěla.
--
-- Vypnutí i zapnutí je v jedné transakci migrace: při jakémkoli selhání se
-- odroluje obojí a brána nikdy nezůstane vypnutá. Hlídá to i kontrola níž.
--
-- `set_recipes_catalog_updated_at` se NEVYPÍNÁ. Tag se opravdu mění, takže
-- `updated_at = now()` je pravda, ne lež v datech.

-- Stav PŘED změnou, aby kontroly měly s čím srovnat.
create temp table _pred_backfillem on commit drop as
select id, active, diet_tags from public.recipes_catalog;

alter table public.recipes_catalog disable trigger trg_enforce_recipe_catalog_rules;

update public.recipes_catalog r
set diet_tags = public.prepocti_odvozene_tagy(r.diet_tags, r.ingredients, r.kcal, r.carbs_g)
where public.prepocti_odvozene_tagy(r.diet_tags, r.ingredients, r.kcal, r.carbs_g)
      is distinct from coalesce(r.diet_tags, '{}'::text[]);

alter table public.recipes_catalog enable trigger trg_enforce_recipe_catalog_rules;

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_vypnuty   integer;
  v_pred      integer;
  v_po        integer;
  v_deakt     integer;
  v_neshoda   integer;
  v_gf_pryc   integer;
  v_gf_novy   integer;
  v_lepek     integer;
BEGIN
  -- 1) BRÁNA MUSÍ BÝT ZPÁTKY ZAPNUTÁ. Kdyby zůstala vypnutá, tiše by přestala
  --    hlídat každý další zápis do katalogu — horší než nespravená data.
  SELECT count(*) INTO v_vypnuty FROM pg_trigger
  WHERE tgrelid = 'public.recipes_catalog'::regclass
    AND tgname = 'trg_enforce_recipe_catalog_rules'
    AND tgenabled = 'D';
  IF v_vypnuty > 0 THEN
    RAISE EXCEPTION 'trg_enforce_recipe_catalog_rules zustal VYPNUTY.';
  END IF;

  -- 2) Backfill nesmel sahnout na aktivitu. Meni tagy, nic jineho.
  SELECT count(*) INTO v_pred FROM _pred_backfillem WHERE active;
  SELECT count(*) INTO v_po FROM public.recipes_catalog WHERE active;
  IF v_po <> v_pred THEN
    RAISE EXCEPTION 'Pocet aktivnich receptu se zmenil: % -> %.', v_pred, v_po;
  END IF;

  SELECT count(*) INTO v_deakt
  FROM _pred_backfillem p JOIN public.recipes_catalog r ON r.id = p.id
  WHERE p.active AND NOT r.active;
  IF v_deakt > 0 THEN
    RAISE EXCEPTION 'Backfill deaktivoval % receptu.', v_deakt;
  END IF;

  -- 3) TO PODSTATNE: po backfillu uz zadny radek neodporuje brane. Kdyby
  --    nejaky zbyl, nasledujici zapis by ho tise prepsal na neco jineho.
  SELECT count(*) INTO v_neshoda FROM public.recipes_catalog r
  WHERE public.prepocti_odvozene_tagy(r.diet_tags, r.ingredients, r.kcal, r.carbs_g)
        IS DISTINCT FROM coalesce(r.diet_tags, '{}'::text[]);
  IF v_neshoda > 0 THEN
    RAISE EXCEPTION 'U % radku diet_tags neodpovida prepoctu.', v_neshoda;
  END IF;

  -- 4) A hlavne: zadny aktivni recept s gluten_free uz nema zdroj lepku.
  --    Tohle je duvod cele migrace.
  SELECT count(*) INTO v_lepek FROM public.recipes_catalog r
  WHERE r.active AND 'gluten_free' = ANY(r.diet_tags)
    AND array_length(public.recipe_diet_conflicts(r.ingredients, 'gluten_free'), 1) IS NOT NULL;
  IF v_lepek > 0 THEN
    RAISE EXCEPTION '% aktivnich receptu ma gluten_free a pritom konflikt.', v_lepek;
  END IF;

  SELECT count(*) INTO v_gf_pryc
  FROM _pred_backfillem p JOIN public.recipes_catalog r ON r.id = p.id
  WHERE p.active AND 'gluten_free' = ANY(p.diet_tags) AND NOT ('gluten_free' = ANY(r.diet_tags));
  SELECT count(*) INTO v_gf_novy
  FROM _pred_backfillem p JOIN public.recipes_catalog r ON r.id = p.id
  WHERE p.active AND NOT ('gluten_free' = ANY(p.diet_tags)) AND 'gluten_free' = ANY(r.diet_tags);

  RAISE NOTICE 'Backfill hotov. gluten_free u aktivnich: -% / +%.', v_gf_pryc, v_gf_novy;
END $$;
