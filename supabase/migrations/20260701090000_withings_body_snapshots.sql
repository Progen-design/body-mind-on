-- =============================================================================
-- Migration: Withings body snapshots (normalized measurements)
-- Project: Body & Mind ON
-- Date: 2026-07-01
-- Purpose: denormalized body composition snapshots for trends/recommendations
-- =============================================================================

create table if not exists public.withings_body_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.withings_connections(id) on delete set null,
  withings_measure_group_id text,
  measured_at timestamptz not null,
  weight_kg numeric,
  fat_percent numeric,
  fat_mass_kg numeric,
  muscle_mass_kg numeric,
  bone_mass_kg numeric,
  hydration_kg numeric,
  hydration_percent numeric,
  bmi numeric,
  basal_metabolic_rate numeric,
  visceral_fat numeric,
  pulse numeric,
  source text not null default 'withings',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint withings_body_snapshots_unique unique (user_id, measured_at, source)
);

create index if not exists idx_withings_body_snapshots_user_measured
  on public.withings_body_snapshots(user_id, measured_at desc);

alter table public.withings_body_snapshots enable row level security;

revoke all on public.withings_body_snapshots from anon, authenticated;
grant select on public.withings_body_snapshots to authenticated;
grant all on public.withings_body_snapshots to service_role;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'withings_body_snapshots'
      and policyname = 'withings_body_snapshots_select_own'
  ) then
    drop policy withings_body_snapshots_select_own on public.withings_body_snapshots;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'withings_body_snapshots'
      and policyname = 'withings_body_snapshots_service_role_all'
  ) then
    drop policy withings_body_snapshots_service_role_all on public.withings_body_snapshots;
  end if;
end $$;

create policy withings_body_snapshots_select_own
  on public.withings_body_snapshots
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy withings_body_snapshots_service_role_all
  on public.withings_body_snapshots
  for all
  to service_role
  using (true)
  with check (true);

-- Backfill snapshots from existing EAV rows (best effort, grouped by measure session)
insert into public.withings_body_snapshots (
  user_id,
  connection_id,
  withings_measure_group_id,
  measured_at,
  weight_kg,
  fat_percent,
  fat_mass_kg,
  muscle_mass_kg,
  bone_mass_kg,
  hydration_kg,
  source,
  raw_payload,
  updated_at
)
select
  wm.user_id,
  wc.id as connection_id,
  wm.withings_measure_group_id,
  wm.measured_at,
  max(case when wm.measure_type_label = 'weight_kg' then wm.value end) as weight_kg,
  max(case when wm.measure_type_label = 'fat_ratio_percent' then wm.value end) as fat_percent,
  max(case when wm.measure_type_label = 'fat_mass_kg' then wm.value end) as fat_mass_kg,
  max(case when wm.measure_type_label = 'muscle_mass_kg' then wm.value end) as muscle_mass_kg,
  max(case when wm.measure_type_label = 'bone_mass_kg' then wm.value end) as bone_mass_kg,
  max(case when wm.measure_type_label = 'hydration_kg' then wm.value end) as hydration_kg,
  'withings' as source,
  jsonb_build_object('backfill', true, 'grpid', wm.withings_measure_group_id) as raw_payload,
  now() as updated_at
from public.withings_measurements wm
left join public.withings_connections wc on wc.user_id = wm.user_id
group by wm.user_id, wc.id, wm.withings_measure_group_id, wm.measured_at
on conflict (user_id, measured_at, source) do nothing;
