-- Lehčí varianta u každého cviku, kde nějaká existuje.
--
-- STAV PŘED: ze 218 použitelných cviků mělo lehčí variantu 17 a těžší 45;
-- 159 cviků nemělo ani jednu. V tréninku se tak skoro vždycky nabízela jen
-- těžší cesta — kdo si chtěl ubrat, neměl kam.
--
-- Ruční párování dál nedává smysl: dvojic je řádově dvě stě a při každém
-- rozšíření katalogu by se muselo dělat znovu. Párování proto počítá tahle
-- migrace — ale jen tam, kde je výsledek obhajitelný.

-- ---------------------------------------------------------------------------
-- 1) Devět cviků chybělo v katalogu jen kvůli prázdnému `equipment_class`
-- ---------------------------------------------------------------------------
-- Trigger `enforce_exercise_registry_rules()` vyžaduje náčiní ze slovníku,
-- jinak by se cvik dostal do tréninku bez ověření, že na něj uživatel má
-- vybavení. U těchhle devíti sloupec nikdo nevyplnil, i když zdrojová data
-- náčiní znají (`equipment` = „body only" / „body weight", resp. název
-- „dumbbell lateral raise"). Mezi nimi jsou přitom právě ty lehčí varianty,
-- které v nabídce chyběly nejvíc: kliky na šikmé lavici a shyby podhmatem.
UPDATE public.exercise_asset_registry
SET equipment_class = 'body_weight'
WHERE equipment_class IS NULL
  AND canonical_key IN (
    'bench_dips', 'bench_jump', 'chin_up', 'pull_up',
    'incline_push_up', 'incline_push_up_close_grip',
    'incline_push_up_medium', 'incline_push_up_reverse_grip'
  );

UPDATE public.exercise_asset_registry
SET equipment_class = 'dumbbell'
WHERE equipment_class IS NULL AND canonical_key = 'lateral_raise';

-- `warmup`, `cooldown` a `rest` náčiní nedostanou schválně — nejsou to
-- cviky a do tréninkového katalogu nepatří.

-- ---------------------------------------------------------------------------
-- 2) Přepočet variant
-- ---------------------------------------------------------------------------
-- JAK SE POROVNÁVÁ NÁROČNOST
--   skóre = úroveň * 100 + náčiní
--   úroveň:  beginner 0, intermediate 1, expert 2
--   náčiní:  vlastní váha 1, guma 2, stroj 3, kladka 4,
--            kettlebell 5, jednoručky 6, velká činka 7
-- Vedená dráha (stroj, kladka) je snazší než volná zátěž, protože stabilitu
-- nedrží cvičenec. Lehčí varianta = nejbližší NIŽŠÍ skóre, těžší = nejbližší
-- VYŠŠÍ. Při shodě skóre se dvojice nevytvoří — nabídnout „lehčí" cvik
-- stejné náročnosti je lež.
--
-- PROČ RODINY POHYBU. Párovat jen podle partie nestačí: podle svalu vyšla
-- těžší varianta prkna „Zvedání pánve ve Smithově stroji" a těžší varianta
-- rumunského mrtvého tahu „Box jump". Varianta proto zůstává ve stejné
-- rodině pohybu (tlak vodorovný, tah zad, dřep, hinge…), která se odvozuje
-- z anglického názvu. Rodina `nezarazeno` se nepáruje vůbec.
--
-- RESET PŘED PŘEPOČTEM. Ruční dvojice z migrace 20260908234500 se tímhle
-- přepisují. Vznikly ve chvíli, kdy směly mířit jen na 23 animovaných cviků,
-- a jedna z nich (tlaky nad hlavu → rozpažky) navíc křížila rodiny. Dva
-- zdroje pravdy vedle sebe by se při dalším rozšíření katalogu rozešly.
UPDATE public.exercise_asset_registry
SET easier_key = NULL, harder_key = NULL;

WITH z AS (
  SELECT canonical_key, primary_muscle, level, equipment_class,
         lower(coalesce(exercisedb_name, wger_name_en, replace(canonical_key, '_', ' '))) AS en
  FROM public.exercise_asset_registry
  WHERE usable_in_plan
), f AS (
  SELECT z.canonical_key,
    (CASE level WHEN 'beginner' THEN 0 WHEN 'intermediate' THEN 1 WHEN 'expert' THEN 2 ELSE 1 END) * 100
  + (CASE equipment_class
       WHEN 'body_weight' THEN 1 WHEN 'band' THEN 2 WHEN 'machine' THEN 3
       WHEN 'cable' THEN 4 WHEN 'kettlebell' THEN 5 WHEN 'dumbbell' THEN 6
       WHEN 'barbell' THEN 7 ELSE 4 END) AS skore,
    CASE
      WHEN en ~ 'calf|heel raise' THEN 'lytka'
      WHEN en ~ 'shrug' THEN 'shrug'
      WHEN en ~ 'clean|snatch|jerk' THEN 'olympijsky'
      WHEN en ~ 'external rotation|internal rotation' THEN 'rotace_ramene'
      -- Tlak na lavici zůstává tlakem na lavici i u cviku, který má
      -- v registru partii `shoulders` — jinak by se jednoručkový bench
      -- pároval s tlaky nad hlavu.
      WHEN en ~ 'bench press|chest press|floor press|push-?up|dip|close-?grip' THEN 'tlak_vodorovny'
      -- Partie z registru má přednost před anglickým názvem ze zdroje.
      -- `dumbbell_press` se ve zdroji jmenuje „dumbbell shoulder press", ale
      -- jeho animace i postup popisují tlak na lavici, a proto má v registru
      -- ručně opravenou partii `chest`. Bez tohohle pořadí by se pároval
      -- s tlaky nad hlavu.
      WHEN primary_muscle = 'chest' AND en ~ 'press' THEN 'tlak_vodorovny'
      WHEN en ~ 'lateral raise|front raise|rear delt|reverse fl|upright row|face pull'
           OR (primary_muscle = 'shoulders' AND en ~ 'raise') THEN 'rameno_upazovani'
      WHEN en ~ 'overhead press|shoulder press|military press|arnold|push press'
           OR (primary_muscle = 'shoulders' AND en ~ 'press') THEN 'tlak_nad_hlavu'
      WHEN en ~ 'fly|flye|cross ?over|pec deck' THEN 'rozpazovani'
      WHEN en ~ 'pulldown|pull-?down|pull-?up|chin-?up|lat |row|bench pull' THEN 'tah_zada'
      WHEN en ~ 'pushdown|kickback|skull|tricep' THEN 'triceps_extenze'
      WHEN primary_muscle = 'biceps' THEN 'biceps_zdvih'
      WHEN en ~ 'leg extension' THEN 'predkopavani'
      WHEN en ~ 'leg curl|lying curl|hamstring curl|seated curl' THEN 'zakopavani'
      WHEN en ~ 'hip thrust|glute bridge|hip extension|glute kickback|frog|hip raise' THEN 'hip_most'
      WHEN en ~ 'deadlift|good morning|hyperextension|back extension|superman' THEN 'hinge'
      WHEN en ~ 'lunge|split squat|step-? ?up' THEN 'vypad'
      WHEN en ~ 'leg press|hack|sissy' THEN 'leg_press'
      WHEN en ~ 'squat' THEN 'drep'
      WHEN en ~ 'jump|butt kick' THEN 'skok'
      WHEN en ~ 'plank|dead bug|bird dog|hold' THEN 'vydrz'
      WHEN en ~ 'crunch|sit-?up|situp|v-?up|leg raise|knee raise|twist|bicycle|jackknife|toe touch|windshield|rollout|side bend|windmill' THEN 'brisak'
      WHEN primary_muscle = 'cardio' THEN 'kardio'
      ELSE 'nezarazeno'
    END AS rodina
  FROM z
), dvojice AS (
  SELECT s.canonical_key, l.canonical_key AS lehci, h.canonical_key AS tezsi
  FROM f s
  LEFT JOIN LATERAL (
    SELECT b.canonical_key FROM f b
    WHERE b.rodina = s.rodina AND b.rodina <> 'nezarazeno' AND b.skore < s.skore
    ORDER BY b.skore DESC, b.canonical_key LIMIT 1
  ) l ON true
  LEFT JOIN LATERAL (
    SELECT b.canonical_key FROM f b
    WHERE b.rodina = s.rodina AND b.rodina <> 'nezarazeno' AND b.skore > s.skore
    ORDER BY b.skore ASC, b.canonical_key LIMIT 1
  ) h ON true
)
UPDATE public.exercise_asset_registry r
SET easier_key = d.lehci,
    harder_key = d.tezsi
FROM dvojice d
WHERE d.canonical_key = r.canonical_key;

-- ---------------------------------------------------------------------------
-- 3) Ruční dvojice tam, kde skóre vyjde stejné
-- ---------------------------------------------------------------------------
-- Klasické progrese vlastní vahou mají stejnou úroveň i stejné náčiní, takže
-- je skóre nerozliší a automat je nechá bez dvojice. Právě tyhle přitom
-- chyběly nejvíc: ke klikům se nenabízely kliky na šikmé lavici a ke shybům
-- shyby podhmatem, ačkoli obojí v katalogu je.
UPDATE public.exercise_asset_registry SET easier_key = 'incline_push_up' WHERE canonical_key = 'pushup';
UPDATE public.exercise_asset_registry SET harder_key = 'pushup' WHERE canonical_key = 'incline_push_up';
UPDATE public.exercise_asset_registry SET easier_key = 'chin_up' WHERE canonical_key = 'pull_up';
UPDATE public.exercise_asset_registry SET harder_key = 'pull_up' WHERE canonical_key = 'chin_up';

-- ---------------------------------------------------------------------------
-- 4) Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pouzitelnych integer;
  v_lehci integer;
  v_tezsi integer;
  v_sam_sobe integer;
  v_mimo_katalog integer;
BEGIN
  SELECT count(*) INTO v_sam_sobe FROM public.exercise_asset_registry
  WHERE canonical_key = easier_key OR canonical_key = harder_key;
  IF v_sam_sobe > 0 THEN
    RAISE EXCEPTION '% cviků ukazuje samo na sebe.', v_sam_sobe;
  END IF;

  -- Varianta musí být cvik, který se do plánu vůbec může dostat. Tahle
  -- kontrola odhalila původní stav: šest cviků mířilo na `pull_up` a jeden
  -- na `lateral_raise`, které z katalogu vypadly kvůli prázdnému náčiní.
  SELECT count(*) INTO v_mimo_katalog
  FROM public.exercise_asset_registry r
  LEFT JOIN public.exercise_asset_registry e
    ON e.canonical_key = r.easier_key AND e.usable_in_plan
  LEFT JOIN public.exercise_asset_registry h
    ON h.canonical_key = r.harder_key AND h.usable_in_plan
  WHERE (r.easier_key IS NOT NULL AND e.canonical_key IS NULL)
     OR (r.harder_key IS NOT NULL AND h.canonical_key IS NULL);
  IF v_mimo_katalog > 0 THEN
    RAISE EXCEPTION '% variant míří na cvik, který se do plánu nedostane.', v_mimo_katalog;
  END IF;

  SELECT count(*), count(easier_key), count(harder_key)
    INTO v_pouzitelnych, v_lehci, v_tezsi
  FROM public.exercise_asset_registry WHERE usable_in_plan;

  IF v_pouzitelnych < 220 THEN
    RAISE EXCEPTION 'Katalog má jen % cviků, čekáno aspoň 220.', v_pouzitelnych;
  END IF;
  IF v_lehci < 150 THEN
    RAISE EXCEPTION 'Lehčí variantu má jen % cviků, čekáno aspoň 150.', v_lehci;
  END IF;

  RAISE NOTICE 'Použitelných %, lehčí varianta u %, těžší u %.',
    v_pouzitelnych, v_lehci, v_tezsi;
END $$;
