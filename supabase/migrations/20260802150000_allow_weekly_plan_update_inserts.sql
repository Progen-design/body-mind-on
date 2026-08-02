-- Uvolnění safe mode pro weekly_plan_update.
--
-- Po červnovém incidentu se zámek nasadil na ČTYŘI místa a v kódu se mluvilo jen
-- o dvou:
--   1. generateAITasks() — hard return (odstraněno, nahrazeno weeklyPlanProducer)
--   2. decision engine — missing_plan neprodukuje po expiraci (20260802, brzda)
--   3. UNIQUE/CHECK idempotence (20260802140000)
--   4. trigger block_ai_task_inserts() — TENHLE. Pouští výhradně initial_plan a
--      onboarding_message, všechno ostatní shodí výjimkou. Producent by tedy
--      neuložil ani jednu úlohu a spadl by až za běhu.
--
-- Zámek se uvolňuje ÚZCE: přibývá jediný typ a jen s podmínkou, že nese
-- idempotenční klíč. Ostatní typy (motivation_message, adjust_plan, …) zůstávají
-- blokované — ty vlastní zábranu proti smyčce nemají a decision engine je zatím
-- nikdy nevytvořil, takže se tím nic nemění.
--
-- Proč je to bezpečné: důvod zámku byla neomezená smyčka, ne typ úlohy. Ta je
-- teď zavřená v databázi (UNIQUE(idempotency_key), UNIQUE(user_id, target_from),
-- CHECK na povinný klíč). Duplicita neprojde ani při souběhu dvou cronů. Podmínka
-- na klíč je tady navíc schválně — kdyby někdo CHECK příště zrušil, drží zámek dál.

CREATE OR REPLACE FUNCTION public.block_ai_task_inserts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  -- Registrační cesta: beze změny.
  IF NEW.task_type IN ('initial_plan', 'onboarding_message') THEN
    RETURN NEW;
  END IF;

  -- Týdenní plán: povolen jen s idempotenčním klíčem. Bez něj by se dala obejít
  -- UNIQUE zábrana (partial index na NULL neplatí) a byli bychom zpátky u smyčky.
  IF NEW.task_type = 'weekly_plan_update' THEN
    IF NEW.idempotency_key IS NULL THEN
      RAISE EXCEPTION 'weekly_plan_update bez idempotency_key je zakazan (uzivatel %).', NEW.user_id;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Task type "%" is BLOCKED in current safe mode (no auto-loops). User: %. Allowed: initial_plan, onboarding_message, weekly_plan_update (s idempotency_key).',
    NEW.task_type, NEW.user_id;
END;
$function$;

COMMENT ON FUNCTION public.block_ai_task_inserts() IS
  'Safe mode po incidentu 2. 6. 2026. Pousti initial_plan, onboarding_message a weekly_plan_update s idempotency_key. Ostatni typy blokuje.';
