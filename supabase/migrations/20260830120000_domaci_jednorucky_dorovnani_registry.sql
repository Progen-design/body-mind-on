-- exercise_asset_registry: dorovnani jednoruckovych variant pro "doma s vybavenim".
--
-- KONTEXT (Etapa 6.3, DALSI_KROK.md). filterWorkoutPlanForTrainingEnvironment()
-- pro home_equipment dostal 3 nove canonical_key v exerciseCanonicalMap.js —
-- jednoruckove varianty barbelloveho bench_press / bent_over_row /
-- romanian_deadlift. Duvod vlastniho klice: "Naradi" v UI se odvozuje z
-- exercise_asset_registry.equipment podle canonical_key, ne z
-- search_term/name_cs na instanci cviku — sdilet klic s barbellovou verzi by
-- dal hlasilo "velka cinka" i s jednoruckami v ruce.
--
-- overhead_press ZAMERNE VYNECHAN: produkcni registry mu uz dnes hlasi
-- equipment 'dumbbell' (ne 'barbell' jako staticka mapa v kodu) — zadna lez
-- v UI tedy neni a vlastni klic by jen fragmentoval identitu cviku bez
-- efektu na UI, navic bez potvrzeneho media. Viz poznamka u
-- CANONICAL_EXERCISES v exerciseCanonicalMap.js.
--
-- Produkcni registry byla rucne domerena (29.–30. 8. 2026), ne odhadnuta:
--   dumbbell_bench_press        UZ V DB JE (equipment dumbbell, ma vizual)
--   dumbbell_row                UZ V DB JE (equipment dumbbell, vizual chybi)
--   dumbbell_romanian_deadlift  CHYBI
--
-- Tahle migrace tedy prida jen ten jeden chybejici radek a rozsiri
-- exercise_registry_expected_keys (viz 20260803200000) o vsechny tri nove
-- klice — dumbbell_bench_press a dumbbell_row v seznamu chybely, i kdyz radek
-- v DB uz maji, protoze test lib/__tests__/exerciseRegistryCoverage.test.mjs
-- kontroluje JS -> seznam v migraci, ne JS -> live DB.
--
-- gif_url/image_url zustavaji NULL a trust_level 'none': zadny overeny vizual
-- pro tenhle klic nemame (nejde ho z tohohle repa overit) a vymyslet URL by
-- bylo horsi nez ho nemit — stejny princip jako u wger_exercise_id v
-- 20260803200000. Az cvik poprve projde zivym resolveExercise() v produkci,
-- dohleda si vizual sam pres wger.de (stejny bootstrap jako kazdy jiny
-- canonical_key dnes).
--
-- POZOR NA POREADI NASAZENI: tuhle migraci je potreba aplikovat DRIV, nez se
-- smerguje kod, ktery `dumbbell_romanian_deadlift` pouziva
-- (lib/workoutStartProgram.js) — bez radku v registry by novy klic nemel
-- equipment_class a UI by nemelo co zobrazit.
--
-- DOPAD NA WATCHDOG. `dumbbell_row` (uz v DB) i `dumbbell_romanian_deadlift`
-- (tenhle radek) budou po nasazeni kodu z Etapy 6.3 pouzivane v planu
-- (workoutStartProgram.js, HOME_EQUIP_A/B) a soucasne bez media — hlidka
-- `cvik_bez_vizualu` v system_health_alerts (migrace 20260821140000) je
-- uvidi automaticky (dotazuje se primo na exercise_asset_registry, zadnou
-- zmenu nepotrebuje), ale jeji dobovy komentar "zadny z nich neni pouzitelny
-- v planu" (zmereno 21. 8. 2026) tim prestava platit pro tyhle dva klice.
-- Nemenit tu starou migraci (uz je nasazena) — jen si toho vsimnout, az
-- hlidka poprve nahlasi 15/220 misto 14/220 s dumbbell_romanian_deadlift
-- v seznamu.

INSERT INTO public.exercise_asset_registry
  (canonical_key, display_name_cs, exercisedb_name, gif_url, image_url, body_part, target, equipment, source, trust_level)
VALUES
  ('dumbbell_romanian_deadlift', 'Rumunský mrtvý tah s jednoručkami', 'dumbbell romanian deadlift', NULL, NULL, 'upper legs', 'hamstrings', 'dumbbell', 'none', 'none')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Rozsireni hlidace z 20260803200000 o tri nove klice.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.exercise_registry_expected_keys
WITH (security_invoker = true) AS
SELECT k AS canonical_key
FROM unnest(ARRAY[
  'bench_press','bent_over_row','bicep_curl','box_jump','bulgarian_squat','burpee',
  'cable_row','calf_raise','chest_fly','chest_press','cooldown','crunch','dead_bug',
  'deadlift','dips','dumbbell_bench_press','dumbbell_press',
  'dumbbell_romanian_deadlift','dumbbell_row','face_pull','farmer_carry',
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
