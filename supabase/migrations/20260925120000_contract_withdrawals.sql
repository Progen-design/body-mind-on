-- ODSTOUPENÍ OD SMLOUVY — záznam o každém odstoupení do 14 dnů (§ 1829 OZ).
--
-- Zapisuje POST /api/subscription/withdraw až PO úspěšném refundu a zrušení
-- subscription ve Stripe. Jeden řádek na subscription (unikátní index) —
-- zároveň pojistka proti dvojímu kliknutí: druhý zápis skončí 23505
-- a endpoint vrátí stav prvního odstoupení.
--
-- Částky v celých Kč (Stripe má haléře, endpoint dělí stem).
--
-- NEAPLIKOVÁNO. Vytvořeno 25. 9. 2026 v PR „lifecycle po trialu, potvrzení
-- smlouvy, souhlas v Checkoutu, odstoupení, zamčený plán". Dokud tabulka
-- neexistuje, endpoint odstoupení hlásí „nedostupné" a tlačítko se v profilu
-- neukáže. Po nasazení `get_advisors` (security + performance).

-- 1. TABULKA ----------------------------------------------------------------

create table if not exists public.contract_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id text not null,
  invoice_id text not null,
  paid_czk integer not null check (paid_czk >= 0),
  refund_czk integer not null check (refund_czk >= 0 and refund_czk <= paid_czk),
  days_used integer not null check (days_used >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists contract_withdrawals_subscription_uidx
  on public.contract_withdrawals(subscription_id);

create index if not exists contract_withdrawals_user_idx
  on public.contract_withdrawals(user_id);

comment on table public.contract_withdrawals is
  'Odstoupení od smlouvy do 14 dnů od první platby: vrácená částka po odečtení poměrné části. Zapisuje jen API (service role).';

-- 2. RLS --------------------------------------------------------------------
--
-- Uživatel si smí přečíst jen vlastní záznam. Zápis, změna i mazání jen
-- přes service role (API) — žádná politika pro insert/update/delete.

alter table public.contract_withdrawals enable row level security;

drop policy if exists contract_withdrawals_select_own on public.contract_withdrawals;
create policy contract_withdrawals_select_own on public.contract_withdrawals
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.contract_withdrawals from anon;
revoke insert, update, delete on table public.contract_withdrawals from authenticated;
grant select on table public.contract_withdrawals to authenticated;
grant all on table public.contract_withdrawals to service_role;
