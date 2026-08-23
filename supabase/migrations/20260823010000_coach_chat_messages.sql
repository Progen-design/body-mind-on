-- Historie chatu s TEDem.
--
-- Proč vlastní tabulka: chat musí přežít refresh stránky i přechod mezi
-- zařízeními a TED potřebuje vidět, na co se člověk ptal před chvílí.
-- localStorage by obojí neuměl.
--
-- `kontext` drží, u čeho se otazník kliknul (metrika, jídlo, cvik) — chat se
-- pak otevře rovnou u toho čísla, místo aby uživatel musel vysvětlovat,
-- co má na mysli.
create table if not exists public.coach_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'ted')),
  obsah text not null check (length(btrim(obsah)) between 1 and 4000),
  -- Volitelné ukotvení: {"typ":"metrika","klic":"hrv","hodnota":"51,1 ms"}
  kontext jsonb,
  created_at timestamptz not null default now()
);

create index if not exists coach_chat_messages_user_idx
  on public.coach_chat_messages (user_id, created_at desc);

alter table public.coach_chat_messages enable row level security;

-- Cizí konverzace nikdo nevidí. Zdravotní kontext v ní být může.
drop policy if exists coach_chat_messages_select on public.coach_chat_messages;
create policy coach_chat_messages_select on public.coach_chat_messages
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists coach_chat_messages_insert on public.coach_chat_messages;
create policy coach_chat_messages_insert on public.coach_chat_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- Úprava cizí ani vlastní zprávy zpětně nedává smysl: historie je záznam
-- toho, co bylo řečeno. Mazání ano — člověk má právo konverzaci smazat.
drop policy if exists coach_chat_messages_delete on public.coach_chat_messages;
create policy coach_chat_messages_delete on public.coach_chat_messages
  for delete to authenticated using ((select auth.uid()) = user_id);
