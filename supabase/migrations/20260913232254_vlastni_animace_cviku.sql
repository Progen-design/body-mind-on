-- FÁZE 3 (docs/DALSI_KROK.md 9.12) — registr cviků přechází z hotlinkovaných
-- GIFů (static.exercisedb.dev, exercisedb.dev, wger.de) na vlastní dvousnímkové
-- WebP animace z free-exercise-db (Unlicense), hostované v Supabase Storage
-- (bucket exercise-media, migrace 20260913212012_exercise_media_bucket.sql).
--
-- APLIKOVÁNO 13. 9. 2026 (razítko souboru sedí na skutečné razítko v produkci,
-- docs/DALSI_KROK.md, commit #222). Ověřeno po nasazení: 230 řádků, 207 se
-- Storage animací, 0 odkazů na exercisedb.dev/wger.de ve všech třech sloupcích,
-- image_url i wger_exercise_image_url prázdné všude, usable_in_plan 227.
--
-- Rozsah (docs/DALSI_KROK.md 9.12, schváleno 9.–13. 9. 2026):
--   A) 193 jistých shod — scripts/data/mapovani_animace_skupina_a.json
--   B) 14 z 20 ručně vybraných ve skupině B — scripts/data/mapovani_animace_skupina_b.json.
--      Zbylých 6 (machine_bicep_curl, tricep_extension, plank_side, overhead_press,
--      dumbbell_romanian_deadlift, glute_bridge) zůstává bez animace — kandidáti
--      v datasetu neodpovídali českému postupu (vadný snímek / jiný pohyb / jiné vybavení).
--   Dohromady 207 z 230 cviků dostává gif_url na Storage.
--
-- U VŠECH 230 cviků bez výjimky (i těch bez náhrady ve skupinách C/D) se mažou
-- odkazy na exercisedb.dev (včetně subdomény static.) a wger.de ze všech tří
-- sloupců (gif_url, image_url, wger_exercise_image_url) — to je hlavní důvod
-- celé migrace, není volitelné. image_url a wger_exercise_image_url zůstávají
-- prázdné, nic je nenahrazuje.
--
-- usable_in_plan se nenastavuje ručně — přepočítá ho trigger
-- enforce_exercise_registry_rules() při každém UPDATE.

ALTER TABLE public.exercise_asset_registry
  ADD COLUMN IF NOT EXISTS media_source text,
  ADD COLUMN IF NOT EXISTS media_license text,
  ADD COLUMN IF NOT EXISTS media_updated_at timestamp without time zone;

COMMENT ON COLUMN public.exercise_asset_registry.media_source IS
  'Původ obsahu gif_url (ne hosting) — např. free_exercise_db. NULL u cviků bez vlastní animace.';
COMMENT ON COLUMN public.exercise_asset_registry.media_license IS
  'Licence zdrojových fotek animace v gif_url — např. Unlicense pro free-exercise-db.';
COMMENT ON COLUMN public.exercise_asset_registry.media_updated_at IS
  'Kdy tato pipeline (docs/DALSI_KROK.md 9.12, FÁZE 1–3) naposledy změnila gif_url. NULL = nikdy.';

-- ---------------------------------------------------------------------------
-- Migrace + kontrola počtů před/po v jednom bloku
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_storage_base text := 'https://ipfyavvmmxmsjupmfnes.supabase.co/storage/v1/object/public/exercise-media/cviky/';
  v_animovane_klice text[] := ARRAY[
    'ab_crunch_machine', 'alternate_hammer_curl', 'alternate_incline_dumbbell_curl', 'alternating_cable_shoulder_press', 'alternating_floor_press', 'alternating_hang_clean',
    'alternating_kettlebell_press', 'alternating_kettlebell_row', 'back_flyes_with_bands', 'band_good_morning', 'band_skull_crusher', 'barbell_ab_rollout',
    'barbell_ab_rollout_on_knees', 'barbell_bench_press_medium_grip', 'barbell_curl', 'barbell_full_squat', 'barbell_glute_bridge', 'barbell_hack_squat',
    'barbell_hip_thrust', 'barbell_incline_bench_press_medium_grip', 'barbell_incline_shoulder_raise', 'barbell_lunge', 'barbell_rear_delt_row', 'barbell_seated_calf_raise',
    'barbell_shoulder_press', 'barbell_side_bend', 'barbell_squat', 'barbell_walking_lunge', 'bench_dips', 'bench_jump',
    'bench_press', 'bench_press_with_bands', 'bent_knee_hip_raise', 'bent_over_barbell_row', 'bent_over_dumbbell_rear_delt_raise_with_head_on_bench', 'bent_over_one_arm_long_bar_row',
    'bent_over_row', 'bicep_curl', 'bodyweight_squat', 'cable_chest_press', 'cable_crossover', 'cable_crunch',
    'cable_hammer_curls_rope_attachment', 'cable_hip_adduction', 'cable_incline_pushdown', 'cable_incline_triceps_extension', 'cable_internal_rotation', 'cable_lying_triceps_extension',
    'cable_one_arm_tricep_extension', 'cable_preacher_curl', 'cable_reverse_crunch', 'cable_rope_overhead_triceps_extension', 'cable_seated_crunch', 'cable_seated_lateral_raise',
    'cable_shoulder_press', 'calf_press', 'calf_press_on_the_leg_press_machine', 'calf_raise', 'calf_raise_on_a_dumbbell', 'calf_raises_with_bands',
    'chest_press', 'chin_up', 'clean', 'clean_deadlift', 'close_grip_barbell_bench_press', 'close_grip_dumbbell_press',
    'close_grip_ez_bar_curl', 'close_grip_ez_bar_curl_with_band', 'close_grip_ez_bar_press', 'close_grip_standing_barbell_curl', 'concentration_curls', 'cross_over_with_bands',
    'crunch_hands_overhead', 'dead_bug', 'deadlift', 'decline_barbell_bench_press', 'decline_close_grip_bench_to_skull_crusher', 'decline_dumbbell_bench_press',
    'decline_dumbbell_flyes', 'decline_dumbbell_triceps_extension', 'decline_ez_bar_triceps_extension', 'decline_smith_press', 'dip_machine', 'double_kettlebell_alternating_hang_clean',
    'double_kettlebell_jerk', 'double_kettlebell_push_press', 'double_kettlebell_windmill', 'double_leg_butt_kick', 'dumbbell_bench_press', 'dumbbell_bench_press_with_neutral_grip',
    'dumbbell_clean', 'dumbbell_flyes', 'dumbbell_incline_row', 'dumbbell_incline_shoulder_raise', 'dumbbell_lunges', 'dumbbell_press',
    'dumbbell_raise', 'dumbbell_row', 'dumbbell_seated_box_jump', 'dumbbell_seated_one_leg_calf_raise', 'dumbbell_side_bend', 'dumbbell_squat',
    'dumbbell_squat_to_a_bench', 'dumbbell_tricep_extension_pronated_grip', 'external_rotation', 'external_rotation_with_band', 'external_rotation_with_cable', 'ez_bar_curl',
    'face_pull', 'farmer_carry', 'front_raise_and_pullover', 'glute_kickback', 'goblet_squat', 'good_morning',
    'hack_squat', 'hamstring_curl', 'hanging_bar_good_morning', 'hip_extension_with_bands', 'incline_bench_pull', 'incline_cable_chest_press',
    'incline_push_up', 'incline_push_up_close_grip', 'incline_push_up_medium', 'incline_push_up_reverse_grip', 'incline_push_up_wide', 'internal_rotation_with_band',
    'kettlebell_arnold_press', 'kettlebell_hang_clean', 'kettlebell_one_legged_deadlift', 'kettlebell_pistol_squat', 'kettlebell_seated_press', 'kettlebell_windmill',
    'kneeling_cable_crunch_with_alternating_oblique_twists', 'kneeling_high_pulley_row', 'kneeling_jump_squat', 'kneeling_single_arm_high_pulley_row', 'kneeling_squat', 'lat_pulldown',
    'lateral_raise', 'lateral_raise_with_bands', 'leg_press', 'leverage_chest_press', 'leverage_deadlift', 'leverage_decline_chest_press',
    'leverage_incline_chest_press', 'leverage_shoulder_press', 'low_cable_crossover', 'lunges', 'lying_close_grip_bar_curl_on_high_pulley', 'lying_leg_curls',
    'machine_shoulder_military_press', 'machine_triceps_extension', 'middle_back_shrug', 'mountain_climber', 'one_arm_dumbbell_row', 'one_arm_high_pulley_cable_side_bends',
    'one_arm_kettlebell_clean', 'one_arm_kettlebell_floor_press', 'one_arm_kettlebell_row', 'one_arm_long_bar_row', 'one_arm_overhead_kettlebell_squats', 'one_legged_cable_kickback',
    'plank', 'power_clean', 'pull_up', 'push_up_to_side_plank', 'push_up_wide', 'push_ups_with_feet_elevated',
    'pushup', 'reverse_cable_curl', 'reverse_machine_flyes', 'romanian_deadlift', 'russian_twist', 'seated_barbell_twist',
    'seated_bent_over_one_arm_dumbbell_triceps_extension', 'seated_calf_raise', 'seated_leg_curl', 'seated_triceps_press', 'shoulder_press_with_bands', 'single_arm_cable_crossover',
    'single_leg_butt_kick', 'single_leg_glute_bridge', 'single_leg_leg_extension', 'smith_incline_shoulder_raise', 'smith_machine_bent_over_row', 'smith_machine_calf_raise',
    'smith_machine_close_grip_bench_press', 'smith_machine_hip_raise', 'smith_machine_one_arm_upright_row', 'smith_machine_overhead_shoulder_press', 'smith_machine_reverse_calf_raises', 'smith_machine_squat',
    'smith_machine_stiff_legged_deadlift', 'smith_single_leg_split_squat', 'split_squat_with_dumbbells', 'squat', 'squats_with_bands', 'standing_barbell_calf_raise',
    'standing_biceps_cable_curl', 'standing_dumbbell_calf_raise', 'standing_leg_curl', 'standing_long_jump', 'standing_military_press', 'standing_overhead_barbell_triceps_extension',
    'stiff_legged_dumbbell_deadlift', 'superman', 'two_arm_kettlebell_row'
  ];
  v_pred_radky integer;
  v_pred_hotlink_gif integer;
  v_pred_hotlink_image integer;
  v_pred_hotlink_wger integer;
  v_po_radky integer;
  v_po_hotlink_gif integer;
  v_po_hotlink_image integer;
  v_po_hotlink_wger integer;
  v_po_storage_gif integer;
  v_po_usable integer;
BEGIN
  -- PŘED
  SELECT count(*) INTO v_pred_radky FROM public.exercise_asset_registry;
  SELECT count(*) INTO v_pred_hotlink_gif FROM public.exercise_asset_registry
    WHERE gif_url ~* '(exercisedb.dev|wger.de)';
  SELECT count(*) INTO v_pred_hotlink_image FROM public.exercise_asset_registry
    WHERE image_url ~* '(exercisedb.dev|wger.de)';
  SELECT count(*) INTO v_pred_hotlink_wger FROM public.exercise_asset_registry
    WHERE wger_exercise_image_url ~* '(exercisedb.dev|wger.de)';
  RAISE NOTICE 'PŘED: % řádků celkem | starý CDN v gif_url=% image_url=% wger_exercise_image_url=%',
    v_pred_radky, v_pred_hotlink_gif, v_pred_hotlink_image, v_pred_hotlink_wger;

  -- 1) smaž VŠECHNY odkazy na exercisedb.dev/wger.de ze VŠECH 230 řádků, bez výjimky
  UPDATE public.exercise_asset_registry
    SET gif_url = NULL
    WHERE gif_url ~* '(exercisedb.dev|wger.de)';
  UPDATE public.exercise_asset_registry
    SET image_url = NULL
    WHERE image_url ~* '(exercisedb.dev|wger.de)';
  UPDATE public.exercise_asset_registry
    SET wger_exercise_image_url = NULL
    WHERE wger_exercise_image_url ~* '(exercisedb.dev|wger.de)';

  -- 2) 207 cviků (skupina A + B, docs/DALSI_KROK.md 9.12) dostane vlastní Storage animaci —
  -- URL se skládá z base + canonical_key, klíče drží pole nahoře, ne 207 řádků VALUES.
  UPDATE public.exercise_asset_registry AS r
    SET
      gif_url = v_storage_base || v.canonical_key || '.webp',
      media_source = 'free_exercise_db',
      media_license = 'Unlicense',
      media_updated_at = now()
    FROM (SELECT unnest(v_animovane_klice) AS canonical_key) AS v
    WHERE r.canonical_key = v.canonical_key;

  -- PO
  SELECT count(*) INTO v_po_radky FROM public.exercise_asset_registry;
  SELECT count(*) INTO v_po_hotlink_gif FROM public.exercise_asset_registry
    WHERE gif_url ~* '(exercisedb.dev|wger.de)';
  SELECT count(*) INTO v_po_hotlink_image FROM public.exercise_asset_registry
    WHERE image_url ~* '(exercisedb.dev|wger.de)';
  SELECT count(*) INTO v_po_hotlink_wger FROM public.exercise_asset_registry
    WHERE wger_exercise_image_url ~* '(exercisedb.dev|wger.de)';
  SELECT count(*) INTO v_po_storage_gif FROM public.exercise_asset_registry
    WHERE gif_url LIKE '%/storage/v1/object/public/exercise-media/cviky/%';
  SELECT count(*) FILTER (WHERE usable_in_plan) INTO v_po_usable FROM public.exercise_asset_registry;

  RAISE NOTICE 'PO: % řádků celkem | Storage animace=% | usable_in_plan (trigger)=% | starý CDN v gif_url=% image_url=% wger_exercise_image_url=%',
    v_po_radky, v_po_storage_gif, v_po_usable, v_po_hotlink_gif, v_po_hotlink_image, v_po_hotlink_wger;

  IF v_po_radky != v_pred_radky THEN
    RAISE EXCEPTION 'Počet řádků v registru se změnil (% -> %) — migrace neměla mazat ani přidávat řádky.', v_pred_radky, v_po_radky;
  END IF;
  IF v_po_hotlink_gif != 0 OR v_po_hotlink_image != 0 OR v_po_hotlink_wger != 0 THEN
    RAISE EXCEPTION 'Po migraci pořád existuje odkaz na exercisedb.dev/wger.de (gif_url=%, image_url=%, wger_exercise_image_url=%) — mělo být 0 ve všech třech.',
      v_po_hotlink_gif, v_po_hotlink_image, v_po_hotlink_wger;
  END IF;
  IF v_po_storage_gif != 207 THEN
    RAISE EXCEPTION 'Storage animaci má % cviků, čekalo se přesně 207 (skupina A 193 + skupina B 14).', v_po_storage_gif;
  END IF;
END $$;
