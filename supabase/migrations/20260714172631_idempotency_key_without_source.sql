-- =============================================================================
-- OPRAVA IDEMPOTENCE
-- Health Auto Export sklada `source` pokazde jinak ("Watch|iphone|Sports Tracker"
-- vs "Watch|iphone"), takze source NESMI byt v unikatnim klici - stejne mereni
-- by se ulozilo vickrat a denni soucty by byly nadhodnocene.
--
-- HAE ma zapnute "Shrnout udaje" => na jeden casovy usek pripada jedna hodnota.
-- Klic tedy: (user_id, metric_name, measured_at). Source = informativni atribut.
-- =============================================================================

drop index if exists public.apple_health_metrics_uidx;

create unique index apple_health_metrics_uidx
  on public.apple_health_metrics (user_id, metric_name, measured_at);

-- Spanek: stejny problem
drop index if exists public.apple_health_sleep_uidx;

create unique index apple_health_sleep_uidx
  on public.apple_health_sleep (user_id, sleep_start);

comment on index public.apple_health_metrics_uidx is
  'Idempotence bez source - HAE generuje nestabilni nazvy zdroju. Re-export stejneho obdobi neduplikuje.';
