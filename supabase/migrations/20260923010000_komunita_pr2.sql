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

-- 2. JEDNO NAHLÁŠENÍ NA UŽIVATELE A OBJEKT ---------------------------------

-- Částečné indexy, protože řádek nese vždy jen jedno z post_id / reply_id.
-- Prostý unique nad oběma sloupci by NULL nepovažoval za shodu a nehlídal
-- by nic.
create unique index if not exists community_reports_reporter_post_uniq
  on public.community_reports (reporter_id, post_id)
  where post_id is not null;

create unique index if not exists community_reports_reporter_reply_uniq
  on public.community_reports (reporter_id, reply_id)
  where reply_id is not null;
