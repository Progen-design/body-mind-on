-- Automat na doplňování katalogu cviků podle poptávky.
--
-- STEJNÁ STAVBA JAKO U RECEPTŮ (20260803090000_recipe_generation_queue):
--
--   skladač nenajde náhradu  →  objednávka v exercise_import_queue
--   →  denní cron  →  nový řádek v exercise_asset_registry  →  brána  →  plán
--
-- MĚŘENÍ, KTERÉ K TOMU VEDLO
--
--   Uživatel janprikopa má v týdnu 15 tréninkových slotů, ale jen 8 různých
--   cviků — průměrně 1,88 opakování, nejčastější cvik 3×. Nejde o chybu
--   deduplikace: pickReplacementExercise() vrátí null, protože není z čeho
--   brát. Zásoba je totiž v KÓDU, ne v databázi — buildExercisePoolFromTemplates
--   skládá nabídku ze šablon v lib/workoutTemplates.js, kterých je pro
--   posilovnu 28 řádků a po odečtení duplicit 8 různých cviků.
--
--   V exercise_asset_registry přitom leželo 46 cviků. Plánovač se jich nikdy
--   nezeptal. Proto tahle migrace není jen o frontě: dělá z registry zdroj,
--   ze kterého se dá vybírat, a teprve tím dává importu smysl. Bez toho by
--   se cviky importovaly do tabulky, kterou nikdo nečte.
--
-- ZDROJ CVIKŮ: free-exercise-db (github.com/yuhonas/free-exercise-db),
--   licence Unlicense = volné dílo, 873 cviků, u každého dvě fotky. Naměřeno:
--   531 z nich má použitelné vybavení, kategorii, partii i médium a 335 z nich
--   umí lib/exerciseNameCs.js pojmenovat česky. Proti dnešním 46 je to
--   sedminásobek. wger byl zvážen a zamítnut — z 828 cviků má obrázek jen 264
--   a jsou to statické fotky s nespolehlivým jazykem překladu.

-- ---------------------------------------------------------------------------
-- 1. Registry jako katalog, ne jen sklad obrázků
-- ---------------------------------------------------------------------------
ALTER TABLE public.exercise_asset_registry
  ADD COLUMN IF NOT EXISTS equipment_class  text,
  ADD COLUMN IF NOT EXISTS primary_muscle   text,
  ADD COLUMN IF NOT EXISTS usable_in_plan   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_source  text,
  ADD COLUMN IF NOT EXISTS external_id      text,
  ADD COLUMN IF NOT EXISTS level            text,
  ADD COLUMN IF NOT EXISTS mechanic         text;

COMMENT ON COLUMN public.exercise_asset_registry.equipment_class IS
  'Znormalizovane vybaveni pro vyber do planu: body_weight, dumbbell, barbell, cable, machine, kettlebell, band. Sloupec equipment zustava puvodni popisny text.';
COMMENT ON COLUMN public.exercise_asset_registry.primary_muscle IS
  'Hlavni partie. Slovnik: chest, back, shoulders, biceps, triceps, forearms, abs, glutes, quads, hamstrings, calves, lower_back, traps, adductors, abductors, cardio, full_body.';
COMMENT ON COLUMN public.exercise_asset_registry.usable_in_plan IS
  'Smi ho planovac nabidnout. NENASTAVUJ RUCNE — prepise ho trigger enforce_exercise_registry_rules pri kazdem zapisu.';
COMMENT ON COLUMN public.exercise_asset_registry.external_id IS
  'ID ve zdrojovem datasetu. S external_source tvori unikat, ktery brani dvojimu importu tehoz cviku.';

-- Jeden cvik ze zdroje jen jednou.
CREATE UNIQUE INDEX IF NOT EXISTS exercise_registry_externi_unikat
  ON public.exercise_asset_registry (external_source, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS exercise_registry_klic_unikat
  ON public.exercise_asset_registry (canonical_key);

CREATE INDEX IF NOT EXISTS exercise_registry_nabidka
  ON public.exercise_asset_registry (equipment_class, primary_muscle)
  WHERE usable_in_plan;

-- ---------------------------------------------------------------------------
-- 2. Backfill: přeložit dnešních 46 řádků do nového slovníku
--
-- Hodnoty se odvozují z už uložených sloupců, nic se nedomýšlí. Řádky bez
-- vybavení (rest) nebo bez partie zůstanou s NULL a brána je nepustí — což
-- je správně, „odpočinek“ nemá být nabízen jako náhradní cvik.
-- ---------------------------------------------------------------------------
UPDATE public.exercise_asset_registry SET equipment_class = CASE equipment
  WHEN 'body weight'      THEN 'body_weight'
  WHEN 'dumbbell'         THEN 'dumbbell'
  WHEN 'barbell'          THEN 'barbell'
  WHEN 'cable'            THEN 'cable'
  WHEN 'leverage machine' THEN 'machine'
  WHEN 'smith machine'    THEN 'machine'
  WHEN 'kettlebell'       THEN 'kettlebell'
  -- „weighted“ je zkracovacka se zataizenim: bez cinky ji uzivatel neudela,
  -- proto patri mezi cviky s naradim, ne mezi vlastni vahu.
  WHEN 'weighted'         THEN 'dumbbell'
  ELSE NULL END
WHERE equipment_class IS NULL;

UPDATE public.exercise_asset_registry SET primary_muscle = CASE target
  WHEN 'pectorals'             THEN 'chest'
  WHEN 'upper back'            THEN 'back'
  WHEN 'lats'                  THEN 'back'
  WHEN 'delts'                 THEN 'shoulders'
  WHEN 'biceps'                THEN 'biceps'
  WHEN 'triceps'               THEN 'triceps'
  WHEN 'abs'                   THEN 'abs'
  WHEN 'glutes'                THEN 'glutes'
  WHEN 'quads'                 THEN 'quads'
  WHEN 'hamstrings'            THEN 'hamstrings'
  WHEN 'calves'                THEN 'calves'
  WHEN 'cardiovascular system' THEN 'cardio'
  WHEN 'full body'             THEN 'full_body'
  ELSE NULL END
WHERE primary_muscle IS NULL;

UPDATE public.exercise_asset_registry
SET external_source = 'exercisedb', external_id = canonical_key
WHERE external_id IS NULL AND source = 'exercisedb';

-- ---------------------------------------------------------------------------
-- 3. Brána. Jediný arbitr toho, co smí do plánu.
--
-- Stejný princip jako u receptů: aplikace usable_in_plan nenastavuje, jen
-- zapisuje řádek. Rozhodne trigger. Kdyby to rozhodoval importér, stačí jedna
-- nová cesta zápisu (ruční migrace, admin endpoint) a pravidlo se obejde.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_exercise_registry_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.usable_in_plan := false;

  -- a) musí být vidět. Cvik bez média je v plánu horší než žádný cvik —
  --    uživatel netuší, co má dělat.
  IF coalesce(NEW.gif_url, NEW.image_url, '') = '' THEN
    RETURN NEW;
  END IF;

  -- b) český název. Anglický název se uživateli nikdy neukáže.
  IF NEW.display_name_cs IS NULL OR btrim(NEW.display_name_cs) = '' THEN
    RETURN NEW;
  END IF;

  -- c) vybavení ze známého slovníku. Neznámé vybavení nelze porovnat s tím,
  --    co uživatel doma má, a cvik by se dostal do tréninku bez náčiní.
  IF NEW.equipment_class IS NULL OR NEW.equipment_class NOT IN
     ('body_weight','dumbbell','barbell','cable','machine','kettlebell','band') THEN
    RETURN NEW;
  END IF;

  -- d) partie. Bez ní nejde poptávku ani uspokojit, ani změřit.
  IF NEW.primary_muscle IS NULL OR btrim(NEW.primary_muscle) = '' THEN
    RETURN NEW;
  END IF;

  -- e) kanonický klíč ve tvaru, na který spoléhá plánovač.
  IF NEW.canonical_key !~ '^[a-z0-9_]{3,64}$' THEN
    RETURN NEW;
  END IF;

  NEW.usable_in_plan := true;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_exercise_registry_rules() IS
  'Jediny arbitr usable_in_plan. Prepisuje hodnotu pri kazdem zapisu, takze ji nelze nastavit zvenci.';

DROP TRIGGER IF EXISTS trg_enforce_exercise_registry_rules ON public.exercise_asset_registry;
CREATE TRIGGER trg_enforce_exercise_registry_rules
  BEFORE INSERT OR UPDATE ON public.exercise_asset_registry
  FOR EACH ROW EXECUTE FUNCTION public.enforce_exercise_registry_rules();

-- Trigger přepočítá i dnešní řádky (UPDATE bez změny hodnoty ho spustí).
UPDATE public.exercise_asset_registry SET updated_at = updated_at;

-- ---------------------------------------------------------------------------
-- 4. Fronta objednávek
--
-- Specifikace je dvojice (vybavení, partie) — přesně to, co skladači chybí,
-- když nemá čím nahradit opakující se cvik.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exercise_import_queue (
  id              bigserial PRIMARY KEY,
  equipment_class text NOT NULL CHECK (equipment_class IN
                    ('body_weight','dumbbell','barbell','cable','machine','kettlebell','band')),
  primary_muscle  text NOT NULL,
  pozadovano      integer NOT NULL CHECK (pozadovano > 0),
  vyrobeno        integer NOT NULL DEFAULT 0,
  priorita        integer NOT NULL DEFAULT 100,
  zdroj           text NOT NULL CHECK (zdroj IN ('seed','demand')),
  stav            text NOT NULL DEFAULT 'pending'
                    CHECK (stav IN ('pending','running','done','failed','cancelled')),
  posledni_chyba  text,
  pokusu          integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Jedna OTEVŘENÁ položka na stejnou specifikaci.
--
-- Bez toho by každý uživatel, kterému při skládání dojde nabídka jednoruček
-- na záda, založil vlastní objednávku — a zítra znovu. Kontrola v kódu
-- nestačí, běhů je víc a jsou souběžné.
CREATE UNIQUE INDEX IF NOT EXISTS exercise_import_queue_unikat
  ON public.exercise_import_queue (equipment_class, primary_muscle)
  WHERE stav IN ('pending','running');

CREATE INDEX IF NOT EXISTS exercise_import_queue_fronta
  ON public.exercise_import_queue (priorita, created_at)
  WHERE stav = 'pending';

COMMENT ON TABLE public.exercise_import_queue IS
  'Objednavky na doplneni cviku. zdroj=demand vznika tam, kde skladac nenasel nahradu. Unikatni index brani duplicitnim otevrenym objednavkam.';

ALTER TABLE public.exercise_import_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exercise_import_queue FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.exercise_import_queue_id_seq FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Co katalog dnes umí nabídnout
--
-- Pohled existuje kvůli měření: bez něj se „chybí cviky“ pozná až podle toho,
-- že si uživatel stěžuje na stejný trénink čtyřikrát v týdnu.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.exercise_catalog_coverage
WITH (security_invoker = true) AS
SELECT equipment_class, primary_muscle, count(*) AS cviku
FROM public.exercise_asset_registry
WHERE usable_in_plan
GROUP BY equipment_class, primary_muscle;

COMMENT ON VIEW public.exercise_catalog_coverage IS
  'Kolik pouzitelnych cviku ma katalog pro kazdou dvojici vybaveni a partie.';

-- ---------------------------------------------------------------------------
-- 6. Kontrola: brána nesmí zahodit cviky, které plánovač dnes používá
--
-- Migrace 20260803200000 dosypala registry do 46 řádků. Kdyby po zapnutí brány
-- zbylo použitelných míň než těch 33, co mají médium, něco je špatně v mapování
-- a je lepší to zjistit teď než z prázdného tréninku.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pouzitelnych integer;
  v_s_mediem     integer;
BEGIN
  SELECT count(*) INTO v_pouzitelnych
  FROM public.exercise_asset_registry WHERE usable_in_plan;

  SELECT count(*) INTO v_s_mediem
  FROM public.exercise_asset_registry
  WHERE coalesce(gif_url, image_url, '') <> '';

  RAISE NOTICE 'Registry: % pouzitelnych z % s mediem.', v_pouzitelnych, v_s_mediem;

  IF v_pouzitelnych < 25 THEN
    RAISE EXCEPTION 'Po zapnuti brany zbylo jen % pouzitelnych cviku — mapovani vybaveni nebo partii je spatne.', v_pouzitelnych;
  END IF;
END $$;
