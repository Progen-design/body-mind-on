-- recipes_catalog: lokální snapshot receptů (Spoonacular seed / meal_metadata_cache / manual)
-- Runtime generátor plánu čte odtud — žádné live Spoonacular HTTP.

create table if not exists recipes_catalog (
  id              bigint generated always as identity primary key,
  source          text not null default 'spoonacular',
  source_id       text,
  name_cs         text not null,
  name_en         text,
  meal_type       text not null,
  kcal            int not null,
  protein_g       numeric,
  carbs_g         numeric,
  fat_g           numeric,
  diet_tags       text[] not null default '{}',
  servings        int default 1,
  ingredients     jsonb,
  instructions    jsonb,
  spoonacular_url text,
  image_url       text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists idx_catalog_type_kcal on recipes_catalog (meal_type, kcal);
create index if not exists idx_catalog_diet on recipes_catalog using gin (diet_tags);
create index if not exists idx_catalog_active on recipes_catalog (active) where active = true;

comment on table recipes_catalog is 'Lokální katalog receptů pro generování plánu bez runtime Spoonacular API.';
