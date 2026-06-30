-- =============================================================================
-- Migration: Withings OAuth + measurements
-- Project: Body & Mind ON
-- Date: 2026-06-30
-- Purpose: store encrypted Withings OAuth tokens and imported scale measurements
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.withings_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_to text not null default '/profil',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_withings_oauth_states_user_created
  on public.withings_oauth_states(user_id, created_at desc);

create index if not exists idx_withings_oauth_states_expiry
  on public.withings_oauth_states(expires_at)
  where consumed_at is null;

create table if not exists public.withings_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  withings_userid text,
  scope text,
  token_type text not null default 'Bearer',
  access_token_ciphertext jsonb not null,
  refresh_token_ciphertext jsonb not null,
  expires_at timestamptz not null,
  refresh_token_expires_at timestamptz,
  csrf_token text,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_error text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_withings_connections_user
  on public.withings_connections(user_id);

create table if not exists public.withings_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  withings_userid text,
  withings_measure_group_id text not null,
  measure_type integer not null,
  measure_type_label text not null,
  unit text,
  value numeric not null,
  measured_at timestamptz not null,
  category integer,
  attrib integer,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint withings_measurements_unique unique (user_id, withings_measure_group_id, measure_type)
);

create index if not exists idx_withings_measurements_user_measured
  on public.withings_measurements(user_id, measured_at desc);

create index if not exists idx_withings_measurements_user_type_measured
  on public.withings_measurements(user_id, measure_type, measured_at desc);

alter table public.withings_oauth_states enable row level security;
alter table public.withings_connections enable row level security;
alter table public.withings_measurements enable row level security;

revoke all on public.withings_oauth_states from anon, authenticated;
revoke all on public.withings_connections from anon, authenticated;
revoke all on public.withings_measurements from anon, authenticated;

grant all on public.withings_oauth_states to service_role;
grant all on public.withings_connections to service_role;
grant all on public.withings_measurements to service_role;

-- Čtení přes PostgREST klienta zatím nepovolujeme. Přístup jde přes serverové API routes,
-- aby tokeny nikdy nešly do frontendu a aby bylo možné validovat sync logiku centrálně.

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'withings_measurements' and policyname = 'withings_measurements_service_role_all'
  ) then
    drop policy withings_measurements_service_role_all on public.withings_measurements;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'withings_connections' and policyname = 'withings_connections_service_role_all'
  ) then
    drop policy withings_connections_service_role_all on public.withings_connections;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'withings_oauth_states' and policyname = 'withings_oauth_states_service_role_all'
  ) then
    drop policy withings_oauth_states_service_role_all on public.withings_oauth_states;
  end if;
end $$;

create policy withings_measurements_service_role_all
  on public.withings_measurements
  for all
  to service_role
  using (true)
  with check (true);

create policy withings_connections_service_role_all
  on public.withings_connections
  for all
  to service_role
  using (true)
  with check (true);

create policy withings_oauth_states_service_role_all
  on public.withings_oauth_states
  for all
  to service_role
  using (true)
  with check (true);
