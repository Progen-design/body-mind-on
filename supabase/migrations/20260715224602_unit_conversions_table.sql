-- Prevody jednotek z receptu na gramy.
-- ingredient_match = null → plati obecne pro danou jednotku.
create table if not exists public.unit_conversions (
  id               bigserial primary key,
  unit             text not null,
  ingredient_match text,
  grams            numeric not null,
  note             text,
  created_at       timestamptz not null default now(),
  unique (unit, ingredient_match)
);

alter table public.unit_conversions enable row level security;
drop policy if exists unit_conv_read on public.unit_conversions;
create policy unit_conv_read on public.unit_conversions
  for select to authenticated using (true);

insert into public.unit_conversions (unit, ingredient_match, grams, note) values
  -- primo merene
  ('g',        null, 1,    'primo'),
  ('ml',       null, 1,    'aproximace pro vodnate tekutiny'),
  -- kuchynske miry
  ('lžíce',    null, 15,   null),
  ('lžička',   null, 5,    null),
  ('špetka',   null, 0.5,  null),
  ('kapka',    null, 0.05, null),
  ('hrst',     null, 30,   'hrst listove zeleniny/bylinek'),
  ('hrstě',    null, 30,   null),
  ('hrnek',    null, 240,  'objem; u sypkych je potreba korekce dle suroviny'),
  ('hrnky',    null, 240,  null),
  ('stroužek', null, 3,    'strouzek cesneku'),
  ('stroužky', null, 3,    null),
  ('plechovka',null, 400,  'standardni konzerva'),
  ('plechovky',null, 400,  null),
  ('malá plechovka', null, 200, null),
  ('litru',    null, 1000, null),
  ('plátek',   null, 20,   null),
  ('plátky',   null, 20,   null),
  ('plátků',   null, 20,   null),
  -- kusove suroviny (ingredient_match = name_cs z ingredients_nutrition)
  ('ks', 'vejce',             55,  'stredni vejce bez skorapky'),
  ('ks', 'banán',             120, 'stredni banan bez slupky'),
  ('ks', 'jablko',            180, 'stredni jablko'),
  ('ks', 'citron',            100, 'stredni citron'),
  ('ks', 'celozrnný chléb',   30,  'kraj chleba'),
  ('ks', 'celozrnný toast',   30,  'platek toastu'),
  ('ks', 'cibule',            110, 'stredni cibule'),
  ('ks', 'rajče',             120, 'stredni rajce'),
  ('ks', 'paprika',           150, 'stredni paprika'),
  ('ks', 'avokádo',           150, 'stredni avokado bez pecky')
on conflict (unit, ingredient_match) do update set
  grams = excluded.grams, note = excluded.note;

comment on table public.unit_conversions is
  'Prevody jednotek z receptu na gramy. ingredient_match = null → obecne pravidlo.';;
