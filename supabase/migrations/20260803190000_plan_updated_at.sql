-- ai_generated_plans.updated_at — aby se dalo poznat, ze plan opravdu vznikl znovu.
--
-- PROBLEM, ktery to resi: pregenerovani plan NEVKLADA novy radek, prepisuje
-- stavajici na miste. created_at se pritom nehne. Tabulka zadny jiny casovy
-- sloupec nemela, takze po kliknuti na "Vygenerovat plan" nesla cerstvost
-- nijak overit — a /api/retry-initial-plan pritom vraci plan_created: true.
--
-- Dusledek v praxi: clovek klikne, dostane hlasku o uspechu, podiva se do DB,
-- vidi created_at osm hodin stary a usoudi, ze se nic nestalo. Obsah planu se
-- pritom zmenil. Stalo to tri kola "oprav" neceho, co nebylo rozbite.
--
-- Trigger je zamerne na urovni DB, ne v aplikaci: plan prepisuje vic cest
-- (initial_plan, weekly_plan_update, plan-replace-meal, admin regenerate)
-- a kazda by si musela pamatovat, ze ma sloupec nastavit.

ALTER TABLE public.ai_generated_plans
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.ai_generated_plans.updated_at IS
  'Kdy byl radek naposledy zapsan. created_at drzi vznik, updated_at pregenerovani — plan se prepisuje na miste, takze bez tohohle sloupce nejde cerstvost overit.';

-- Backfill JESTE PRED vytvorenim triggeru, jinak by ho trigger prepsal zpatky
-- na aktualni cas a sloupec by o existujicich radcich lhal smerem nahoru.
UPDATE public.ai_generated_plans SET updated_at = created_at WHERE updated_at > created_at;

-- clock_timestamp(), ne now(): now() je v ramci transakce konstantni, takze
-- dva zapisy do tehoz radku v jedne transakci dostanou shodny cas a slo by
-- z toho usoudit, ze se druhy nestal. Tady jde prave o "kdy naposledy".
CREATE OR REPLACE FUNCTION public.touch_ai_generated_plans_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ai_generated_plans_touch_updated_at ON public.ai_generated_plans;
CREATE TRIGGER ai_generated_plans_touch_updated_at
  BEFORE UPDATE ON public.ai_generated_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_ai_generated_plans_updated_at();

-- ---------------------------------------------------------------------------
-- Kontrola: trigger musi opravdu strelit pri UPDATE.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id    uuid;
  v_pred  timestamptz;
  v_po    timestamptz;
BEGIN
  SELECT id, updated_at INTO v_id, v_pred
  FROM public.ai_generated_plans ORDER BY created_at DESC LIMIT 1;

  IF v_id IS NULL THEN
    RAISE NOTICE 'Zadny plan, kontrola preskocena.';
    RETURN;
  END IF;

  -- Zapis, ktery nic vecneho nemeni; trigger presto musi updated_at posunout.
  UPDATE public.ai_generated_plans SET is_active = is_active WHERE id = v_id;
  SELECT updated_at INTO v_po FROM public.ai_generated_plans WHERE id = v_id;

  IF v_po <= v_pred THEN
    RAISE EXCEPTION 'Trigger updated_at nestrelil: pred %, po %.', v_pred, v_po;
  END IF;
  RAISE NOTICE 'Trigger updated_at overen na planu % (% -> %).', v_id, v_pred, v_po;
END $$;
