-- Hlavní statický obrázek z wger /api/v2/exerciseimage/ (doplňuje gif_url / image_url).
alter table public.exercise_asset_registry add column if not exists wger_exercise_image_url text;

comment on column public.exercise_asset_registry.wger_exercise_image_url is
  'URL hlavního statického obrázku z wger exerciseimage (může se lišit od gif_url)';
