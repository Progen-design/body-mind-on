-- KOMUNITA, FÁZE 1 (MVP) — docs/BMON_KOMUNITA_NAVRH_2026-09-23.md.
--
-- Rozšiřuje stávající fórum (`community_categories` / `community_posts` /
-- `community_replies`), nestaví vedle něj druhý feed. Přibývá check-in
-- s fotkami a váhou, lajky a nahlášení.
--
-- FOTKY POSTAVY JSOU CITLIVÁ DATA. Bucket `community-photos` je PRIVATE —
-- na rozdíl od `avatars`, `recipe-images` a `exercise-media`, které jsou
-- veřejné a pro tohle použitelné nejsou. Čte se výhradně přes signed URL
-- vydané API se service klíčem; žádná storage politika pro `anon`
-- ani `authenticated` tu není schválně.
--
-- POČTY SE POČÍTAJÍ TRIGGEREM, NE DOTAZEM. `reply_count` dnes API dopočítává
-- tak, že natáhne všechny odpovědi všech témat a sečte je v paměti. U lajků
-- by to znamenalo totéž znovu. Sloupec + trigger je jedno místo pravdy a
-- seznam se přestane škálovat s počtem odpovědí.
--
-- APLIKOVÁNO v produkci 23. 9. 2026 (projekt ipfyavvmmxmsjupmfnes).
-- Ověřeno po aplikaci: tři nové tabulky, pět sloupců na community_posts,
-- bucket community-photos jako private, kategorie muj-progres i motivace,
-- oba triggery na počty.

-- 1. NOVÉ SLOUPCE NA PŘÍSPĚVCÍCH ------------------------------------------

alter table public.community_posts
  add column if not exists post_type text not null default 'text',
  add column if not exists weight_kg numeric(5,1),
  add column if not exists is_hidden boolean not null default false,
  add column if not exists reply_count int not null default 0,
  add column if not exists like_count int not null default 0;

-- Check zvlášť: `add column ... check` by při opakovaném spuštění spadl na
-- duplicitní jméno omezení, tohle je idempotentní.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'community_posts_post_type_check'
  ) then
    alter table public.community_posts
      add constraint community_posts_post_type_check
      check (post_type in ('text', 'checkin'));
  end if;
end $$;

comment on column public.community_posts.post_type is
  'text = běžný příspěvek, checkin = fotky + váha v kategorii Můj progres.';
comment on column public.community_posts.is_hidden is
  '„Jen pro mě" — vidí jen autor. API filtruje is_hidden = false OR user_id = me.';
comment on column public.community_posts.weight_kg is
  'Váha u check-inu. Bez vyplnění ji server doplní z posledního body_measurements.';

-- 2. FOTKY ------------------------------------------------------------------

create table if not exists public.community_post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- {user_id}/{post_id}/{uuid}.jpg v bucketu community-photos
  storage_path text not null,
  width int,
  height int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists community_post_photos_post_id_idx
  on public.community_post_photos(post_id);

comment on table public.community_post_photos is
  'Fotky u příspěvku (max 4). Soubory leží v PRIVATE bucketu community-photos, čte se přes signed URL z API.';

-- 3. LAJKY ------------------------------------------------------------------

create table if not exists public.community_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

comment on table public.community_likes is
  'Jeden lajk na uživatele a příspěvek — drží to primární klíč, ne aplikace.';

-- 4. NAHLÁŠENÍ --------------------------------------------------------------

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete cascade,
  reply_id uuid references public.community_replies(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

comment on table public.community_reports is
  'Nahlášený obsah. Tabulka vzniká už v MVP, aby PR 2 (moderace) nepotřeboval další migraci.';

-- 5. TRIGGERY NA POČTY ------------------------------------------------------

create or replace function public.community_sync_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
      set reply_count = reply_count + 1
      where id = new.topic_id;
    return new;
  end if;

  update public.community_posts
    set reply_count = greatest(0, reply_count - 1)
    where id = old.topic_id;
  return old;
end $$;

drop trigger if exists community_replies_count on public.community_replies;
create trigger community_replies_count
  after insert or delete on public.community_replies
  for each row execute function public.community_sync_reply_count();

create or replace function public.community_sync_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
      set like_count = like_count + 1
      where id = new.post_id;
    return new;
  end if;

  update public.community_posts
    set like_count = greatest(0, like_count - 1)
    where id = old.post_id;
  return old;
end $$;

drop trigger if exists community_likes_count on public.community_likes;
create trigger community_likes_count
  after insert or delete on public.community_likes
  for each row execute function public.community_sync_like_count();

-- Funkce jsou SECURITY DEFINER, protože píšou do community_posts cizího
-- uživatele. Volat je smí jedině trigger — přímé spuštění z internetu
-- přes /rest/v1/rpc se zakazuje stejně jako u sync_plan_activation().
revoke execute on function public.community_sync_reply_count() from public;
revoke execute on function public.community_sync_reply_count() from anon;
revoke execute on function public.community_sync_reply_count() from authenticated;
revoke execute on function public.community_sync_like_count() from public;
revoke execute on function public.community_sync_like_count() from anon;
revoke execute on function public.community_sync_like_count() from authenticated;

-- Dorovnání počtů pro řádky, které tu byly před triggerem.
update public.community_posts p
  set reply_count = coalesce((
    select count(*) from public.community_replies r where r.topic_id = p.id
  ), 0);

-- 6. RLS --------------------------------------------------------------------

alter table public.community_post_photos enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_reports enable row level security;

drop policy if exists community_post_photos_select on public.community_post_photos;
create policy community_post_photos_select
  on public.community_post_photos for select
  to authenticated using (true);

drop policy if exists community_post_photos_insert on public.community_post_photos;
create policy community_post_photos_insert
  on public.community_post_photos for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists community_post_photos_delete on public.community_post_photos;
create policy community_post_photos_delete
  on public.community_post_photos for delete
  to authenticated using (auth.uid() = user_id);

drop policy if exists community_likes_select on public.community_likes;
create policy community_likes_select
  on public.community_likes for select
  to authenticated using (true);

drop policy if exists community_likes_insert on public.community_likes;
create policy community_likes_insert
  on public.community_likes for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists community_likes_delete on public.community_likes;
create policy community_likes_delete
  on public.community_likes for delete
  to authenticated using (auth.uid() = user_id);

-- Nahlášení smí uživatel jen založit. ŽÁDNÁ SELECT politika: kdo co nahlásil,
-- čte výhradně service_role (admin moderace v PR 2).
drop policy if exists community_reports_insert on public.community_reports;
create policy community_reports_insert
  on public.community_reports for insert
  to authenticated with check (auth.uid() = reporter_id);

-- 7. KATEGORIE --------------------------------------------------------------

-- „Motivace a progres" se štěpila s novým „Můj progres" — po přidání
-- check-inů by dvě kategorie znamenaly totéž a nikdo by nevěděl, kam psát.
update public.community_categories
  set slug = 'motivace', name = 'Motivace'
  where slug = 'motivace-progres';

insert into public.community_categories (name, slug, description, sort_order)
  select 'Můj progres', 'muj-progres',
         'Check-in: fotka, váha a krátká poznámka. Za měsíc uvidíš rozdíl.', 0
  where not exists (
    select 1 from public.community_categories where slug = 'muj-progres'
  );

-- 8. STORAGE BUCKET ---------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('community-photos', 'community-photos', false, 5242880,
          array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = 5242880,
        allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
