-- Kompletní smazání dat uživatele.
--
-- PROČ: původní delete_user_data mazala 11 tabulek. Uživatelských tabulek
-- s user_id je ale 28. Po „smazání" uživatele tak v databázi zůstávala
-- apple_health_metrics, product_events, withings_measurements, ai_logs,
-- lifecycle_emails a další — tedy zdravotní a chovová data člověka, který
-- si o výmaz řekl. To je porušení práva na výmaz, ne kosmetická vada.
--
-- Příčina byla systémová: seznam tabulek byl napsaný ručně, takže každá nová
-- tabulka s user_id ho tiše obešla. Nová verze si seznam bere z katalogu, což
-- znamená, že tabulky, které teprve vzniknou, budou pokryté automaticky.
--
-- Tabulky vázané jen na e-mail (registrations, waitlist, users) se řeší zvlášť,
-- protože v nich user_id není.

CREATE OR REPLACE FUNCTION public.delete_user_data(target_user_id uuid, target_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t record;
  n integer;
  vysledek jsonb := '{}'::jsonb;
BEGIN
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_user_data: chybi target_user_id';
  END IF;

  FOR t IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = 'public'
     AND tb.table_name = c.table_name
     AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'user_id'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', t.table_name) USING target_user_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      vysledek := vysledek || jsonb_build_object(t.table_name, n);
    END IF;
  END LOOP;

  -- profiles se klíčuje přes id, ne user_id
  DELETE FROM public.profiles WHERE id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN vysledek := vysledek || jsonb_build_object('profiles', n); END IF;

  -- Tabulky bez user_id, kde je člověk identifikovaný e-mailem.
  IF target_email IS NOT NULL AND btrim(target_email) <> '' THEN
    FOR t IN SELECT unnest(ARRAY['registrations', 'waitlist', 'users']) AS table_name LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE lower(email) = lower($1)', t.table_name)
          USING target_email;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
          vysledek := vysledek || jsonb_build_object(t.table_name, n);
        END IF;
      EXCEPTION WHEN undefined_table OR undefined_column THEN
        NULL;
      END;
    END LOOP;
  END IF;

  RETURN vysledek;
END;
$function$;

COMMENT ON FUNCTION public.delete_user_data(uuid, text) IS
  'Smaze vsechna data uzivatele. Seznam tabulek se bere z katalogu, takze nove tabulky s user_id jsou pokryte automaticky.';
