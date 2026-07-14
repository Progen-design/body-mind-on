-- =============================================================================
-- REGISTR METRIK
-- Misto natvrdo vyjmenovanych metrik ve view definujeme pravidla agregace.
-- Kazda nova metrika z Apple Health se pak zpracuje automaticky.
-- =============================================================================

create table if not exists public.apple_health_metric_defs (
  metric_name     text primary key,
  label_cs        text not null,
  category        text not null
    check (category in ('aktivita','srdce','telo','dychani','pohyb','prostredi','spanek','ostatni')),
  -- jak agregovat pres den:
  --   sum  = kumulativni (kroky, energie, vzdalenost, cas)
  --   avg  = mira/rate (tep, rychlost, procenta)
  --   last = bodova hodnota (vaha, VO2max)
  --   max  = spicka
  agg             text not null default 'avg' check (agg in ('sum','avg','last','max','min')),
  canonical_unit  text,
  -- prepocet na kanonickou jednotku: hodnota * factor, pokud unit = from_unit
  from_unit       text,
  factor          numeric,
  is_key          boolean not null default false,  -- zobrazit v hlavnim prehledu profilu
  created_at      timestamptz not null default now()
);

alter table public.apple_health_metric_defs enable row level security;

drop policy if exists ahmd_read_all on public.apple_health_metric_defs;
create policy ahmd_read_all on public.apple_health_metric_defs
  for select to authenticated using (true);

insert into public.apple_health_metric_defs
  (metric_name, label_cs, category, agg, canonical_unit, from_unit, factor, is_key)
values
  -- ---------- AKTIVITA (kumulativni) ----------
  ('step_count',                'Kroky',                    'aktivita','sum','count',  null,   null, true),
  ('active_energy',             'Aktivní energie',          'aktivita','sum','kcal',   'kJ', 1/4.184, true),
  ('basal_energy_burned',       'Bazální energie',          'aktivita','sum','kcal',   'kJ', 1/4.184, true),
  ('apple_exercise_time',       'Čas cvičení',              'aktivita','sum','min',    null,   null, true),
  ('apple_stand_time',          'Čas ve stoje',             'aktivita','sum','min',    null,   null, false),
  ('apple_stand_hour',          'Hodiny ve stoje',          'aktivita','sum','count',  null,   null, true),
  ('apple_move_time',           'Čas pohybu',               'aktivita','sum','min',    null,   null, false),
  ('flights_climbed',           'Vystoupaná patra',         'aktivita','sum','count',  null,   null, false),
  ('physical_effort',           'Fyzická námaha',           'aktivita','avg','kcal/hr·kg', null, null, false),

  -- ---------- POHYB / VZDALENOSTI ----------
  ('walking_running_distance',  'Vzdálenost chůze/běhu',    'pohyb','sum','km',    null, null, true),
  ('cycling_distance',          'Vzdálenost na kole',       'pohyb','sum','km',    null, null, false),
  ('swimming_distance',         'Vzdálenost plavání',       'pohyb','sum','m',     null, null, false),
  ('swimming_stroke_count',     'Plavecká tempa',           'pohyb','sum','count', null, null, false),
  ('wheelchair_distance',       'Vzdálenost na vozíku',     'pohyb','sum','km',    null, null, false),
  ('walking_speed',             'Rychlost chůze',           'pohyb','avg','km/hr', null, null, false),
  ('walking_step_length',       'Délka kroku',              'pohyb','avg','cm',    null, null, false),
  ('walking_asymmetry_percentage','Asymetrie chůze',        'pohyb','avg','%',     null, null, false),
  ('walking_double_support_percentage','Dvojitá opora',     'pohyb','avg','%',     null, null, false),
  ('stair_speed_up',            'Rychlost do schodů',       'pohyb','avg','m/s',   null, null, false),
  ('stair_speed_down',          'Rychlost ze schodů',       'pohyb','avg','m/s',   null, null, false),
  ('six_minute_walking_test_distance','6min test chůze',    'pohyb','last','m',    null, null, false),

  -- ---------- SRDCE / REGENERACE ----------
  ('heart_rate',                'Tepová frekvence',         'srdce','avg','count/min', null, null, true),
  ('resting_heart_rate',        'Klidový tep',              'srdce','avg','count/min', null, null, true),
  ('heart_rate_variability',    'HRV',                      'srdce','avg','ms',        null, null, true),
  ('walking_heart_rate_average','Tep při chůzi',            'srdce','avg','count/min', null, null, false),
  ('cardio_recovery',           'Zotavení tepu (1 min)',    'srdce','avg','count/min', null, null, true),
  ('vo2_max',                   'VO2 max',                  'srdce','last','ml/(kg·min)', null, null, true),
  ('atrial_fibrillation_burden','Fibrilace síní',           'srdce','avg','%',         null, null, false),

  -- ---------- DYCHANI ----------
  ('respiratory_rate',          'Dechová frekvence',        'dychani','avg','count/min', null, null, true),
  ('blood_oxygen_saturation',   'Okysličení krve',          'dychani','avg','%',         null, null, true),
  ('forced_vital_capacity',     'Vitální kapacita plic',    'dychani','avg','L',         null, null, false),

  -- ---------- TELO (bodove) ----------
  ('weight_body_mass',          'Váha',                     'telo','last','kg',    null, null, true),
  ('body_fat_percentage',       'Tělesný tuk',              'telo','last','%',     null, null, true),
  ('lean_body_mass',            'Čistá tělesná hmota',      'telo','last','kg',    null, null, true),
  ('body_mass_index',           'BMI',                      'telo','last','count', null, null, true),
  ('height',                    'Výška',                    'telo','last','cm',    null, null, false),
  ('waist_circumference',       'Obvod pasu',               'telo','last','cm',    null, null, false),
  ('body_temperature',          'Tělesná teplota',          'telo','avg','degC',   null, null, false),
  ('apple_sleeping_wrist_temperature','Teplota zápěstí ve spánku','telo','avg','degC', null, null, false),
  ('blood_glucose',             'Glykémie',                 'telo','avg','mg/dL',  null, null, false),

  -- ---------- PROSTREDI ----------
  ('time_in_daylight',          'Čas na denním světle',     'prostredi','sum','min',    null, null, false),
  ('headphone_audio_exposure',  'Hluk ze sluchátek',        'prostredi','avg','dBASPL', null, null, false),
  ('environmental_audio_exposure','Hluk z okolí',           'prostredi','avg','dBASPL', null, null, false),
  ('underwater_temperature',    'Teplota vody',             'prostredi','avg','degC',   null, null, false),
  ('underwater_depth',          'Hloubka ponoru',           'prostredi','max','m',      null, null, false)
on conflict (metric_name) do update set
  label_cs       = excluded.label_cs,
  category       = excluded.category,
  agg            = excluded.agg,
  canonical_unit = excluded.canonical_unit,
  from_unit      = excluded.from_unit,
  factor         = excluded.factor,
  is_key         = excluded.is_key;

comment on table public.apple_health_metric_defs is
  'Registr metrik Apple Health: pravidla agregace, prepocet jednotek, ceske nazvy. Nova metrika bez zaznamu se agreguje heuristicky (avg) a objevi se v apple_health_unknown_metrics.';
