-- Already applied on production (remote-only history). Kept for migration sync.
-- START registration → 7-day trial via BEFORE INSERT trigger on memberships.

CREATE OR REPLACE FUNCTION public.grant_start_trial_on_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.tier = 'START'
     and new.status = 'pending_payment'
     and new.stripe_subscription_id is null
     and new.trial_ends_at is null
  then
    new.status        := 'trial';
    new.trial_ends_at := now() + interval '7 days';
    new.notes := coalesce(nullif(new.notes, '') || ' | ', '')
                 || 'Automaticky 7denni trial pri registraci';
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_start_trial_on_signup ON public.memberships;
CREATE TRIGGER trg_start_trial_on_signup
  BEFORE INSERT ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_start_trial_on_signup();
