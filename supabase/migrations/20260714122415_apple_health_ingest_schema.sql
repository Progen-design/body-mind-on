-- =========================================================
-- Apple Health / Apple Watch ingest (Health Auto Export)
-- Modul je zamerne oddeleny od app tabulek (workouts, body_measurements),
-- aby slo kdykoliv promitnout/mergovat pres view, ne prepsat zdrojova data.
-- =========================================================

-- 1) PRIPOJENI ZARIZENI ------------------------------------------------
create table if not exists public.apple_health_connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  device_label      text not null default 'iPhone',
  -- API klic se NIKDY neuklada v plaintextu; jen SHA-256 hex
  api_key_hash      text not null,
  api_key_prefix    text not null,            -- prvnich 8 znaku pro identifikaci v UI
  status            text not null default 'active'
                      check (status in ('active','revoked')),
  connected_at      timestamptz not null default now(),
  last_sync_at      timestamptz,
  last_sync_error   text,
  sync_count        bigint not null default 0,
  revoked_at        timestamptz,
  updated_at        timestamptz not null default now()
);

create unique index if not exists apple_health_connections_key_hash_uidx
  on public.apple_health_connections (api_key_hash);
create index if not exists apple_health_connections_user_idx
  on public.apple_health_connections (user_id) where status = 'active';

-- 2) RAW PAYLOADY (audit + replay) -------------------------------------
create table if not exists public.apple_health_raw_payloads (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  connection_id  uuid,
  received_at    timestamptz not null default now(),
  byte_size      integer,
  payload        jsonb not null,
  processed_at   timestamptz,
  process_error  text,
  metrics_count  integer not null default 0,
  workouts_count integer not null default 0
);

create index if not exists apple_health_raw_user_received_idx
  on public.apple_health_raw_payloads (user_id, received_at desc);
create index if not exists apple_health_raw_unprocessed_idx
  on public.apple_health_raw_payloads (received_at) where processed_at is null;

-- 3) METRIKY (long format - HAE posila 150+ ruznych nazvu) -------------
create table if not exists public.apple_health_metrics (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  metric_name   text not null,               -- step_count, heart_rate_variability, resting_heart_rate...
  unit          text,
  measured_at   timestamptz not null,        -- presny okamzik z HAE
  local_date    date not null,               -- den v Europe/Prague pro denni agregace
  qty           numeric,                     -- hlavni hodnota (qty nebo Avg)
  min_value     numeric,
  max_value     numeric,
  avg_value     numeric,
  source        text,                        -- "Apple Watch", "iPhone", "Withings"...
  raw           jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Idempotence: stejna metrika + stejny cas + stejny zdroj = jeden radek.
-- coalesce(source,'') protoze NULL v unique indexu nekoliduje.
create unique index if not exists apple_health_metrics_uidx
  on public.apple_health_metrics (user_id, metric_name, measured_at, (coalesce(source, '')));
create index if not exists apple_health_metrics_lookup_idx
  on public.apple_health_metrics (user_id, metric_name, local_date desc);
create index if not exists apple_health_metrics_date_idx
  on public.apple_health_metrics (user_id, local_date desc);

-- 4) SPANEK (vlastni tabulka - jina struktura nez bodove metriky) ------
create table if not exists public.apple_health_sleep (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  sleep_start     timestamptz not null,
  sleep_end       timestamptz,
  local_date      date not null,             -- den PROBUZENI (tak to lidi vnimaji)
  in_bed_min      numeric,
  asleep_min      numeric,
  core_min        numeric,
  deep_min        numeric,
  rem_min         numeric,
  awake_min       numeric,
  efficiency_pct  numeric,                   -- asleep / in_bed * 100
  source          text,
  raw             jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists apple_health_sleep_uidx
  on public.apple_health_sleep (user_id, sleep_start, (coalesce(source, '')));
create index if not exists apple_health_sleep_date_idx
  on public.apple_health_sleep (user_id, local_date desc);

-- 5) TRENINKY z Apple Watch (oddelene od public.workouts = plan appky) --
create table if not exists public.apple_health_workouts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  external_id      text not null,            -- HAE workout id -> idempotence
  workout_type     text,                     -- "Traditional Strength Training", "Running"...
  started_at       timestamptz not null,
  ended_at         timestamptz,
  local_date       date not null,
  duration_s       numeric,
  active_kcal      numeric,
  total_kcal       numeric,
  distance_m       numeric,
  avg_hr           numeric,
  max_hr           numeric,
  elevation_m      numeric,
  source           text,
  raw              jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists apple_health_workouts_uidx
  on public.apple_health_workouts (user_id, external_id);
create index if not exists apple_health_workouts_date_idx
  on public.apple_health_workouts (user_id, local_date desc);

-- 6) updated_at trigger -------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ahc_touch on public.apple_health_connections;
create trigger trg_ahc_touch before update on public.apple_health_connections
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_ahm_touch on public.apple_health_metrics;
create trigger trg_ahm_touch before update on public.apple_health_metrics
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_ahs_touch on public.apple_health_sleep;
create trigger trg_ahs_touch before update on public.apple_health_sleep
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_ahw_touch on public.apple_health_workouts;
create trigger trg_ahw_touch before update on public.apple_health_workouts
  for each row execute function public.touch_updated_at();

-- 7) RLS ----------------------------------------------------------------
alter table public.apple_health_connections   enable row level security;
alter table public.apple_health_raw_payloads  enable row level security;
alter table public.apple_health_metrics       enable row level security;
alter table public.apple_health_sleep         enable row level security;
alter table public.apple_health_workouts      enable row level security;

-- Uzivatel vidi jen svoje data, cist muze, zapisovat NE (zapisuje service_role).
drop policy if exists ahc_select_own on public.apple_health_connections;
create policy ahc_select_own on public.apple_health_connections
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists ahm_select_own on public.apple_health_metrics;
create policy ahm_select_own on public.apple_health_metrics
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists ahs_select_own on public.apple_health_sleep;
create policy ahs_select_own on public.apple_health_sleep
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists ahw_select_own on public.apple_health_workouts;
create policy ahw_select_own on public.apple_health_workouts
  for select to authenticated using ((select auth.uid()) = user_id);

-- raw_payloads: zadna policy pro authenticated => pristup jen service_role.
-- (RLS je zapnute, takze bez policy nikdo z klienta nic neuvidi.)

comment on table public.apple_health_connections  is 'Apple Health (Health Auto Export) pripojeni. API klic ulozen jen jako SHA-256 hash.';
comment on table public.apple_health_raw_payloads is 'Syrove payloady z Health Auto Export. Audit + moznost replay pri zmene parseru.';
comment on table public.apple_health_metrics      is 'Bodove metriky z Apple Health (long format). Idempotentni upsert.';
comment on table public.apple_health_sleep        is 'Spankove relace z Apple Watch. local_date = den probuzeni.';
comment on table public.apple_health_workouts     is 'Treninky z Apple Watch. Oddelene od public.workouts (planovane treninky v appce).';
