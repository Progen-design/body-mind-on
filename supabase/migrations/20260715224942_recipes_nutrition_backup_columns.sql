-- Zaloha puvodnich (odhadnutych) hodnot pred prepoctem ze surovin.
alter table public.recipes_catalog
  add column if not exists kcal_original       integer,
  add column if not exists protein_g_original  numeric,
  add column if not exists carbs_g_original    numeric,
  add column if not exists fat_g_original      numeric,
  add column if not exists nutrition_source    text,
  add column if not exists nutrition_computed_at timestamptz;

comment on column public.recipes_catalog.kcal_original is
  'Puvodni odhadnuta hodnota pred prepoctem ze surovin (15.7.2026).';
comment on column public.recipes_catalog.nutrition_source is
  'computed_from_ingredients | spoonacular | estimate';

-- ulozit puvodni hodnoty (jen jednou, kde jeste nejsou)
update public.recipes_catalog
set kcal_original      = kcal,
    protein_g_original = protein_g,
    carbs_g_original   = carbs_g,
    fat_g_original     = fat_g
where kcal_original is null;;
