-- STRIPE = ZDROJ PRAVDY, DB = ZRCADLO (lib/stripeSync.js → syncSubscription).
--
-- public.subscriptions dosud prázdná (0 řádků k 25. 9. 2026). Sync ji plní
-- z každé Stripe subscription; UI čte cenu a data plateb odsud, ne z konstant.
--
-- NEAPLIKOVÁNO. Vytvořeno 25. 9. 2026 v PR „Stripe sync". Po nasazení:
--   1) get_advisors (security + performance),
--   2) první běh rekonciliace ručně = backfill (POST /api/cron/stripe-reconcile
--      s ADMIN_TOKEN).

-- 1. SUBSCRIPTIONS — nové sloupce ------------------------------------------

alter table public.subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists trial_end timestamptz,
  add column if not exists cancel_at timestamptz,
  add column if not exists voucher_code text;

-- Časy ze Stripe jsou UTC okamžiky → timestamptz. Tabulka je prázdná, převod
-- nic neposune; kdyby nebyla, starší hodnoty se berou jako UTC.
alter table public.subscriptions
  alter column current_period_start type timestamptz using current_period_start at time zone 'UTC',
  alter column current_period_end type timestamptz using current_period_end at time zone 'UTC',
  alter column created_at type timestamptz using created_at at time zone 'UTC',
  alter column updated_at type timestamptz using updated_at at time zone 'UTC';

-- 'incomplete_expired' má 18 znaků, 'UNKNOWN' 7 — stávající délky stačí,
-- ale varchar(20) u status/plan_name je zbytečná past pro budoucí stavy.
alter table public.subscriptions
  alter column status type text,
  alter column plan_name type text,
  alter column billing_cycle type text;

-- FK user_id mířil na legacy public.users — ta je prázdná (0 řádků proti
-- 5 v auth.users k 25. 9. 2026), takže by každý zápis syncu spadl. Uživatel
-- = auth.users, stejně jako u memberships.
alter table public.subscriptions drop constraint if exists subscriptions_user_id_fkey;
alter table public.subscriptions
  add constraint subscriptions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- Upsert podle stripe_subscription_id potřebuje unikátní index. Původní
-- neunikátní idx_subscriptions_stripe (nikdy nepoužitý, advisor unused_index)
-- nahrazuje.
create unique index if not exists subscriptions_stripe_subscription_id_uidx
  on public.subscriptions(stripe_subscription_id);
drop index if exists public.idx_subscriptions_stripe;

-- 2. SUBSCRIPTIONS — RLS: uživatel jen ČTE své ------------------------------
--
-- Dosud „Subscriptions policy" FOR ALL pro roli public + GRANT ALL pro
-- anon/authenticated: přihlášený uživatel si mohl vložit nebo přepsat vlastní
-- řádek (cenu, stav, trial_end) — a UI z tabulky nově čte. Zapisuje jen server
-- (service role) přes syncSubscription.

drop policy if exists "Subscriptions policy" on public.subscriptions;
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.subscriptions from anon;
revoke insert, update, delete, truncate, references, trigger on table public.subscriptions from authenticated;
grant select on table public.subscriptions to authenticated;
grant all on table public.subscriptions to service_role;

-- 3. VOUCHERS — indexy pro sync a rekonciliaci -----------------------------
-- (redeemed_by = FK bez indexu, advisor unindexed_foreign_keys)

create index if not exists vouchers_redeemed_by_idx on public.vouchers(redeemed_by);
create index if not exists vouchers_stripe_subscription_id_idx on public.vouchers(stripe_subscription_id);

-- 4. STRIPE_RECONCILE_LOG --------------------------------------------------
--
-- Každý běh rekonciliace (/api/cron/stripe-reconcile) zapíše, co sync změnil
-- (typ 'zmena') a co nesedí (typ 'alert'). Druhý běh bez změn nezapíše nic
-- typu 'zmena'.

create table if not exists public.stripe_reconcile_log (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  created_at timestamptz not null default now(),
  stripe_subscription_id text,
  user_id uuid references auth.users(id) on delete set null,
  typ text not null check (typ in ('zmena', 'alert', 'souhrn')),
  kod text not null,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists stripe_reconcile_log_run_idx on public.stripe_reconcile_log(run_id);
create index if not exists stripe_reconcile_log_user_idx on public.stripe_reconcile_log(user_id);
create index if not exists stripe_reconcile_log_created_idx on public.stripe_reconcile_log(created_at desc);

comment on table public.stripe_reconcile_log is
  'Denní rekonciliace Stripe ↔ DB: změny, které sync provedl, a nesrovnalosti (alerty). Zapisuje jen server.';

alter table public.stripe_reconcile_log enable row level security;

-- Jen server (service role obchází RLS). Explicitní „nikdo" politika, ať je
-- záměr vidět a advisor nehlásí rls_enabled_no_policy.
drop policy if exists stripe_reconcile_log_bez_pristupu on public.stripe_reconcile_log;
create policy stripe_reconcile_log_bez_pristupu on public.stripe_reconcile_log
  for select to authenticated
  using (false);

revoke all on table public.stripe_reconcile_log from anon, authenticated;
grant all on table public.stripe_reconcile_log to service_role;
