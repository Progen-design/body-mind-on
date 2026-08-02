-- Denní deaktivace propadlých plánů.
--
-- Dosud se `is_active = false` nastavovalo VÝHRADNĚ při vložení nového plánu
-- (taskExecutors.js:385, 1307, 1425, unifiedPlanPipeline.js:311). Expiraci
-- nehlídal nikdo, takže plán zůstal aktivní libovolně dlouho po `valid_until`.
-- Důsledek: k 2. 8. 2026 bylo 10 aktivních plánů a všech 10 propadlých (6–7 dnů
-- po konci platnosti). Uživatel v profilu dál viděl minulotýdenní jídelníček
-- jako aktuální, protože plan_state čte `is_active`, ne datum.
--
-- Funkce JEN deaktivuje. Aktivaci ani generování nedělá — nový plán je práce
-- producenta týdenních úloh, který zatím neexistuje (generateAITasks je FROZEN).

CREATE OR REPLACE FUNCTION public.deactivate_expired_plans()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deaktivovano integer;
  v_aktivnich    integer;
BEGIN
  -- `valid_until < current_date` — plán platí VČETNĚ posledního dne. Plán do
  -- neděle se v neděli ještě nesundá, spadne až v pondělí.
  WITH zmeneno AS (
    UPDATE public.ai_generated_plans p
    SET is_active = false
    WHERE p.is_active
      AND p.valid_until IS NOT NULL
      AND p.valid_until < current_date
    RETURNING p.id
  )
  SELECT count(*) INTO v_deaktivovano FROM zmeneno;

  SELECT count(*) INTO v_aktivnich FROM public.ai_generated_plans WHERE is_active;

  RETURN jsonb_build_object(
    'deactivated', v_deaktivovano,
    'active_total', v_aktivnich,
    'swept_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.deactivate_expired_plans() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.deactivate_expired_plans() IS
  'Denni deaktivace planu po valid_until. Jen deaktivuje, nikdy negeneruje ani neaktivuje. Plan plati vcetne posledniho dne platnosti.';

-- ---------------------------------------------------------------------------
-- Uvodni beh hned pri nasazeni. Ocekavano: 10 deaktivovanych, 0 aktivnich.
--
-- 0 aktivnich neni chyba — vsech 10 planu v DB je propadlych a novy nikdo
-- negeneruje. Az bude producent tydennich uloh, cislo bude nenulove.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_vysledek jsonb;
BEGIN
  v_vysledek := public.deactivate_expired_plans();
  RAISE NOTICE 'Uvodni deaktivace: %', v_vysledek;

  IF (v_vysledek->>'deactivated')::integer <> 10 THEN
    RAISE EXCEPTION 'Deaktivovanych planu je %, cekali jsme 10.', v_vysledek->>'deactivated';
  END IF;
END $$;
