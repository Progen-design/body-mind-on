-- ON CONFLICT pres PostgREST neumi matchnout index nad vyrazem coalesce().
-- Reseni: source je NOT NULL DEFAULT '' a unique index je nad cistymi sloupci.

-- metrics ---------------------------------------------------------------
drop index if exists public.apple_health_metrics_uidx;

update public.apple_health_metrics set source = '' where source is null;
alter table public.apple_health_metrics
  alter column source set default '',
  alter column source set not null;

create unique index apple_health_metrics_uidx
  on public.apple_health_metrics (user_id, metric_name, measured_at, source);

-- sleep -----------------------------------------------------------------
drop index if exists public.apple_health_sleep_uidx;

update public.apple_health_sleep set source = '' where source is null;
alter table public.apple_health_sleep
  alter column source set default '',
  alter column source set not null;

create unique index apple_health_sleep_uidx
  on public.apple_health_sleep (user_id, sleep_start, source);

-- workouts: external_id je uz NOT NULL, index nad cistymi sloupci -> OK
-- source ale sjednotime kvuli konzistenci
update public.apple_health_workouts set source = '' where source is null;
alter table public.apple_health_workouts
  alter column source set default '';
