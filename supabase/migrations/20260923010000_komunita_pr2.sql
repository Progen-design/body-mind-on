-- KOMUNITA, PR 2 — moderace a souhlas s pravidly.
-- docs/BMON_KOMUNITA_NAVRH_2026-09-23.md
--
-- Dvě věci, nic víc:
--
-- 1. `souhlasy_uzivatelu.druh` musí unést `komunita`. Souhlas s pravidly
--    komunity je právně týž druh záznamu jako souhlas s podmínkami —
--    připisovací log, ze kterého jde doložit, kdo a kdy odsouhlasil co.
--    NEPŘIDÁVÁ se do `DRUHY_SOUHLASU` v lib/souhlasyKonstanty.js: ten
--    seznam registrace vyžaduje CELÝ (`DRUHY_SOUHLASU.some(...)`
--    v lib/registration/bodyMetricsRegistration.js), takže by nový druh
--    zablokoval zakládání účtů lidem, kteří o komunitu nestojí.
--
-- 2. Jeden člověk nahlásí jednu věc jednou. Bez unikátu by se dalo
--    tlačítkem „nahlásit" nasypat do `community_reports` libovolně mnoho
--    řádků a moderace by se v nich utopila. API při duplicitě vrací 200
--    a nic nevkládá, ale autorita je index, ne aplikace.
--
-- NEAPLIKUJI tuhle migraci — píšu soubor, pouští ji Honza.

-- 1. SOUHLAS S PRAVIDLY KOMUNITY -------------------------------------------

alter table public.souhlasy_uzivatelu
  drop constraint if exists souhlasy_uzivatelu_druh_check;

alter table public.souhlasy_uzivatelu
  add constraint souhlasy_uzivatelu_druh_check
  check (druh = any (array['obchodni_podminky'::text, 'zdravotni_udaje'::text, 'komunita'::text]));

comment on column public.souhlasy_uzivatelu.druh is
  'obchodni_podminky a zdravotni_udaje vyžaduje registrace; komunita se zapisuje při prvním příspěvku (PR 2 komunity).';

-- 2. SEKCE DOTAZY A TÝMOVÁ ODPOVĚĎ -----------------------------------------

-- Dotazy stojí mezi „Můj progres" (0) a „Trénink" (10): je to místo, kam
-- člověk jde, když něco nefunguje, ne kam chodí číst.
insert into public.community_categories (name, slug, description, sort_order)
  select 'Dotazy', 'dotazy',
         'Zeptej se na cokoli kolem plánu, jídla nebo tréninku. Odpovídá tým BMON.', 5
  where not exists (
    select 1 from public.community_categories where slug = 'dotazy'
  );

-- Odpověď od týmu se musí poznat na první pohled — jinak je rada od nás
-- k nerozeznání od rady kohokoli jiného, a přesně o to v Dotazech jde.
--
-- Příznak NASTAVUJE SERVER podle ADMIN_TOKEN (api/community/reply.js), ne
-- klient. Kdyby ho posílal prohlížeč, označí se za tým kdokoli.
alter table public.community_replies
  add column if not exists is_team boolean not null default false;

comment on column public.community_replies.is_team is
  'Odpověď týmu BMON. Nastavuje server podle ADMIN_TOKEN, nikdy klient. Štítek „Tým BMON" v UI.';

create index if not exists community_replies_topic_team_idx
  on public.community_replies (topic_id)
  where is_team;

-- 3. JEDNO NAHLÁŠENÍ NA UŽIVATELE A OBJEKT ---------------------------------

-- Částečné indexy, protože řádek nese vždy jen jedno z post_id / reply_id.
-- Prostý unique nad oběma sloupci by NULL nepovažoval za shodu a nehlídal
-- by nic.
create unique index if not exists community_reports_reporter_post_uniq
  on public.community_reports (reporter_id, post_id)
  where post_id is not null;

create unique index if not exists community_reports_reporter_reply_uniq
  on public.community_reports (reporter_id, reply_id)
  where reply_id is not null;
