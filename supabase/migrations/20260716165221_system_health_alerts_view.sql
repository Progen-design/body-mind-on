-- =============================================================================
-- SYSTEM HEALTH ALERTS
-- Detekce problemu, o kterych se dnes majitel dozvi az kdyz mu nekdo napise.
-- Cron jen precte tento view a posle e-mail. Zadna logika v kodu.
-- severity: critical = uzivatel je blokovany | warning = neco nesedi | info
-- =============================================================================

create or replace view public.system_health_alerts
with (security_invoker = true)
as
-- 1) CRITICAL: uzivatel s aktivnim clenstvim BEZ planu
select 'critical'::text as severity,
       'uzivatel_bez_planu'::text as kod,
       'Uzivatel s aktivnim clenstvim nema plan'::text as popis,
       string_agg(u.email, ', ')::text as detail,
       count(*)::bigint as pocet
from auth.users u
join public.memberships m on m.user_id = u.id
where m.status in ('active','trial')
  and not exists (select 1 from public.ai_generated_plans p
                   where p.user_id = u.id and p.is_active)
having count(*) > 0

union all
-- 2) CRITICAL: generovani planu selhalo za 24 h
select 'critical', 'generovani_selhalo',
       'Generovani planu selhalo za poslednich 24 h',
       count(*)::text || 'x za 24 h', count(*)
from public.product_events
where event_name = 'plan_generation_failed'
  and created_at > now() - interval '24 hours'
having count(*) > 0

union all
-- 3) CRITICAL: uvizl na paywallu (mel dostat trial)
select 'critical', 'uvizl_na_paywallu',
       'Clenstvi ve stavu pending_payment - mel dostat trial',
       string_agg(u.email, ', '), count(*)
from public.memberships m join auth.users u on u.id = m.user_id
where m.status = 'pending_payment'
having count(*) > 0

union all
-- 4) WARNING: necela kusova surovina (3,45 vejce)
select 'warning', 'necela_kusova_surovina',
       'V aktivnim planu je necely pocet kusovych surovin',
       'napr. 3,45 vejce', count(*)
from public.ai_generated_plans p,
     lateral jsonb_array_elements(p.structured_plan_json->'days') d,
     lateral jsonb_array_elements(d->'meals') m,
     lateral jsonb_array_elements(m->'recipe'->'ingredients') i
where p.is_active
  and (i->>'unit') in ('ks','plátky','plátek','konzerva','stroužek')
  and (i->>'amount')::numeric <> round((i->>'amount')::numeric * 2) / 2
having count(*) > 0

union all
-- 5) WARNING: Apple Health nesynchronizuje
select 'warning', 'apple_health_nesynchronizuje',
       'Apple Health nesynchronizoval vic nez 48 h',
       string_agg(u.email, ', '), count(*)
from public.apple_health_connections c
join auth.users u on u.id = c.user_id
where c.status = 'active'
  and (c.last_sync_at is null or c.last_sync_at < now() - interval '48 hours')
having count(*) > 0

union all
-- 6) WARNING: Apple Health hlasi chybu
select 'warning', 'apple_health_chyba',
       'Apple Health hlasi chybu pri syncu',
       string_agg(c.last_sync_error, ' | '), count(*)
from public.apple_health_connections c
where c.status='active' and c.last_sync_error is not null
having count(*) > 0

union all
-- 7) WARNING: recept s nesmyslnou vyzivou (20 % = i po zapocteni vlakniny je to spatne)
select 'warning', 'recept_mimo_gate',
       'Recept ma kcal mimo toleranci vuci makrum',
       string_agg(name_cs, ', '), count(*)
from public.recipes_catalog
where active
  and abs(kcal - (protein_g*4 + carbs_g*4 + fat_g*9)) / nullif(kcal,0) > 0.20
having count(*) > 0

union all
-- 8) INFO: surovina, kterou neumime spocitat
select 'info', 'neznama_surovina',
       'Surovina chybi v ingredients_nutrition nebo unit_conversions',
       '', count(*)
from (
  select distinct unnest(c.ingredients_unmatched) as s
  from public.recipes_catalog r, lateral public.compute_recipe_nutrition(r.id) c
  where r.active and r.source in ('meal_cache','simple_start') and not c.complete
) x
having count(*) > 0;

comment on view public.system_health_alerts is
  'Detekce problemu pro denni alert. Cron precte a posle e-mail majiteli.';;
