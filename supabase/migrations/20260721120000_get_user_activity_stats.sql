-- Activity stats for profile Přehled / Progres (Apple Watch + completions + Withings).
CREATE OR REPLACE FUNCTION public.get_user_activity_stats(p_user_id uuid, p_days integer DEFAULT 7)
 RETURNS TABLE(
   obdobi_dnu integer,
   kroky numeric,
   pohyb_min numeric,
   aktivni_kcal numeric,
   treninky bigint,
   treninky_watch bigint,
   treninky_plan bigint,
   aktivni_dny bigint,
   jidla_odskrtnuta bigint,
   navyky_splnene bigint,
   checkiny bigint,
   vaha_start numeric,
   vaha_konec numeric,
   vaha_zmena numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with
ah as (
  select
    coalesce(sum(steps),0)        as kroky,
    coalesce(sum(exercise_min),0) as pohyb_min,
    coalesce(sum(active_kcal),0)  as aktivni_kcal,
    coalesce(sum(workout_count),0) as treninky_watch,
    count(*) filter (where coalesce(exercise_min,0) > 10
                        or coalesce(workout_count,0) > 0
                        or coalesce(steps,0) > 6000)  as aktivni_dny_watch
  from public.apple_health_daily
  where user_id = p_user_id and local_date >= current_date - p_days
),
wo as (
  select count(*) as treninky_plan
  from public.daily_activity_completions
  where user_id = p_user_id and activity_type = 'workout'
    and completed_at >= now() - make_interval(days => p_days)
),
meals as (
  select count(*) as jidla
  from public.daily_activity_completions
  where user_id = p_user_id and activity_type = 'meal'
    and completed_at >= now() - make_interval(days => p_days)
),
hab as (
  select count(*) as navyky
  from public.habit_logs
  where user_id = p_user_id and created_at >= now() - make_interval(days => p_days)
),
ci as (
  select count(*) as checkiny
  from public.daily_checkins
  where user_id = p_user_id and checkin_date >= current_date - p_days
),
w as (
  select
    (array_agg(weight_kg order by local_date asc))[1]  as vaha_start,
    (array_agg(weight_kg order by local_date desc))[1] as vaha_konec
  from public.withings_daily
  where user_id = p_user_id and local_date >= current_date - p_days and weight_kg is not null
)
select
  p_days,
  ah.kroky, ah.pohyb_min, ah.aktivni_kcal,
  (ah.treninky_watch + wo.treninky_plan)::bigint as treninky,
  ah.treninky_watch::bigint, wo.treninky_plan,
  ah.aktivni_dny_watch,
  meals.jidla, hab.navyky, ci.checkiny,
  w.vaha_start, w.vaha_konec,
  round((w.vaha_konec - w.vaha_start)::numeric, 1) as vaha_zmena
from ah, wo, meals, hab, ci, w;
$function$;

GRANT EXECUTE ON FUNCTION public.get_user_activity_stats(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_activity_stats(uuid, integer) TO service_role;
