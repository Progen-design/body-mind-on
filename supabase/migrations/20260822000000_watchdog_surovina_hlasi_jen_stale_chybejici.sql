-- Watchdog: `nenormalizovana_surovina` hlasi jen to, co chybi TED.
--
-- PROC. Vetev cte log `ingredient_normalization_misses` za poslednich 7 dni.
-- Log je zaznam o tom, co normalizace kdysi neumela — ne o tom, co neumi.
-- Kdyz se alias doplni, zaznam v logu zustane a vetev hlasi surovinu dal,
-- jeste cely tyden.
--
-- Zmereno 21. 8. 2026: vetev hlasila 30 surovin, z toho 6 (egg whites,
-- chili powder, scallions, old fashioned oats, salt, agavovy sirup) uz
-- ve slovniku bylo. Zbylych 24 se doplnilo migraci 20260821230000 —
-- a vetev by je pres to vsechno hlasila do 28. 8.
--
-- Hlidka, ktera tyden po oprave porad krici, ucí cloveka ji ignorovat.
--
-- OPRAVA: k logu se pripoji kontrola aktualniho stavu slovniku. Surovina se
-- nahlasi, jen kdyz pro ni alias porad neexistuje.
--
-- POMOCNA FUNKCE. Porovnani musi sedet na `alias_normalized` (male pismo,
-- bez diakritiky). Prevod je zapsany jednou, aby se nerozesel mezi vetvi
-- a pripadnymi dalsimi misty.

CREATE OR REPLACE FUNCTION public.normalizuj_nazev_suroviny(nazev text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT lower(btrim(translate(
    nazev,
    'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ',
    'acdeeinorstuuyzACDEEINORSTUUYZ'
  )));
$fn$;

COMMENT ON FUNCTION public.normalizuj_nazev_suroviny(text) IS
  'Prevod nazvu suroviny na tvar, ve kterem se porovnava s ingredient_aliases.alias_normalized (male pismo, bez diakritiky).';

DO $$
DECLARE
  puvodni text;
  nova    text;
  stara   text;
  novy    text;
BEGIN
  IF to_regclass('public.system_health_alerts') IS NULL THEN
    RAISE EXCEPTION 'system_health_alerts neexistuje — migrace by tise neudelala nic';
  END IF;

  puvodni := pg_get_viewdef('public.system_health_alerts'::regclass, true);

  IF puvodni LIKE '%normalizuj_nazev_suroviny%' THEN
    RAISE NOTICE 'oprava uz je zavedena, preskakuji';
    RETURN;
  END IF;

  stara := 'WHERE m.seen_at > (now() - ''7 days''::interval)';
  novy  := 'WHERE m.seen_at > (now() - ''7 days''::interval)'
        || ' AND NOT (EXISTS ( SELECT 1 FROM ingredient_aliases a'
        || ' WHERE lower(btrim(a.alias_normalized)) = public.normalizuj_nazev_suroviny(m.raw_name)))';

  IF position(stara in puvodni) = 0 THEN
    RAISE EXCEPTION 'podminka vetve nenormalizovana_surovina nenalezena — definice view se zmenila';
  END IF;

  nova := replace(puvodni, stara, novy);
  IF nova = puvodni THEN
    RAISE EXCEPTION 'nahrazeni podminky se nepovedlo';
  END IF;

  -- security_invoker se obnovuje explicitne — CREATE OR REPLACE VIEW ho jinak
  -- prepise na vychozi a view by obchazel RLS zdrojovych tabulek.
  EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts '
       || 'WITH (security_invoker = true) AS ' || nova;
END $$;
