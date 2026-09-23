-- JÍDLO MIMO PLÁN — rychlý zápis z fotky nebo z textu.
--
-- Body & Mind ON dává hotový jídelníček, ale neměl kam zapsat jídlo snězené
-- MIMO plán. Uživatel jídlo vyfotí (nebo popíše), gpt-4o-mini odhadne kcal
-- a makra, uživatel odhad před uložením potvrdí nebo opraví. Žádná databáze
-- potravin — jen odhad, a UI ho tak i označuje.
--
-- FOTKY JÍDLA LEŽÍ V PRIVATE BUCKETU `quick-log-photos`, stejný vzor jako
-- `community-photos`: žádná storage politika pro `anon` ani `authenticated`,
-- čte i zapisuje výhradně API se service klíčem. Cesta
-- `{user_id}/{uuid}.jpg`. Smazání účtu maže prefix `{user_id}/`
-- (api/delete-account.js) — kaskáda z auth.users soubory v bucketu nemaže.
--
-- NEAPLIKOVÁNO. Vytvořeno 24. 9. 2026 v PR „jídlo mimo plán" — nasadit
-- před mergem, pak `get_advisors` (security + performance).

-- 1. TABULKA ----------------------------------------------------------------

create table if not exists public.quick_food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  zdroj text not null check (zdroj in ('foto', 'text')),
  -- Co uživatel napsal, nebo jak AI jídlo na fotce popsala.
  popis text,
  -- Cesta v bucketu quick-log-photos; null u textového zápisu.
  photo_storage_path text,
  kcal integer not null check (kcal between 0 and 3000),
  protein_g numeric(6,1) not null check (protein_g >= 0),
  carbs_g numeric(6,1) not null check (carbs_g >= 0),
  fat_g numeric(6,1) not null check (fat_g >= 0),
  ai_confidence text check (ai_confidence in ('low', 'medium', 'high')),
  -- true, když uživatel AI odhad přepsal.
  upraveno_uzivatelem boolean not null default false,
  -- Den (YYYY-MM-DD, Europe/Prague), do jehož součtu záznam patří.
  plan_day text,
  created_at timestamptz not null default now()
);

create index if not exists quick_food_logs_user_day_idx
  on public.quick_food_logs(user_id, plan_day);

-- Denní limit 20 zápisů se počítá podle created_at.
create index if not exists quick_food_logs_user_created_idx
  on public.quick_food_logs(user_id, created_at desc);

comment on table public.quick_food_logs is
  'Jídlo snězené mimo plán: AI odhad kcal a maker z fotky nebo textu, potvrzený uživatelem.';

-- 2. RLS --------------------------------------------------------------------
--
-- Čte, vkládá a maže jen vlastník. UPDATE jen vlastník a jen 30 minut od
-- vytvoření — oprava AI odhadu před finálním uložením, ne přepisování
-- historie zpětně. API hlídá totéž okno (lib/quickFoodLog.js, OKNO_OPRAVY_MIN).

alter table public.quick_food_logs enable row level security;

drop policy if exists quick_food_logs_select_own on public.quick_food_logs;
create policy quick_food_logs_select_own on public.quick_food_logs
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists quick_food_logs_insert_own on public.quick_food_logs;
create policy quick_food_logs_insert_own on public.quick_food_logs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists quick_food_logs_delete_own on public.quick_food_logs;
create policy quick_food_logs_delete_own on public.quick_food_logs
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists quick_food_logs_update_own_recent on public.quick_food_logs;
create policy quick_food_logs_update_own_recent on public.quick_food_logs
  for update to authenticated
  using ((select auth.uid()) = user_id and created_at > now() - interval '30 minutes')
  with check ((select auth.uid()) = user_id);

-- 3. STORAGE BUCKET ---------------------------------------------------------
--
-- PRIVATE, 5 MB, jen obrázky. Žádná politika na storage.objects — bez
-- service klíče se k fotce nedostane nikdo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('quick-log-photos', 'quick-log-photos', false, 5242880,
          array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = 5242880,
        allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
