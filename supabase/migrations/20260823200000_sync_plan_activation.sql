-- `is_active` MA ZNAMENAT „PLATI DNES", NE „VYGENEROVAL SE NAPOSLED".
--
-- Kazdy generator planu delal totez: vypnul vsechny plany uzivatele a novy
-- vlozil s is_active = true (lib/taskExecutors.js:387, :1539,
-- lib/unifiedPlanPipeline.js:343). Kdyz se tedy 14. 8. vygeneroval plan
-- na 27. 8. - 2. 9., vypnul plan na 20. - 26. 8., ktery v tu chvili jeste
-- ani nezacal. Priznak tak znamenal „posledni vygenerovany".
--
-- Puvodni deactivate_expired_plans() umela jen vypinat po valid_until.
-- Plan, ktery zacne az za tyden, nevypnula a nikdy nic nezapnula, takze se
-- stav sam nesrovnal.
--
-- Merene na produkci 23. 8. 2026 (nedele): is_active=true mel plan
-- 27. 8. - 2. 9., zatimco plan na probihajici tyden mel false. Uzivateli se
-- proto v nedeli ukazoval trenink z tydne, ktery jeste nezacal.
--
-- Nova funkce srovnava priznak v OBOU smerech a je idempotentni -- da se
-- pustit kdykoli a kolikrat chce. Vyznam „plati dnes" se meni o pulnoci sam
-- od sebe, bez ohledu na to, jestli nekdo neco vygeneroval, takze
-- rozhodovat o tom musi opakovany beh, ne jednorazovy zapis pri vlozeni.
--
-- Vola se z api/cron/sweep-catalog-activation.js v 00:05 prazskeho casu.
create or replace function public.sync_plan_activation()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_zapnuto  integer;
  v_vypnuto  integer;
  v_aktivnich integer;
begin
  -- Plan, ktery ma dnes platit: pro kazdeho uzivatele ten s nejpozdejsim
  -- zacatkem mezi temi, ktere dnesek pokryvaji. Vic prekryvajicich se planu
  -- by nemelo vznikat, ale kdyz vzniknou, vyhrava novejsi.
  with ma_platit as (
    select distinct on (user_id) id, user_id
    from public.ai_generated_plans
    where valid_from is not null
      and valid_until is not null
      and current_date between valid_from and valid_until
    order by user_id, valid_from desc, created_at desc
  ),
  zapnute as (
    update public.ai_generated_plans p
    set is_active = true
    from ma_platit m
    where p.id = m.id and p.is_active is distinct from true
    returning p.id
  ),
  vypnute as (
    update public.ai_generated_plans p
    set is_active = false
    where p.is_active
      and p.id not in (select id from ma_platit)
    returning p.id
  )
  select
    (select count(*) from zapnute),
    (select count(*) from vypnute)
  into v_zapnuto, v_vypnuto;

  select count(*) into v_aktivnich from public.ai_generated_plans where is_active;

  return jsonb_build_object(
    'activated', v_zapnuto,
    'deactivated', v_vypnuto,
    'active_total', v_aktivnich,
    'synced_at', now()
  );
end;
$function$;

comment on function public.sync_plan_activation() is
  'Srovna is_active podle valid_from/valid_until: zapne plan pokryvajici dnesek, vypne ostatni. Idempotentni, urceno pro denni cron.';

-- Jednorazove srovnani stavu, ktery uz v databazi je.
select public.sync_plan_activation();
