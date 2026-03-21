-- Volitelné sloupce pro čtení z exercise_asset_registry (produkční data)
alter table public.exercise_asset_registry add column if not exists wger_exercise_id integer;
alter table public.exercise_asset_registry add column if not exists wger_name_en text;

comment on column public.exercise_asset_registry.wger_exercise_id is 'ID cviku ve wger (pro odkazy / diagnostiku)';
comment on column public.exercise_asset_registry.wger_name_en is 'Anglický název cviku (zobrazení místo náhodného wger search)';
