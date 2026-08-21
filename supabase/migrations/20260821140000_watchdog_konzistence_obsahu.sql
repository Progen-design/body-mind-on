-- Watchdog hlida i KONZISTENCI OBSAHU, ne jen provoz.
--
-- PROC. `system_health_alerts` ma k 21. 8. 2026 dvacet osm vetvi, ale skoro
-- vsechny sleduji provoz: platby, generovani planu, frontu, registrace. Obsah
-- hlida jedina vetev `nenormalizovana_surovina` — a ta je na urovni `info`,
-- takze tise bublala a nikdo ji necetl.
--
-- Dusledek: anglicke suroviny prezily v katalogu tri mesice a nasel je az
-- uzivatel na screenshotu. Chyba, kterou nikdo nemeri, se opravuje porad
-- dokola, protoze se porad dokola vraci.
--
-- ── PRAVIDLO ZAVAZNOSTI ─────────────────────────────────────────────────────
-- critical = uvidi to platici uzivatel ve svem AKTIVNIM planu
-- warning  = je to v katalogu a jeste se to k uzivateli nedostalo
-- info     = prehled, ne porucha
--
-- ── NAMERENO PRED NASAZENIM (21. 8. 2026) ───────────────────────────────────
--   recept_anglicka_surovina     22 receptu / 29 nazvu (z 53 nalezenych je 25 prejatych slov)
--   recept_bez_postupu           20
--   recept_neprelozeny_nazev      3     (jen spoonacular — viz nize)
--   plan_obsahuje_anglictinu      0     (56 receptu ve 2 aktivnich planech, zadny)
--   cvik_bez_ceskeho_nazvu       26     (z 220 v registru)
--   cvik_v_planu_bez_navodu      10     cviku ve 2 planech
--   cvik_bez_vizualu             14     (z 220; zadny z nich neni v planu)
--
-- ── POZOR NA FALESNE POPLACHY ───────────────────────────────────────────────
-- `recept_neprelozeny_nazev` se OMEZUJE NA source='spoonacular'. Ceske zdroje
-- (llm_generated, coach_seed_v1, meal_cache, simple_start) maji v `name_cs`
-- i `name_en` tentyz cesky text — recept vznikl rovnou cesky, nic se neprekladalo.
-- Bez toho omezeni by vetev hlasila 553 zdravych receptu ze 733 a stala by se
-- presne tim samym sumem, ktery uz jednou zpusobil, ze si hlidky nikdo necte.

-- ── Prejate nazvy, ktere se cesky pisou stejne ──────────────────────────────
-- BEZ TOHOHLE FILTRU JE VETEV K NICEMU. Z 53 unikatnich surovin, kde se
-- `name` rovna `name_en`, jich 25 neni chyba: mozzarella, ricotta, tofu,
-- quinoa, feta, pesto, mango, kiwi, oregano, paprika... se cesky pisou stejne.
-- Shoda `name = name_en` je heuristika pro "neprelozeno" a u prejatych slov
-- dava falesny poplach napored.
--
-- Hlidka, ktera trvale hlasi 25 zdravych zaznamu, se prestane cist — presne
-- to se stalo vetvi `nenormalizovana_surovina`, kvuli ktere anglictina prezila
-- v katalogu tri mesice. Stavet druhou takovou by byla tataz chyba.
--
-- Seznam je zamerne inline a kratky. Az probehne preklad zbylych ~28 nazvu,
-- patri tahle znalost do `ingredient_aliases` jako data; do te doby by
-- samostatna tabulka byla vic udrzby nez uzitku.
CREATE OR REPLACE FUNCTION public.je_prejata_surovina(nazev text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT lower(btrim(nazev)) = ANY (ARRAY[
    'mozzarella','ricotta','mascarpone','feta','tofu','quinoa','pesto','salsa',
    'guacamole','tzatziki','tahini','chorizo','farfalle','fettuccine','mirin',
    'oregano','paprika','sage','mango','kiwi','croissant','chilli','chillies',
    'jalapeño','jalapeno'
  ]);
$fn$;

COMMENT ON FUNCTION public.je_prejata_surovina(text) IS
  'True pro nazvy surovin, ktere se cesky pisou stejne jako anglicky. Pouziva vetev recept_anglicka_surovina, aby nehlasila prejata slova jako neprelozena.';

DO $$
DECLARE
  puvodni text;
  nova    text;
  vyskytu int;
BEGIN
  IF to_regclass('public.system_health_alerts') IS NULL THEN
    RAISE EXCEPTION 'system_health_alerts neexistuje — migrace by tise neudelala nic';
  END IF;

  puvodni := pg_get_viewdef('public.system_health_alerts'::regclass, true);

  -- Idempotence: druhy beh vetve nepridava podruhe.
  IF puvodni LIKE '%recept_anglicka_surovina%' THEN
    RAISE NOTICE 'vetve konzistence obsahu uz jsou zavedene, preskakuji';
    RETURN;
  END IF;

  -- ── 1) nenormalizovana_surovina: info -> warning ──────────────────────────
  -- Neni to poznamka. Surovina bez kanonickeho nazvu znamena, ze ji nakupni
  -- seznam neumi secist ani nahradit — uzivatel dostane dva radky mista jednoho.
  vyskytu := (length(puvodni) - length(replace(puvodni, '''nenormalizovana_surovina''::text', '')))
             / length('''nenormalizovana_surovina''::text');
  IF vyskytu <> 1 THEN
    RAISE EXCEPTION 'cekal jsem 1 vyskyt nenormalizovana_surovina, nasel %, definice view se zmenila', vyskytu;
  END IF;

  nova := replace(
    puvodni,
    E'SELECT ''info''::text,\n            ''nenormalizovana_surovina''::text,',
    E'SELECT ''warning''::text,\n            ''nenormalizovana_surovina''::text,'
  );
  IF nova = puvodni THEN
    RAISE EXCEPTION 'zavaznost nenormalizovana_surovina se nepodarilo zmenit — kotva nesedi';
  END IF;

  -- ── 2) Nove vetve se PRIDAVAJI na konec ───────────────────────────────────
  -- Cela definice se neprepisuje. Rucni prepis uz jednou tise rozbil tri jine
  -- alerty (viz 20260813183836), takze se bere definice, kterou si Postgres
  -- vypise sam, a jen se k ni prilepi.
  nova := rtrim(rtrim(nova), ';') || $vetve$
UNION ALL
-- JIDLO 1/4 — warning: je to v katalogu, k uzivateli se to jeste nedostalo.
-- Prekladova pipeline oznacila recept za hotovy podle nazvu a suroviny nechala
-- anglicky (viz lib/spoonacular/prekladStav.js). Az doběhne oprava, ma byt 0.
 SELECT 'warning'::text,
    'recept_anglicka_surovina'::text,
    'Aktivni recept ma neprelozene suroviny'::text,
    string_agg(DISTINCT r.name_cs, ', ' ORDER BY r.name_cs),
    count(DISTINCT r.id)
   FROM recipes_catalog r
  WHERE r.active = true
    AND jsonb_typeof(r.ingredients) = 'array'
    AND (EXISTS ( SELECT 1
           FROM jsonb_array_elements(r.ingredients) i
          WHERE NULLIF(btrim(i.value ->> 'name_en'), '') IS NOT NULL
            AND lower(btrim(i.value ->> 'name')) = lower(btrim(i.value ->> 'name_en'))
            AND NOT public.je_prejata_surovina(i.value ->> 'name')))
 HAVING count(DISTINCT r.id) > 0
UNION ALL
-- JIDLO 2/4 — warning: katalog. Recept bez postupu se da uvarit podle nazvu,
-- ale uzivatel prijde o navod, za ktery plati.
 SELECT 'warning'::text,
    'recept_bez_postupu'::text,
    'Aktivni recept nema pouzitelny postup'::text,
    string_agg(DISTINCT r.name_cs, ', ' ORDER BY r.name_cs),
    count(DISTINCT r.id)
   FROM recipes_catalog r
  WHERE r.active = true
    AND (r.instructions_cs IS NULL
         OR jsonb_typeof(r.instructions_cs) <> 'array'
         OR jsonb_array_length(r.instructions_cs) = 0
         OR (jsonb_array_length(r.instructions_cs) <= 2
             AND EXISTS ( SELECT 1
                    FROM jsonb_array_elements_text(r.instructions_cs) k
                   WHERE k.value ~* 'priprav suroviny podle seznamu|připrav suroviny podle seznamu|postupuj podle receptu')))
 HAVING count(DISTINCT r.id) > 0
UNION ALL
-- JIDLO 3/4 — critical: neprelozeny nazev se dostane do jidelnicku i do
-- e-mailu, tedy rovnou pred uzivatele. OMEZENO NA spoonacular: ceske zdroje
-- maji v name_cs i name_en tentyz cesky text a bez tohohle filtru by vetev
-- hlasila 553 zdravych receptu.
 SELECT 'critical'::text,
    'recept_neprelozeny_nazev'::text,
    'Aktivni recept z ciziho zdroje ma neprelozeny nazev'::text,
    string_agg(DISTINCT r.name_en, ', ' ORDER BY r.name_en),
    count(DISTINCT r.id)
   FROM recipes_catalog r
  WHERE r.active = true
    AND r.source = 'spoonacular'
    AND (NULLIF(btrim(r.name_cs), '') IS NULL
         OR lower(btrim(r.name_cs)) = lower(btrim(r.name_en)))
 HAVING count(DISTINCT r.id) > 0
UNION ALL
-- JIDLO 4/4 — critical: tohle uz vidi platici clovek ve svem aktivnim planu.
-- Testovaci ucty se ignoruji stejnym filtrem jako registracni vetve.
 SELECT 'critical'::text,
    'plan_obsahuje_anglictinu'::text,
    'Aktivni plan uzivatele obsahuje jidlo s anglickou surovinou'::text,
    string_agg(DISTINCT r.name_cs, ', ' ORDER BY r.name_cs),
    count(DISTINCT p.id)
   FROM ai_generated_plans p
   JOIN auth.users u ON u.id = p.user_id
   CROSS JOIN LATERAL jsonb_array_elements(p.structured_plan_json -> 'days') d(value)
   CROSS JOIN LATERAL jsonb_array_elements(d.value -> 'meals') m(value)
   JOIN recipes_catalog r ON r.id = (m.value ->> 'catalog_id')::bigint
  WHERE p.is_active = true
    AND p.structured_plan_json ? 'days'
    AND NOT public.je_testovaci_email(u.email)
    AND jsonb_typeof(r.ingredients) = 'array'
    AND (EXISTS ( SELECT 1
           FROM jsonb_array_elements(r.ingredients) i
          WHERE NULLIF(btrim(i.value ->> 'name_en'), '') IS NOT NULL
            AND lower(btrim(i.value ->> 'name')) = lower(btrim(i.value ->> 'name_en'))
            AND NOT public.je_prejata_surovina(i.value ->> 'name')))
 HAVING count(DISTINCT p.id) > 0
UNION ALL
-- CVIKY 1/3 — warning: registr, ne plan. Do planu se cvik dostane az kdyz je
-- usable_in_plan, takze anglicky nazev v registru jeste nikdo nevidi.
 SELECT 'warning'::text,
    'cvik_bez_ceskeho_nazvu'::text,
    'Cvik v registru nema cesky nazev'::text,
    string_agg(DISTINCT e.canonical_key, ', ' ORDER BY e.canonical_key),
    count(DISTINCT e.id)
   FROM exercise_asset_registry e
  WHERE NULLIF(btrim(e.display_name_cs), '') IS NULL
     OR (NULLIF(btrim(e.wger_name_en), '') IS NOT NULL
         AND lower(btrim(e.display_name_cs)) = lower(btrim(e.wger_name_en)))
     OR e.display_name_cs ~ '^[A-Za-z0-9 ()/,''-]+$'
 HAVING count(DISTINCT e.id) > 0
UNION ALL
-- CVIKY 2/3 — warning, ne critical: cvik v planu bez navodu uzivatel VIDI,
-- ale nazev i serie/opakovani ma. Chybi mu popis provedeni, coz je horsi
-- zazitek, ne rozbita funkce. Krici to o stupen min nez anglictina v jidle.
 SELECT 'warning'::text,
    'cvik_v_planu_bez_navodu'::text,
    'Cvik v aktivnim planu nema popis provedeni'::text,
    string_agg(DISTINCT NULLIF(btrim(e.value ->> 'canonical_key'), ''), ', '),
    count(DISTINCT NULLIF(btrim(e.value ->> 'canonical_key'), ''))
   FROM ai_generated_plans p
   JOIN auth.users u ON u.id = p.user_id
   CROSS JOIN LATERAL jsonb_array_elements(p.structured_plan_json -> 'days') d(value)
   CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d.value -> 'workout' -> 'exercises', '[]'::jsonb)) e(value)
  WHERE p.is_active = true
    AND p.structured_plan_json ? 'days'
    AND NOT public.je_testovaci_email(u.email)
    AND NULLIF(btrim(e.value ->> 'canonical_key'), '') IS NOT NULL
    AND NULLIF(btrim(e.value ->> 'instructions'), '') IS NULL
 HAVING count(DISTINCT NULLIF(btrim(e.value ->> 'canonical_key'), '')) > 0
UNION ALL
-- CVIKY 3/3 — info, a zustava info zamerne. Zmereno 21. 8. 2026: ze 14 cviku
-- bez vizualu neni ANI JEDEN pouzitelny v planu (0 z 205 usable_in_plan).
-- K uzivateli se nedostanou, takze to neni porucha — jen prehled, kolik
-- zaznamu v registru neni dotazenych.
 SELECT 'info'::text,
    'cvik_bez_vizualu'::text,
    'Cvik v registru nema gif ani obrazek'::text,
    string_agg(DISTINCT e.canonical_key, ', ' ORDER BY e.canonical_key),
    count(DISTINCT e.id)
   FROM exercise_asset_registry e
  WHERE NULLIF(btrim(e.gif_url), '') IS NULL
    AND NULLIF(btrim(e.image_url), '') IS NULL
 HAVING count(DISTINCT e.id) > 0
$vetve$;

  -- security_invoker se obnovuje explicitne — `CREATE OR REPLACE VIEW ... AS`
  -- bez klauzule WITH reloptions nezachova a view by znovu obchazel RLS
  -- zdrojovych tabulek (stalo se 5. 8. 2026).
  EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts '
       || 'WITH (security_invoker = true) AS ' || nova;
END $$;

COMMENT ON VIEW public.system_health_alerts IS
  'Prehled poruch pro denni alert. Od 21. 8. 2026 hlida i konzistenci obsahu (recepty, preklady, cviky); nenormalizovana_surovina prehodnocena z info na warning. Zavaznost: critical = vidi to platici uzivatel v aktivnim planu, warning = je to v katalogu, info = prehled.';
