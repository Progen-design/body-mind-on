-- ZÁZNAM SOUHLASŮ — GDPR čl. 7 odst. 1: správce musí být schopen souhlas DOLOŽIT.
--
-- Do teď se nesbíral ani nezapisoval žádný. Přitom appka zpracovává tělesné
-- složení, spánek a klidový tep, tedy zvláštní kategorii podle čl. 9, kterou
-- „plnění smlouvy" nepokryje, a plán se generuje hned po registraci, tedy
-- uvnitř 14denní lhůty pro odstoupení (§ 1837 obč. zák.).
--
-- PŘIPISOVACÍ LOG, ne sloupec v profilu: odvolání souhlasu nesmí smazat důkaz,
-- že souhlas kdysi byl. Odvolání se zapisuje jako `odvolano_at` na tomtéž
-- řádku; nový souhlas je nový řádek. Platný souhlas = poslední řádek daného
-- druhu s odvolano_at IS NULL.
create table if not exists public.souhlasy_uzivatelu (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  druh           text not null check (druh in ('obchodni_podminky', 'zdravotni_udaje')),
  -- Verze dokumentu, se kterou uživatel souhlasil. Bez ní nejde po změně
  -- podmínek poznat, KDO souhlasil s čím.
  ucinnost_dokumentu date not null,
  udeleno_at     timestamptz not null default now(),
  odvolano_at    timestamptz,
  -- Odkud souhlas přišel ('registrace', 'profil', …). Ne IP adresa: ta je
  -- sama osobním údajem a k doložení souhlasu ji nepotřebujeme.
  zdroj          text not null default 'registrace'
);

create index if not exists souhlasy_uzivatelu_user_druh_idx
  on public.souhlasy_uzivatelu (user_id, druh, udeleno_at desc);

alter table public.souhlasy_uzivatelu enable row level security;

-- Uživatel na své souhlasy VIDÍ (právo na přístup), ale nesmí je psát ani
-- měnit — jinak by šlo dopsat souhlas, který nikdy nepadl. Zapisuje výhradně
-- server přes service role, která RLS obchází.
drop policy if exists souhlasy_ctu_svoje on public.souhlasy_uzivatelu;
create policy souhlasy_ctu_svoje on public.souhlasy_uzivatelu
  for select using (auth.uid() = user_id);
