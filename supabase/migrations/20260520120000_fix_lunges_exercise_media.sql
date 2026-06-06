-- Oprava nefunkční ukázky cviku Výpady (404 wger static PNG, špatné wger ID).
update public.exercise_asset_registry
set
  gif_url = 'https://static.exercisedb.dev/media/iqH55N8.gif',
  image_url = null,
  wger_exercise_id = null,
  wger_name_en = 'forward lunge',
  source = 'exercisedb',
  updated_at = now()
where canonical_key = 'lunges';
