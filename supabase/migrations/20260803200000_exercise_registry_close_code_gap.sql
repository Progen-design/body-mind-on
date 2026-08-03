-- exercise_asset_registry: doplneni cviku, ktere zily jen v kodu.
--
-- MERENI, ktere k tomu vedlo. Slovnik cviku je rozdeleny na tri mista:
--   lib/exerciseCanonicalMap.js      27 klicu (nazvy, vybaveni, partie)
--   lib/exerciseRegistryMedia.js     33 klicu (natvrdo zapsane GIF URL)
--   exercise_asset_registry (DB)     41 radku
--   ---------------------------------------------------------------
--   vsech ruznych klicu              46, z toho 5 v DB CHYBELO
--
-- Dusledek: v cerstve vygenerovanem planu bylo 15 cviku, ale jen 6 jejich
-- klicu melo radek v registry. Zbylych 9 se obslouzilo z kodovych map —
-- GIF z TRUSTED_EXTENDED_GIF_BY_KEY, nazev z kanonicke mapy. Fungovalo to,
-- ale znamenalo to, ze DB neni zdroj pravdy a dotaz "co uzivateli muzeme
-- nabidnout" na ni neda spravnou odpoved.
--
-- Tahle migrace tech 5 doplnuje. Hodnoty NEJSOU odhadnute ani od modelu —
-- jsou doslovne prevzate z kodovych map, ktere uz produkci obsluhuji:
--   display_name_cs, equipment, body_part, target  z exerciseCanonicalMap.js
--   gif_url                                        z exerciseRegistryMedia.js
--
-- wger_exercise_id zustava NULL: tyhle cviky ve wgeru namapovane nemame
-- a vymyslet ID by bylo horsi nez ho nemit. Media jsou z exercisedb.

INSERT INTO public.exercise_asset_registry
  (canonical_key, display_name_cs, exercisedb_name, gif_url, body_part, target, equipment, source, trust_level)
VALUES
  ('chest_press',    'Chest press',       'chest press',  'https://static.exercisedb.dev/media/EIeI8Vf.gif', 'chest',      'pectorals',  'leverage machine', 'exercisedb', 'exact'),
  ('dead_bug',       'Dead bug',          'dead bug',     'https://static.exercisedb.dev/media/iny3m5y.gif', 'waist',      'abs',        'body weight',      'exercisedb', 'exact'),
  ('farmer_carry',   'Farmer carry',      'farmer walk',  'https://static.exercisedb.dev/media/qPEzJjA.gif', 'full body',  'full body',  'dumbbell',         'exercisedb', 'exact'),
  ('goblet_squat',   'Goblet dřep',       'goblet squat', 'https://static.exercisedb.dev/media/yn8yg1r.gif', 'upper legs', 'glutes',     'dumbbell',         'exercisedb', 'exact'),
  ('hamstring_curl', 'Zakopávání vleže',  'leg curl',     'https://static.exercisedb.dev/media/Zg3XY7P.gif', 'upper legs', 'hamstrings', 'leverage machine', 'exercisedb', 'exact')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Hlidac, aby se rozjezd DB a kodu neopakoval potichu.
--
-- Bez nej se cely problem vrati ve chvili, kdy nekdo prida cvik do kanonicke
-- mapy a zapomene na registry — a poznalo by se to zase az podle toho, ze
-- neco nesedi v planu. Alert pojmenuje konkretni klice.
--
-- Seznam ocekavanych klicu je zamerne v pohledu, ne v aplikaci: pohled se
-- ptat nemusi nikdo, chodi sam dennim cronem system-health-alert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.exercise_registry_expected_keys
WITH (security_invoker = true) AS
SELECT k AS canonical_key
FROM unnest(ARRAY[
  'bench_press','bent_over_row','bicep_curl','box_jump','bulgarian_squat','burpee',
  'cable_row','calf_raise','chest_fly','chest_press','cooldown','crunch','dead_bug',
  'deadlift','dips','dumbbell_press','dumbbell_row','face_pull','farmer_carry',
  'glute_bridge','goblet_squat','hammer_curl','hamstring_curl','hip_thrust',
  'incline_bench_press','jumping_jack','lat_pulldown','lateral_raise','leg_press',
  'leg_raise','lunges','mountain_climber','overhead_press','plank','plank_side',
  'pull_up','pushup','rest','romanian_deadlift','russian_twist','squat','step_up',
  'superman','tricep_dip','tricep_extension','warmup'
]) AS k;

COMMENT ON VIEW public.exercise_registry_expected_keys IS
  'Kanonicke klice cviku, ktere plánovac umi vygenerovat. Kdyz nekterym chybi radek v exercise_asset_registry, cvik se obslouzi z kodovych map a DB prestane byt zdrojem pravdy.';

-- ---------------------------------------------------------------------------
-- Kontrola: po teto migraci nesmi chybet ani jeden ocekavany klic.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_chybi integer;
  v_ktere text;
BEGIN
  SELECT count(*), coalesce(string_agg(e.canonical_key, ', '), '')
    INTO v_chybi, v_ktere
  FROM public.exercise_registry_expected_keys e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.exercise_asset_registry r WHERE r.canonical_key = e.canonical_key
  );

  IF v_chybi <> 0 THEN
    RAISE EXCEPTION 'V registry chybi % cviku: %', v_chybi, v_ktere;
  END IF;
  RAISE NOTICE 'Registry pokryva vsechny ocekavane klice.';
END $$;
