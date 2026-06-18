-- Český postup receptu — deterministicky z DB, bez runtime překladu.
alter table public.recipes_catalog
  add column if not exists instructions_cs jsonb;

comment on column public.recipes_catalog.instructions_cs is
  'České kroky postupu (jsonb pole stringů). Runtime render: instructions_cs ?? instructions.';
