-- Registr cviků lže o nářadí — docs/DALSI_KROK.md 8.18.
--
-- Změřeno v produkci 6. 9. 2026 nad `exercise_asset_registry`: 225 řádků,
-- 209 s `usable_in_plan = true`. `lib/exerciseCatalogPool.js` má v hlavičce
-- vlastní varování: „VYBAVENÍ SI HLÍDÁME SAMI... `adaptExerciseForTrainingEnvironment()`
-- pracuje s natvrdo vypsanými seznamy kanonických klíčů a NEZNÁMÝ KLÍČ
-- PROPUSTÍ BEZE ZMĚNY." Filtr `.in('equipment_class', tridy)` v
-- `nactiKatalogovouZasobu()` je tedy JEDINÁ pojistka — špatný
-- `equipment_class` v registru pustí cvik až do tréninku uživatele.
--
-- ŠABLONY (lib/workoutStartProgram.js) SE NEMĚNÍ. Po 8.16 jsou v pořádku —
-- tohle je čistě oprava dat v `exercise_asset_registry`.
--
-- ČÁST A) — ROZHODNUTO: `equipment_class = NULL` pro všech osm, stejně jako
-- u warmup/rest/cooldown v části C). Nová hodnota equipment_class (varianta
-- „přidat pullup_bar/bench") se ZATÍM NEDĚLÁ — je zapsaná jako návrh
-- v docs/DALSI_KROK.md, sekce „Vědomě odloženo", ne provedená tady.
-- `equipment_class` má dnes jen sedm povolených hodnot (`body_weight,
-- dumbbell, barbell, cable, machine, kettlebell, band` — TRIDY_VYBAVENI
-- v lib/exerciseImportQueue.js, TRIDY_V_POSILOVNE v lib/exerciseCatalogPool.js)
-- a ŽÁDNÁ z nich neznamená hrazdu ani lavici — `body_weight` u těchhle osmi
-- lže, `NULL` říká pravdu (třída pro hrazdu/lavici prostě neexistuje).
--
-- DŮLEŽITÝ DOPLNĚK K ZADÁNÍ: `equipment_class` NEMÁ na úrovni tabulky
-- žádný CHECK constraint (na rozdíl od `exercise_import_queue.equipment_class`,
-- který CHECK má) — sedm hodnot je vynucených jen TRIGGEREM
-- `enforce_exercise_registry_rules()` (migrace 20260803210000), který
-- `usable_in_plan` PŘEPOČÍTÁVÁ PŘI KAŽDÉM ZÁPISU a řádek s neznámým
-- `equipment_class` natvrdo shodí na `usable_in_plan = false` — VČETNĚ
-- V POSILOVNĚ. Nová hodnota `equipment_class` by tedy nevyžadovala úpravu
-- tří seznamů v JS, ale ČTYŘ míst: `TRIDY_VYBAVENI`, `NACINI_NA_TRIDU`,
-- `TRIDY_V_POSILOVNE` A TOHOHLE TRIGGERU (samostatná migrace). Bez
-- posledního by nová třída zmizela úplně všem, ne jen doma bez vybavení.
-- Přesně tenhle mechanismus (trigger PŘEPOČÍTÁVÁ, ne jen čte) je taky
-- důvod, proč bod C) níž nejde vyřešit prostým `UPDATE ... SET
-- usable_in_plan = false` — trigger by ho při zápisu vrátil zpátky na
-- `true`, dokud řádek prochází ostatními podmínkami gate. Řeší se to tak,
-- že se `warmup`/`rest`/`cooldown` připraví o platný `equipment_class`
-- (žádná z těch sedmi hodnot na ně beztak nesedí — nejsou to cviky
-- s náčiním), takže gate (c) v triggeru je sám shodí.

-- ---------------------------------------------------------------------------
-- B) plank je omylem "weighted"/"dumbbell". Je to cvik na vlastní váhu.
-- ---------------------------------------------------------------------------
UPDATE public.exercise_asset_registry
SET equipment = 'body weight',
    equipment_class = 'body_weight',
    updated_at = now()
WHERE canonical_key = 'plank';

-- ---------------------------------------------------------------------------
-- C) warmup/rest/cooldown nejsou cviky, ale usable_in_plan = true je pustí
-- do plánu jako plnohodnotné cviky (a `rest` navíc tvrdí "glutes", `cooldown`
-- "triceps").
--
-- `usable_in_plan` se NEDÁ nastavit přímo — `enforce_exercise_registry_rules()`
-- ho při každém zápisu přepočítá znovu z (a) média (b) českého jména
-- (c) equipment_class ze sedmi povolených hodnot (d) primary_muscle
-- (e) tvaru canonical_key. Všech pět dnes u těchhle tří řádků platí, takže
-- prostý zápis `usable_in_plan = false` by trigger na dalším uložení
-- přepsal zpátky na `true`.
--
-- equipment_class se proto nastavuje na NULL — žádná ze sedmi povolených
-- hodnot beztak "rozcvičce"/"odpočinku"/"strečinku" nesedí, není to lež,
-- je to popis skutečnosti — a gate (c) v triggeru tím spolehlivě a trvale
-- shodí usable_in_plan na false, i kdyby řádek někdo v budoucnu znovu
-- uložil. `usable_in_plan = false` je v UPDATu níž navíc explicitně jen
-- pro čitelnost záměru; skutečnou práci dělá NULL v equipment_class.
--
-- Řádky ZŮSTÁVAJÍ v tabulce (kvůli médiím a display_name_cs, jak žádá
-- zadání) — mění se jen equipment_class a usable_in_plan.
-- ---------------------------------------------------------------------------
UPDATE public.exercise_asset_registry
SET equipment_class = NULL,
    usable_in_plan = false,
    updated_at = now()
WHERE canonical_key IN ('warmup', 'rest', 'cooldown');

-- ---------------------------------------------------------------------------
-- D) superman má primary_muscle/target/body_part od hrudního cviku
-- ("chest"/"pectorals"/"chest"), přitom je to zádový cvik (vzpřimovač
-- páteře, ne prsní sval) — je v HOME_BW_A i HOME_BW_B, takže profil hlásí
-- špatně procvičený sval u dvou ze čtyř domácích variant.
--
-- `lower_back` je v povoleném slovníku primary_muscle (viz komentář u
-- sloupce, migrace 20260803210000: "chest, back, shoulders, biceps,
-- triceps, forearms, abs, glutes, quads, hamstrings, calves, lower_back,
-- traps, adductors, abductors, cardio, full_body"). `target`/`body_part`
-- jsou syrové řetězce z ExerciseDB (ne náš slovník) — `lower back` je
-- přesně ten raw název, který `lib/exerciseImportRun.js` (SVAL_NA_PARTII)
-- mapuje na `lower_back`, a `back` je ExerciseDB kategorie, do které
-- spadají všechny zádové vzory v týhle databázi (bent_over_row,
-- lat_pulldown apod. mají cviky se stejnou kategorií).
-- ---------------------------------------------------------------------------
UPDATE public.exercise_asset_registry
SET primary_muscle = 'lower_back',
    target = 'lower back',
    body_part = 'back',
    updated_at = now()
WHERE canonical_key = 'superman';

-- ---------------------------------------------------------------------------
-- A) OSM CVIKŮ S equipment_class='body_weight', KTERÉ VE SKUTEČNOSTI
-- POTŘEBUJÍ HRAZDU NEBO LAVICI:
--
--   pull_up, chin_up                                          -> hrazda
--   bench_dips, bench_jump, incline_push_up*  (čtyři klíče)    -> lavice
--
-- ROZHODNUTO: usable_in_plan = false pro všech osm, stejným trikem jako
-- u warmup/rest/cooldown výš (equipment_class = NULL — žádná ze sedmi
-- povolených hodnot na hrazdu/lavici nesedí, `body_weight` u nich lže).
-- Ověřeno, že vypnutí nic nerozbije:
--   - `planOrchestratorResolve` a `exerciseProviderRegistry` hledají média
--     podle `canonical_key`, na `usable_in_plan` nefiltrují.
--   - `pull_up` je jediný z osmi v šabloně (`lib/workoutStartProgram.js`
--     GYM_D) a tam ho `adaptExerciseForTrainingEnvironment()` už dnes
--     nahrazuje mimo posilovnu (`resolveVerticalPull`, workoutStartProgram.js).
--   - `bench_dips`, `bench_jump` a `incline_push_up*` nejsou v žádné
--     šabloně — žijí jen v zásobě (`exerciseCatalogPool`), ne v A-D.
-- Bonus: štítek „Nářadí" u shybů přestane tvrdit „vlastní váha".
--
-- Varianta „přidat equipment_class 'pullup_bar'/'bench'" se ZATÍM NEDĚLÁ —
-- zapsaná jako návrh v docs/DALSI_KROK.md, sekce „Vědomě odloženo".
-- ---------------------------------------------------------------------------
UPDATE public.exercise_asset_registry
SET equipment_class = NULL,
    usable_in_plan = false,
    updated_at = now()
WHERE canonical_key IN ('pull_up', 'chin_up', 'bench_dips', 'bench_jump',
  'incline_push_up', 'incline_push_up_medium', 'incline_push_up_close_grip',
  'incline_push_up_reverse_grip');

-- ---------------------------------------------------------------------------
-- Kontroly.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_plank_trida    text;
  v_plank_usable   boolean;
  v_warmup_usable  integer;
  v_naradi_usable  integer;
  v_naradi_v_bw    integer;
  v_superman_sval  text;
  v_superman_target text;
  v_superman_part  text;
BEGIN
  -- A) ani jeden z osmi cviků s hrazdou/lavicí nesmí zůstat usable_in_plan.
  SELECT count(*) INTO v_naradi_usable
  FROM public.exercise_asset_registry
  WHERE canonical_key IN ('pull_up', 'chin_up', 'bench_dips', 'bench_jump',
    'incline_push_up', 'incline_push_up_medium', 'incline_push_up_close_grip',
    'incline_push_up_reverse_grip')
    AND usable_in_plan;
  IF v_naradi_usable > 0 THEN
    RAISE EXCEPTION '% cviků s hrazdou/lavicí zůstalo usable_in_plan = true', v_naradi_usable;
  END IF;

  -- Obecná pojistka: žádný usable_in_plan + equipment_class='body_weight'
  -- řádek nesmí v klíči ani českém názvu naznačovat hrazdu nebo lavici —
  -- chytí i budoucí podobnou chybu, ne jen těchhle osm dnešních klíčů.
  SELECT count(*) INTO v_naradi_v_bw
  FROM public.exercise_asset_registry
  WHERE usable_in_plan
    AND equipment_class = 'body_weight'
    AND (
      canonical_key ~* 'pull_up|chin_up|bench|incline_push_up'
      OR display_name_cs ~* 'hrazd|lavic|bradl'
    );
  IF v_naradi_v_bw > 0 THEN
    RAISE EXCEPTION '% řádků s equipment_class=body_weight naznačuje hrazdu nebo lavici', v_naradi_v_bw;
  END IF;

  -- plank je body_weight a prošel gatem (usable_in_plan), ne jen zapsaný.
  SELECT equipment_class, usable_in_plan INTO v_plank_trida, v_plank_usable
  FROM public.exercise_asset_registry WHERE canonical_key = 'plank';
  IF v_plank_trida IS DISTINCT FROM 'body_weight' THEN
    RAISE EXCEPTION 'plank.equipment_class je %, cekano body_weight', v_plank_trida;
  END IF;
  IF v_plank_usable IS NOT TRUE THEN
    RAISE EXCEPTION 'plank.usable_in_plan je %, cekano true (gate ho po opravě equipment_class musí pustit)', v_plank_usable;
  END IF;

  -- warmup/rest/cooldown nejsou usable_in_plan, tedy i po přepočtu triggerem.
  SELECT count(*) INTO v_warmup_usable
  FROM public.exercise_asset_registry
  WHERE canonical_key IN ('warmup', 'rest', 'cooldown') AND usable_in_plan;
  IF v_warmup_usable > 0 THEN
    RAISE EXCEPTION '% z warmup/rest/cooldown zůstalo usable_in_plan = true', v_warmup_usable;
  END IF;

  -- superman nese zádové hodnoty, ne hrudní.
  SELECT primary_muscle, target, body_part INTO v_superman_sval, v_superman_target, v_superman_part
  FROM public.exercise_asset_registry WHERE canonical_key = 'superman';
  IF v_superman_sval IS DISTINCT FROM 'lower_back' THEN
    RAISE EXCEPTION 'superman.primary_muscle je %, cekano lower_back', v_superman_sval;
  END IF;
  IF v_superman_target IS DISTINCT FROM 'lower back' THEN
    RAISE EXCEPTION 'superman.target je %, cekano ''lower back''', v_superman_target;
  END IF;
  IF v_superman_part IS DISTINCT FROM 'back' THEN
    RAISE EXCEPTION 'superman.body_part je %, cekano back', v_superman_part;
  END IF;

  RAISE NOTICE 'registr OK (A/B/C/D): naradi usable=% (obecna pojistka %), plank=% (usable=%), warmup+rest+cooldown usable=%, superman=%/%/%',
    v_naradi_usable, v_naradi_v_bw, v_plank_trida, v_plank_usable, v_warmup_usable,
    v_superman_sval, v_superman_target, v_superman_part;
END $$;
