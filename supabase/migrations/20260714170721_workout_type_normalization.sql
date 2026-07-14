-- =============================================================================
-- PROBLEM: Health Auto Export posila nazvy treninku LOKALIZOVANE podle jazyka
-- telefonu: "Bazén Plavat", "Venku Procházka", "Otevěřená voda Plavat" (i s
-- preklepem). Kdyz uzivatel prepne jazyk iOS, nazvy se zmeni a analytika se
-- rozsype. AI agent navic nemuze spolehat na volny text.
--
-- RESENI: mapovaci tabulka -> kanonicky typ (stabilni klic) + cesky label.
-- =============================================================================

create table if not exists public.workout_type_map (
  raw_type   text primary key,     -- co posle HAE
  canonical  text not null,        -- stabilni klic pro logiku a AI
  label_cs   text not null,        -- co ukazat uzivateli
  category   text not null
    check (category in ('kardio','sila','plavani','kolo','chuze','beh','jina'))
);

alter table public.workout_type_map enable row level security;
drop policy if exists wtm_read on public.workout_type_map;
create policy wtm_read on public.workout_type_map for select to authenticated using (true);

insert into public.workout_type_map (raw_type, canonical, label_cs, category) values
  ('Bazén Plavat',              'pool_swim',      'Plavání v bazénu',     'plavani'),
  ('Pool Swim',                 'pool_swim',      'Plavání v bazénu',     'plavani'),
  ('Otevěřená voda Plavat',     'open_water_swim','Plavání v přírodě',    'plavani'),
  ('Otevřená voda Plavat',      'open_water_swim','Plavání v přírodě',    'plavani'),
  ('Open Water Swim',           'open_water_swim','Plavání v přírodě',    'plavani'),
  ('Venku Procházka',           'outdoor_walk',   'Procházka venku',      'chuze'),
  ('Outdoor Walk',              'outdoor_walk',   'Procházka venku',      'chuze'),
  ('Uvnitř Procházka',          'indoor_walk',    'Chůze uvnitř',         'chuze'),
  ('Indoor Walk',               'indoor_walk',    'Chůze uvnitř',         'chuze'),
  ('Venku Cyklistika',          'outdoor_cycle',  'Cyklistika venku',     'kolo'),
  ('Outdoor Cycle',             'outdoor_cycle',  'Cyklistika venku',     'kolo'),
  ('Uvnitř Cyklistika',         'indoor_cycle',   'Cyklistika uvnitř',    'kolo'),
  ('Indoor Cycle',              'indoor_cycle',   'Cyklistika uvnitř',    'kolo'),
  ('Venku Běh',                 'outdoor_run',    'Běh venku',            'beh'),
  ('Outdoor Run',               'outdoor_run',    'Běh venku',            'beh'),
  ('Uvnitř Běh',                'indoor_run',     'Běh uvnitř',           'beh'),
  ('Indoor Run',                'indoor_run',     'Běh uvnitř',           'beh'),
  ('Tradiční silový trénink',   'strength',       'Silový trénink',       'sila'),
  ('Traditional Strength Training','strength',    'Silový trénink',       'sila'),
  ('Funkční silový trénink',    'functional',     'Funkční trénink',      'sila'),
  ('Functional Strength Training','functional',   'Funkční trénink',      'sila'),
  ('Vysoce intenzivní intervalový trénink','hiit','HIIT',                 'kardio'),
  ('High Intensity Interval Training','hiit',     'HIIT',                 'kardio'),
  ('Eliptický trenažér',        'elliptical',     'Eliptický trenažér',   'kardio'),
  ('Veslování',                 'rowing',         'Veslování',            'kardio'),
  ('Jóga',                      'yoga',           'Jóga',                 'jina'),
  ('Yoga',                      'yoga',           'Jóga',                 'jina'),
  ('Turistika',                 'hiking',         'Turistika',            'chuze'),
  ('Hiking',                    'hiking',         'Turistika',            'chuze'),
  ('Core Trénink',              'core',           'Core trénink',         'sila'),
  ('Core Training',             'core',           'Core trénink',         'sila')
on conflict (raw_type) do update set
  canonical = excluded.canonical,
  label_cs  = excluded.label_cs,
  category  = excluded.category;

-- Hlidac: typy treninku, ktere jeste nejsou namapovane
create or replace view public.workout_types_unmapped
with (security_invoker = true)
as
select w.workout_type, count(*) as pocet, max(w.local_date) as naposledy
from public.apple_health_workouts w
left join public.workout_type_map m on m.raw_type = w.workout_type
where m.raw_type is null and w.workout_type is not null
group by w.workout_type;

comment on table public.workout_type_map is
  'Mapovani lokalizovanych nazvu treninku z Health Auto Export na stabilni kanonicke klice. HAE lokalizuje podle jazyka iOS - bez tohoto se analytika rozpadne pri zmene jazyka.';
comment on view public.workout_types_unmapped is
  'Typy treninku, ktere dorazily ale nejsou v workout_type_map. Doplnit.';
