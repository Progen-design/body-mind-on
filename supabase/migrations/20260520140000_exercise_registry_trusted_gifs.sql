-- Kompletní oprava exercise_asset_registry: ověřené ExerciseDB GIFy, odstranění mrtvých wger static PNG.
-- Zdroj pravdy: lib/exerciseRegistryMedia.js

-- 1) Odstranit nespolehlivé wger static cesty (404)
update public.exercise_asset_registry
set
  image_url = null,
  wger_exercise_image_url = null,
  updated_at = now()
where
  (image_url is not null and image_url like '%wger.de/static/images/exercises/%')
  or (wger_exercise_image_url is not null and wger_exercise_image_url like '%wger.de/static/images/exercises/%');

-- 2) Canonical cviky – ověřené GIFy
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/gUjqdei.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'squat';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/I4hDWkc.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'pushup';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/lBDjFxJ.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'pull_up';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/eZyBC3j.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'bent_over_row';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/nUwVh7b.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'deadlift';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/wQ2c4XD.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'romanian_deadlift';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/EIeI8Vf.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'bench_press';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/A6wtbuL.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'overhead_press';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/VBAWRPG.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'plank';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/kMzUs9Y.gif', image_url = null, wger_exercise_id = null, wger_name_en = 'forward lunge', source = 'exercisedb', updated_at = now() where canonical_key = 'lunges';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/DsgkuIt.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'lateral_raise';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/uSkDMYl.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'bicep_curl';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/ZujAdR9.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'tricep_extension';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/7zdxRTl.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'leg_press';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/uOV3Itw.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'warmup';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/uOV3Itw.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'cooldown';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/5VXmnV5.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'plank_side';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/RJgzwny.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'mountain_climber';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/4GqRrAk.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'superman';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/IZVHb27.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'rest';

-- 3) Doplňkové cviky v registry
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/dK9394r.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'burpee';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/XVDdcoj.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'russian_twist';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/GibBPPg.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'glute_bridge';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/2NpxjC1.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'hammer_curl';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/6MfS53i.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'calf_raise';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/4c9BhzB.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'lat_pulldown';
update public.exercise_asset_registry set gif_url = 'https://static.exercisedb.dev/media/4IKbhHV.gif', image_url = null, source = 'exercisedb', updated_at = now() where canonical_key = 'cable_row';

-- 4) Chybějící canonical záznamy
insert into public.exercise_asset_registry (canonical_key, display_name_cs, gif_url, source, trust_level, wger_name_en)
values
  ('lateral_raise', 'Rozpažky', 'https://static.exercisedb.dev/media/DsgkuIt.gif', 'exercisedb', 'exact', 'dumbbell lateral raise'),
  ('warmup', 'Rozcvička', 'https://static.exercisedb.dev/media/uOV3Itw.gif', 'exercisedb', 'exact', 'dynamic stretch')
on conflict (canonical_key) do update set
  gif_url = excluded.gif_url,
  display_name_cs = excluded.display_name_cs,
  image_url = null,
  wger_exercise_image_url = null,
  source = 'exercisedb',
  trust_level = 'exact',
  updated_at = now();
